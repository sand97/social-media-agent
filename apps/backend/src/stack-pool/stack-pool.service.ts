import * as crypto from 'crypto';

import { CryptoService } from '@app/common/crypto.service';
import { createHttpsAgentFromConfig } from '@app/common/utils/mtls.util';
import { ConnectorClientService } from '@app/connector-client';
import {
  ConnectionStatus,
  Prisma,
  ProvisioningServer,
  ProvisioningWorkflowRun,
  ProvisioningWorkflowStatus,
  ProvisioningWorkflowType,
  StackAssignmentStatus,
  VpsProvisioningStatus,
  WhatsAppAgent,
  WhatsAppAgentStatus,
} from '@app/generated/client';
import { PrismaService } from '@app/prisma/prisma.service';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/nestjs';
import axios from 'axios';

import { AuthGateway } from '../auth/auth.gateway';

import {
  type InfraServerContractState,
  ListProvisioningServersDto,
} from './dto/list-provisioning-servers.dto';
import { ProvisionStackCapacityDto } from './dto/provision-stack-capacity.dto';
import { ReleaseStackDto } from './dto/release-stack.dto';
import { WorkflowCallbackDto } from './dto/workflow-callback.dto';
import {
  HetznerCloudApiError,
  HetznerCloudService,
} from './hetzner-cloud.service';
import { StackPoolHetznerPollSchedulerService } from './stack-pool-hetzner-poll-scheduler.service';

type DeviceType = 'mobile' | 'desktop';

type ReserveStackParams = {
  deviceType: DeviceType;
  pairingToken: string;
  phoneNumber: string;
  userId: string;
};

type ReserveStackResult =
  | { agent: WhatsAppAgent; state: 'ready' }
  | { state: 'provisioning'; workflow: ProvisioningWorkflowRun };

type ReconcileOptions = {
  desiredMinimumFreeStacks?: number;
  deviceType?: DeviceType;
  pairingToken?: string;
  phoneNumber?: string;
  reason: string;
  requestedByUserId?: string | null;
};

@Injectable()
export class StackPoolService implements OnModuleInit {
  private readonly logger = new Logger(StackPoolService.name);
  private reconcilePromise: Promise<void> | null = null;
  private internalHttpsAgent?: ReturnType<typeof createHttpsAgentFromConfig>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly cryptoService: CryptoService,
    private readonly connectorClientService: ConnectorClientService,
    private readonly hetznerCloudService: HetznerCloudService,
    private readonly hetznerPollScheduler: StackPoolHetznerPollSchedulerService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @Inject(forwardRef(() => AuthGateway))
    private readonly authGateway: AuthGateway,
  ) {}

  private getInternalHttpsAgent() {
    if (this.internalHttpsAgent !== undefined) {
      return this.internalHttpsAgent;
    }

    this.internalHttpsAgent = createHttpsAgentFromConfig(this.configService, {
      caEnv: 'STEP_CA_ROOT_CERT',
      certEnv: 'BACKEND_MTLS_CLIENT_CERT',
      keyEnv: 'BACKEND_MTLS_CLIENT_KEY',
    });

    return this.internalHttpsAgent;
  }

  async onModuleInit() {
    if (!this.shouldProvisionOnBoot()) {
      return;
    }

    // Re-enqueue orphaned Hetzner initializations from before the restart
    await this.recoverOrphanedHetznerPolls();

    setTimeout(() => {
      this.reconcileCapacity({
        reason: 'startup-bootstrap',
      }).catch((error) => {
        this.captureException('reconcile_on_boot', error);
      });
    }, 500);
  }

  async getCapacitySummary() {
    const [servers, freeStacks, reservedStacks, allocatedStacks, pendingRuns] =
      await Promise.all([
        this.prisma.provisioningServer.groupBy({
          by: ['provisioningStatus'],
          _count: { _all: true },
        }),
        this.prisma.whatsAppAgent.count({
          where: {
            assignmentStatus: StackAssignmentStatus.FREE,
            status: WhatsAppAgentStatus.RUNNING,
          },
        }),
        this.prisma.whatsAppAgent.count({
          where: {
            assignmentStatus: StackAssignmentStatus.RESERVED,
          },
        }),
        this.prisma.whatsAppAgent.count({
          where: {
            assignmentStatus: StackAssignmentStatus.ALLOCATED,
          },
        }),
        this.prisma.provisioningWorkflowRun.count({
          where: {
            status: {
              in: [
                ProvisioningWorkflowStatus.PENDING,
                ProvisioningWorkflowStatus.DISPATCHED,
                ProvisioningWorkflowStatus.RUNNING,
              ],
            },
          },
        }),
      ]);

    return {
      allocatedStacks,
      freeStacks,
      minimumFreeStacks: this.getMinimumFreeStacks(),
      pendingWorkflowRuns: pendingRuns,
      reservedStacks,
      servers,
      stacksPerVps: this.getDefaultStacksPerVps(),
    };
  }

  async listVpsWithFreeStacks() {
    const servers = await this.prisma.provisioningServer.findMany({
      include: {
        stacks: {
          orderBy: [{ stackSlot: 'asc' }],
        },
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    return servers.map((server) => {
      const freeStacks = server.stacks.filter(
        (stack) =>
          stack.assignmentStatus === StackAssignmentStatus.FREE &&
          stack.status === WhatsAppAgentStatus.RUNNING,
      );

      return {
        freeStackCount: freeStacks.length,
        freeStacks: freeStacks.map((stack) => ({
          assignmentStatus: stack.assignmentStatus,
          connectorPort: stack.connectorPort,
          id: stack.id,
          port: stack.port,
          stackLabel: stack.stackLabel,
          stackSlot: stack.stackSlot,
          status: stack.status,
        })),
        server,
        totalStacks: server.stacks.length,
      };
    });
  }

  async listProvisioningServers(query: ListProvisioningServersDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = this.buildProvisioningServersWhere(query);

    const [total, servers] = await Promise.all([
      this.prisma.provisioningServer.count({
        where,
      }),
      this.prisma.provisioningServer.findMany({
        where,
        include: {
          stacks: {
            include: {
              user: {
                select: {
                  credits: true,
                  id: true,
                  phoneNumber: true,
                  status: true,
                },
              },
            },
            orderBy: [{ stackSlot: 'asc' }],
          },
          workflowRuns: {
            orderBy: [{ createdAt: 'desc' }],
            take: 1,
          },
        },
        orderBy: [{ requestedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: servers.map((server) => {
        const freeStacksCount = server.stacks.filter(
          (stack) =>
            stack.assignmentStatus === StackAssignmentStatus.FREE &&
            stack.status === WhatsAppAgentStatus.RUNNING,
        ).length;

        return {
          contractState: this.mapServerContractState(server.provisioningStatus),
          freeStacksCount,
          lastWorkflowRun: server.workflowRuns[0] ?? null,
          server: {
            createdAt: server.createdAt,
            id: server.id,
            location: server.location,
            metadata: server.metadata,
            name: server.name,
            networkId: server.networkId,
            plannedStacksCount: server.plannedStacksCount,
            privateIpv4: server.privateIpv4,
            privateSubnet: server.privateSubnet,
            provider: server.provider,
            providerServerId: server.providerServerId,
            provisioningStatus: server.provisioningStatus,
            publicIpv4: server.publicIpv4,
            publicIpv6: server.publicIpv6,
            readyAt: server.readyAt,
            releasedAt: server.releasedAt,
            requestedAt: server.requestedAt,
            serverType: server.serverType,
            updatedAt: server.updatedAt,
          },
          stacks: server.stacks.map((stack) => ({
            allocatedAt: stack.allocatedAt,
            assignmentStatus: stack.assignmentStatus,
            connectionStatus: stack.connectionStatus,
            connectorPort: stack.connectorPort,
            id: stack.id,
            ipAddress: stack.ipAddress,
            port: stack.port,
            releasedAt: stack.releasedAt,
            releaseReason: stack.releaseReason,
            reservationExpiresAt: stack.reservationExpiresAt,
            stackLabel: stack.stackLabel,
            stackSlot: stack.stackSlot,
            status: stack.status,
            updatedAt: stack.updatedAt,
            user: stack.user,
          })),
          totalStacks: server.stacks.length,
        };
      }),
      page,
      pageSize,
      total,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
    };
  }

  async reserveStackForLogin(
    params: ReserveStackParams,
  ): Promise<ReserveStackResult> {
    const existingAgent = await this.prisma.whatsAppAgent.findUnique({
      where: { userId: params.userId },
    });

    if (existingAgent) {
      await this.primeSessionRouting(existingAgent, params);
      return {
        agent: existingAgent,
        state: 'ready',
      };
    }

    const candidate = await this.prisma.whatsAppAgent.findFirst({
      where: {
        assignmentStatus: StackAssignmentStatus.FREE,
        server: {
          provisioningStatus: {
            in: [VpsProvisioningStatus.READY, VpsProvisioningStatus.DEGRADED],
          },
        },
        status: WhatsAppAgentStatus.RUNNING,
      },
      orderBy: [{ createdAt: 'asc' }],
    });

    if (candidate) {
      const agent = await this.prisma.whatsAppAgent.update({
        where: { id: candidate.id },
        data: {
          allocatedAt: new Date(),
          assignmentStatus: StackAssignmentStatus.RESERVED,
          releasedAt: null,
          releaseReason: null,
          reservationExpiresAt: this.buildReservationExpiry(),
          userId: params.userId,
        },
      });

      await this.primeSessionRouting(agent, params);

      void this.reconcileCapacity({
        deviceType: params.deviceType,
        pairingToken: params.pairingToken,
        phoneNumber: params.phoneNumber,
        reason: 'post-reservation',
        requestedByUserId: params.userId,
      }).catch((error) => {
        this.captureException('reconcile_after_reservation', error, {
          userId: params.userId,
        });
      });

      return {
        agent,
        state: 'ready',
      };
    }

    const [workflow] = await this.provisionCapacity(
      {
        deviceType: params.deviceType,
        pairingToken: params.pairingToken,
        phoneNumber: params.phoneNumber,
        reason: 'user-demand-no-free-stack',
        serverType: this.getDefaultServerType(),
        stacksPerVps: this.getDefaultStacksPerVps(),
        vpsCount: 1,
      },
      params.userId,
    );

    if (!workflow) {
      throw new ServiceUnavailableException(
        'Aucune stack libre et la demande de provisioning a échoué.',
      );
    }

    this.emitProvisioningUpdate(params.pairingToken, {
      completedJobs: 0,
      progress: 0,
      stage: 'SERVER_INITIALIZING',
      status: 'running',
      workflowId: workflow.id,
    });

    return {
      state: 'provisioning',
      workflow,
    };
  }

  async markUserStackConnected(userId: string) {
    const agent = await this.prisma.whatsAppAgent.findUnique({
      where: { userId },
    });

    if (!agent) {
      return null;
    }

    return this.prisma.whatsAppAgent.update({
      where: { id: agent.id },
      data: {
        assignmentStatus: StackAssignmentStatus.ALLOCATED,
        reservationExpiresAt: null,
      },
    });
  }

  async provisionCapacity(
    dto: ProvisionStackCapacityDto,
    requestedByUserId?: string | null,
  ) {
    const requestedVpsCount = dto.vpsCount ?? 1;
    const stacksPerVps = dto.stacksPerVps ?? this.getDefaultStacksPerVps();
    const serverType = dto.serverType
      ? this.sanitizeServerType(dto.serverType, this.getDefaultServerType())
      : this.getDefaultServerType();
    const installWorkflowFile = this.getProvisionWorkflowFile();
    const location = this.sanitizeLocation(
      dto.location ?? this.getDefaultLocation(),
      this.getDefaultLocation(),
    );

    const runs: ProvisioningWorkflowRun[] = [];

    this.logger.log(
      `[provision_capacity] requested_vps_count=${requestedVpsCount} stacks_per_vps=${stacksPerVps} server_type=${serverType} location=${location} reason=${dto.reason ?? 'manual'}`,
    );

    for (let index = 0; index < requestedVpsCount; index += 1) {
      const server = await this.prisma.provisioningServer.create({
        data: {
          location,
          metadata: {
            requestedPhoneNumber: dto.phoneNumber ?? null,
            requestedVia: dto.reason ?? 'manual',
          },
          name: this.buildServerName(),
          plannedStacksCount: stacksPerVps,
          provisioningStatus: VpsProvisioningStatus.REQUESTED,
          serverType,
        },
      });

      this.logger.log(
        `[provision_capacity] server_record_created workflow_index=${index + 1}/${requestedVpsCount} server=${server.id} name=${server.name} planned_stacks=${server.plannedStacksCount} status=${server.provisioningStatus}`,
      );

      let workflow = await this.prisma.provisioningWorkflowRun.create({
        data: {
          githubRef: this.getGithubRef(),
          githubWorkflowFile: installWorkflowFile,
          currentStage: 'SERVER_INITIALIZING',
          pairingToken: dto.pairingToken,
          payload: {
            location: server.location,
            reason: dto.reason ?? 'manual',
            serverName: server.name,
            serverType: server.serverType,
          },
          progressPercent: 0,
          requestedByUserId,
          requestedPhoneNumber: dto.phoneNumber,
          requestedStacksPerVps: stacksPerVps,
          requestedVpsCount: 1,
          serverId: server.id,
          startedAt: new Date(),
          status: ProvisioningWorkflowStatus.RUNNING,
          targetDeviceType: dto.deviceType,
          totalJobs: 3,
          type: ProvisioningWorkflowType.PROVISION_CAPACITY,
        },
      });

      this.logger.log(
        `[provision_capacity] workflow_record_created workflow=${workflow.id} server=${server.id} stage=${workflow.currentStage} status=${workflow.status} github_workflow=${workflow.githubWorkflowFile}`,
      );

      try {
        this.logger.log(
          `[provision_capacity] creating_hetzner_server workflow=${workflow.id} server=${server.id} name=${server.name} type=${server.serverType} location=${server.location}`,
        );

        const createResult = await this.hetznerCloudService.createServer({
          location: server.location ?? location,
          name: server.name,
          serverType: server.serverType,
          sshKeyNames: this.getHetznerSshKeyNames(),
        });

        this.logger.log(
          `[provision_capacity] hetzner_server_created workflow=${workflow.id} server=${server.id} provider_server_id=${createResult.server.id} action_id=${createResult.action.id} action_status=${createResult.action.status} action_progress=${createResult.action.progress ?? 0} public_ipv4=${createResult.server.public_net?.ipv4?.ip ?? 'pending'}`,
        );

        workflow = await this.prisma.provisioningWorkflowRun.update({
          where: { id: workflow.id },
          data: {
            payload: {
              ...(this.asObject(workflow.payload) || {}),
              hetznerActionId: String(createResult.action.id),
              installWorkflowFile,
              providerServerId: String(createResult.server.id),
            },
            progressPercent: this.scaleServerInitializationProgress(
              createResult.action.progress ?? 0,
            ),
          },
        });

        await this.prisma.provisioningServer.update({
          where: { id: server.id },
          data: {
            metadata: {
              ...(this.asObject(server.metadata) || {}),
              hetznerActionId: String(createResult.action.id),
            },
            privateIpv4:
              createResult.server.private_net?.[0]?.ip || server.privateIpv4,
            providerServerId: String(createResult.server.id),
            provisioningStatus: VpsProvisioningStatus.PROVISIONING,
            publicIpv4:
              createResult.server.public_net?.ipv4?.ip || server.publicIpv4,
            publicIpv6:
              createResult.server.public_net?.ipv6?.ip || server.publicIpv6,
          },
        });

        if (dto.pairingToken) {
          this.emitProvisioningUpdate(dto.pairingToken, {
            completedJobs: 0,
            progress: this.scaleServerInitializationProgress(
              createResult.action.progress ?? 0,
            ),
            stage: 'SERVER_INITIALIZING',
            status: 'running',
            workflowId: workflow.id,
          });
        }

        // Enqueue the first Hetzner poll for this workflow
        await this.hetznerPollScheduler.enqueueHetznerPoll(workflow.id);
      } catch (error) {
        this.logger.error(
          `[provision_capacity] create_hetzner_server_failed workflow=${workflow.id} server=${server.id} error=${this.stringifyError(error)}`,
        );
        this.captureException('create_hetzner_server', error, {
          serverId: server.id,
          workflowId: workflow.id,
        });

        workflow = await this.prisma.provisioningWorkflowRun.update({
          where: { id: workflow.id },
          data: {
            completedAt: new Date(),
            errorMessage: this.stringifyError(error),
            status: ProvisioningWorkflowStatus.FAILED,
          },
        });

        await this.prisma.provisioningServer.update({
          where: { id: server.id },
          data: {
            provisioningStatus: VpsProvisioningStatus.ERROR,
          },
        });

        if (dto.pairingToken) {
          this.emitProvisioningUpdate(dto.pairingToken, {
            completedJobs: 0,
            progress: 0,
            stage: 'SERVER_INITIALIZING',
            status: 'failed',
            workflowId: workflow.id,
          });
          this.authGateway.emitConnectionError(
            dto.pairingToken,
            'Le serveur na pas pu être créé chez Hetzner.',
          );
        }
      }

      runs.push(workflow);
    }

    return runs;
  }

  async reconcileCapacity(options: ReconcileOptions) {
    if (this.reconcilePromise) {
      return this.reconcilePromise;
    }

    this.reconcilePromise = this.performReconcile(options).finally(() => {
      this.reconcilePromise = null;
    });

    return this.reconcilePromise;
  }

  async releaseCapacity(dto: ReleaseStackDto) {
    if (dto.userId || dto.agentId) {
      return this.releaseStackAssignment(dto);
    }

    if (!dto.serverId) {
      throw new ServiceUnavailableException(
        'serverId, userId ou agentId est requis pour libérer une capacité.',
      );
    }

    const server = await this.prisma.provisioningServer.findUnique({
      where: { id: dto.serverId },
    });

    if (!server) {
      throw new ServiceUnavailableException('Serveur introuvable.');
    }

    const workflow = await this.prisma.provisioningWorkflowRun.create({
      data: {
        githubRef: this.getGithubRef(),
        githubWorkflowFile: this.getReleaseWorkflowFile(),
        metadata: {
          deleteServerWhenEmpty: dto.deleteServerWhenEmpty ?? false,
          reason: dto.reason ?? 'manual-release',
        },
        serverId: server.id,
        type: ProvisioningWorkflowType.RELEASE_CAPACITY,
      },
    });

    await this.dispatchGithubWorkflow(this.getReleaseWorkflowFile(), {
      backend_callback_url: this.getWorkflowCallbackUrl(),
      delete_server_when_empty: String(dto.deleteServerWhenEmpty ?? false),
      provider_server_id: server.providerServerId ?? '',
      reason: dto.reason ?? 'manual-release',
      server_name: server.name,
      server_record_id: server.id,
      workflow_record_id: workflow.id,
    });

    await this.prisma.provisioningWorkflowRun.update({
      where: { id: workflow.id },
      data: {
        startedAt: new Date(),
        status: ProvisioningWorkflowStatus.DISPATCHED,
      },
    });

    await this.prisma.provisioningServer.update({
      where: { id: server.id },
      data: {
        provisioningStatus: VpsProvisioningStatus.RELEASE_REQUESTED,
      },
    });

    return {
      message: 'Workflow de release déclenché.',
      workflowId: workflow.id,
    };
  }

  async handleWorkflowCallback(dto: WorkflowCallbackDto) {
    this.assertCallbackSecret(dto.callbackSecret);

    const workflow = await this.findWorkflow(dto);
    if (!workflow) {
      throw new ServiceUnavailableException('Workflow callback introuvable.');
    }

    const workflowStatus = this.mapWorkflowStatus(dto.status);
    const totalJobs = dto.totalJobs ?? workflow.totalJobs;
    const completedJobs = dto.completedJobs ?? workflow.completedJobs;
    const progressPercent =
      dto.progressPercent ??
      this.computeProgressPercent(completedJobs, totalJobs, dto.status);

    const updatedWorkflow = await this.prisma.provisioningWorkflowRun.update({
      where: { id: workflow.id },
      data: {
        completedAt:
          workflowStatus === ProvisioningWorkflowStatus.SUCCEEDED ||
          workflowStatus === ProvisioningWorkflowStatus.FAILED ||
          workflowStatus === ProvisioningWorkflowStatus.CANCELED
            ? new Date()
            : null,
        completedJobs,
        currentStage: dto.stage ?? workflow.currentStage,
        errorMessage: dto.errorMessage ?? null,
        githubRunId: dto.githubRunId ?? workflow.githubRunId,
        githubRunUrl: dto.githubRunUrl ?? workflow.githubRunUrl,
        progressPercent,
        startedAt: workflow.startedAt ?? new Date(),
        status: workflowStatus,
        totalJobs,
      },
      include: {
        server: true,
      },
    });

    const server = dto.server
      ? await this.upsertProvisioningServer(updatedWorkflow, dto)
      : updatedWorkflow.server;

    if (server && dto.stacks?.length) {
      await this.upsertProvisionedStacks(server, dto.stacks);
      await this.verifyProvisionedConnectivity(server, dto.stacks);
    }

    if (server && workflow.type === ProvisioningWorkflowType.RELEASE_CAPACITY) {
      await this.handleReleaseCallback(server, updatedWorkflow, dto.status);
    }

    if (updatedWorkflow.pairingToken) {
      this.emitProvisioningUpdate(updatedWorkflow.pairingToken, {
        completedJobs,
        progress: progressPercent,
        stage: dto.stage ?? updatedWorkflow.currentStage ?? 'STACK_INSTALLING',
        status: dto.status,
        workflowId: updatedWorkflow.id,
      });
    }

    if (
      dto.status === 'success' &&
      updatedWorkflow.type === ProvisioningWorkflowType.PROVISION_CAPACITY
    ) {
      await this.finalizeProvisionedUserSession(updatedWorkflow, server);
    }

    return {
      progressPercent,
      status: updatedWorkflow.status,
      workflowId: updatedWorkflow.id,
    };
  }

  /**
   * Advance a single Hetzner initialization workflow.
   * Returns `true` if the workflow is still pending (caller should re-poll).
   * Returns `false` if it's done (success, error, or missing).
   */
  async advanceHetznerInitialization(workflowId: string): Promise<boolean> {
    try {
      const workflow = await this.prisma.provisioningWorkflowRun.findUnique({
        where: { id: workflowId },
        include: { server: true },
      });

      if (!workflow) {
        this.logger.warn(
          `[hetzner_init] workflow_not_found workflow=${workflowId}`,
        );
        return false;
      }

      // Already past SERVER_INITIALIZING → nothing to poll
      if (workflow.currentStage !== 'SERVER_INITIALIZING') {
        return false;
      }

      // Terminal states → done
      if (
        workflow.status === ProvisioningWorkflowStatus.SUCCEEDED ||
        workflow.status === ProvisioningWorkflowStatus.FAILED ||
        workflow.status === ProvisioningWorkflowStatus.CANCELED
      ) {
        return false;
      }

      if (!workflow.server?.providerServerId) {
        this.logger.warn(
          `[hetzner_init] no_provider_server_id workflow=${workflowId}`,
        );
        return false;
      }

      await this.advanceServerInitialization(workflow);

      // Re-read to check if it moved past SERVER_INITIALIZING
      const updated = await this.prisma.provisioningWorkflowRun.findUnique({
        where: { id: workflowId },
        select: { currentStage: true, status: true },
      });

      if (!updated) {
        return false;
      }

      const isTerminal =
        updated.status === ProvisioningWorkflowStatus.SUCCEEDED ||
        updated.status === ProvisioningWorkflowStatus.FAILED ||
        updated.status === ProvisioningWorkflowStatus.CANCELED;

      return !isTerminal && updated.currentStage === 'SERVER_INITIALIZING';
    } catch (error) {
      this.logger.error(
        `[hetzner_init] failed workflow=${workflowId} error=${this.stringifyError(error)}`,
      );
      this.captureException('hetzner_init', error, { workflowId });
      // Return true to retry on transient errors
      return true;
    }
  }

  /**
   * On boot, re-enqueue poll jobs for workflows stuck in SERVER_INITIALIZING.
   * This covers the case where the backend restarted mid-provisioning.
   */
  private async recoverOrphanedHetznerPolls(): Promise<void> {
    const orphans = await this.prisma.provisioningWorkflowRun.findMany({
      where: {
        currentStage: 'SERVER_INITIALIZING',
        server: {
          is: {
            providerServerId: { not: null },
          },
        },
        status: {
          in: [
            ProvisioningWorkflowStatus.PENDING,
            ProvisioningWorkflowStatus.RUNNING,
            ProvisioningWorkflowStatus.DISPATCHED,
          ],
        },
        type: ProvisioningWorkflowType.PROVISION_CAPACITY,
      },
      select: { id: true },
    });

    if (orphans.length === 0) {
      return;
    }

    this.logger.log(
      `[recover_orphaned_polls] found ${orphans.length} orphaned Hetzner initialization(s), re-enqueuing`,
    );

    for (const orphan of orphans) {
      await this.hetznerPollScheduler.enqueueHetznerPoll(orphan.id);
    }
  }

  private async advanceServerInitialization(
    workflow: ProvisioningWorkflowRun & { server: ProvisioningServer | null },
  ) {
    if (!workflow.server) {
      return;
    }

    const payload = this.asObject(workflow.payload) || {};
    const actionId = Number.parseInt(`${payload.hetznerActionId ?? ''}`, 10);
    const providerServerId = Number.parseInt(
      `${workflow.server.providerServerId ?? payload.providerServerId ?? ''}`,
      10,
    );

    if (!Number.isFinite(actionId) || !Number.isFinite(providerServerId)) {
      this.logger.warn(
        `[server_initialization] missing_identifiers workflow=${workflow.id} server=${workflow.server.id} action_id=${payload.hetznerActionId ?? '<missing>'} provider_server_id=${workflow.server.providerServerId ?? payload.providerServerId ?? '<missing>'}`,
      );
      return;
    }

    try {
      const actionResponse = await this.hetznerCloudService.getAction(actionId);
      const action = actionResponse.action;

      this.logger.log(
        `[server_initialization] workflow=${workflow.id} server=${workflow.server.id} provider_server_id=${providerServerId} action_id=${actionId} status=${action.status} progress=${action.progress ?? 0}`,
      );

      if (action.status === 'running') {
        await this.updateServerInitializationProgress(
          workflow,
          action.progress ?? 0,
        );
        return;
      }

      if (action.status === 'error') {
        await this.failServerInitialization(
          workflow,
          action.error?.message ||
            `Hetzner action ${actionId} failed during server creation.`,
        );
        return;
      }

      const serverResponse =
        await this.hetznerCloudService.getServer(providerServerId);
      const providerServer = serverResponse.server;

      const updatedServer = await this.prisma.provisioningServer.update({
        where: { id: workflow.server.id },
        data: {
          location:
            providerServer.datacenter?.location?.name ||
            workflow.server.location,
          privateIpv4:
            providerServer.private_net?.[0]?.ip || workflow.server.privateIpv4,
          providerServerId: String(providerServer.id),
          provisioningStatus: VpsProvisioningStatus.PROVISIONING,
          publicIpv4:
            providerServer.public_net?.ipv4?.ip || workflow.server.publicIpv4,
          publicIpv6:
            providerServer.public_net?.ipv6?.ip || workflow.server.publicIpv6,
          serverType:
            providerServer.server_type?.name || workflow.server.serverType,
        },
      });

      this.logger.log(
        `[server_initialization] provider_server_ready workflow=${workflow.id} server=${workflow.server.id} provider_server_id=${providerServer.id} public_ipv4=${updatedServer.publicIpv4 ?? 'missing'} private_ipv4=${updatedServer.privateIpv4 ?? 'missing'} location=${updatedServer.location ?? 'missing'}`,
      );

      if (!updatedServer.publicIpv4) {
        this.logger.warn(
          `[server_initialization] waiting_for_public_ipv4 workflow=${workflow.id} server=${workflow.server.id} provider_server_id=${providerServer.id}`,
        );
        await this.updateServerInitializationProgress(workflow, 100);
        return;
      }

      await this.dispatchInstallWorkflowForServer(workflow, updatedServer);
    } catch (error) {
      if (this.isHetznerResourceMissing(error)) {
        await this.markServerDeletedDuringInitialization(
          workflow,
          providerServerId,
          error,
        );
        return;
      }

      this.logger.error(
        `[server_initialization] failed workflow=${workflow.id} server=${workflow.server.id} error=${this.stringifyError(error)}`,
      );
      await this.failServerInitialization(
        workflow,
        this.stringifyError(error),
        error,
      );
    }
  }

  private async updateServerInitializationProgress(
    workflow: ProvisioningWorkflowRun,
    providerProgress: number,
  ) {
    const progressPercent =
      this.scaleServerInitializationProgress(providerProgress);

    this.logger.log(
      `[server_initialization_progress] workflow=${workflow.id} provider_progress=${providerProgress} scaled_progress=${progressPercent}`,
    );

    const updatedWorkflow = await this.prisma.provisioningWorkflowRun.update({
      where: { id: workflow.id },
      data: {
        completedJobs: 0,
        currentStage: 'SERVER_INITIALIZING',
        progressPercent,
        startedAt: workflow.startedAt ?? new Date(),
        status: ProvisioningWorkflowStatus.RUNNING,
        totalJobs: 3,
      },
    });

    if (updatedWorkflow.pairingToken) {
      this.emitProvisioningUpdate(updatedWorkflow.pairingToken, {
        completedJobs: 0,
        progress: progressPercent,
        stage: 'SERVER_INITIALIZING',
        status: 'running',
        workflowId: updatedWorkflow.id,
      });
    }
  }

  private async dispatchInstallWorkflowForServer(
    workflow: ProvisioningWorkflowRun,
    server: ProvisioningServer,
  ) {
    const payload = this.asObject(workflow.payload) || {};
    const installInputs = {
      backend_callback_url: this.getWorkflowCallbackUrl(),
      location: server.location ?? this.getDefaultLocation(),
      private_ipv4: server.privateIpv4 ?? '',
      provider_server_id: server.providerServerId ?? '',
      public_ipv4: server.publicIpv4 ?? '',
      requested_phone_number: workflow.requestedPhoneNumber ?? '',
      server_name: server.name,
      server_record_id: server.id,
      server_type: server.serverType,
      stacks_per_vps: String(
        server.plannedStacksCount || workflow.requestedStacksPerVps,
      ),
      target_device_type: workflow.targetDeviceType ?? '',
      workflow_record_id: workflow.id,
    };

    try {
      this.logger.log(
        `[dispatch_install_workflow] workflow=${workflow.id} server=${server.id} workflow_file=${this.getProvisionWorkflowFile()} public_ipv4=${installInputs.public_ipv4} private_ipv4=${installInputs.private_ipv4 || 'missing'} callback_url=${installInputs.backend_callback_url}`,
      );

      await this.dispatchGithubWorkflow(
        this.getProvisionWorkflowFile(),
        installInputs,
      );

      const updatedWorkflow = await this.prisma.provisioningWorkflowRun.update({
        where: { id: workflow.id },
        data: {
          completedJobs: 1,
          currentStage: 'STACK_INSTALLING',
          payload: {
            ...payload,
            installWorkflowDispatchedAt: new Date().toISOString(),
          },
          progressPercent: 33,
          status: ProvisioningWorkflowStatus.DISPATCHED,
        },
      });

      if (updatedWorkflow.pairingToken) {
        this.emitProvisioningUpdate(updatedWorkflow.pairingToken, {
          completedJobs: 1,
          progress: 33,
          stage: 'STACK_INSTALLING',
          status: 'running',
          workflowId: updatedWorkflow.id,
        });
      }
    } catch (error) {
      await this.failServerInitialization(
        { ...workflow, server },
        `GitHub install workflow dispatch failed: ${this.stringifyError(error)}`,
        error,
      );
    }
  }

  private async failServerInitialization(
    workflow: ProvisioningWorkflowRun & { server: ProvisioningServer | null },
    errorMessage: string,
    error?: unknown,
    serverStatus: VpsProvisioningStatus = VpsProvisioningStatus.ERROR,
  ) {
    if (error) {
      this.captureException('server_initialization_failed', error, {
        serverId: workflow.serverId,
        workflowId: workflow.id,
      });
    } else {
      this.logger.error(
        `[server_initialization_failed] workflow=${workflow.id} ${errorMessage}`,
      );
    }

    await this.prisma.provisioningWorkflowRun.update({
      where: { id: workflow.id },
      data: {
        completedAt: new Date(),
        errorMessage,
        status: ProvisioningWorkflowStatus.FAILED,
      },
    });

    if (workflow.serverId) {
      await this.prisma.provisioningServer.update({
        where: { id: workflow.serverId },
        data: {
          provisioningStatus: serverStatus,
        },
      });

      this.logger.error(
        `[server_initialization_failed] server_status_updated workflow=${workflow.id} server=${workflow.serverId} status=${serverStatus} message=${errorMessage}`,
      );
    }

    if (workflow.pairingToken) {
      this.emitProvisioningUpdate(workflow.pairingToken, {
        completedJobs: 0,
        progress: workflow.progressPercent,
        stage: 'SERVER_INITIALIZING',
        status: 'failed',
        workflowId: workflow.id,
      });
      this.authGateway.emitConnectionError(workflow.pairingToken, errorMessage);
    }
  }

  private buildProvisioningServersWhere(
    query: ListProvisioningServersDto,
  ): Prisma.ProvisioningServerWhereInput {
    const conditions: Prisma.ProvisioningServerWhereInput[] = [];

    if (query.contractState) {
      conditions.push(this.buildContractStateWhere(query.contractState));
    }

    if (query.provisioningStatus) {
      conditions.push({
        provisioningStatus: query.provisioningStatus,
      });
    }

    if (query.requestedFrom || query.requestedTo) {
      conditions.push({
        requestedAt: {
          ...(query.requestedFrom
            ? { gte: new Date(query.requestedFrom) }
            : {}),
          ...(query.requestedTo ? { lte: new Date(query.requestedTo) } : {}),
        },
      });
    }

    if (conditions.length === 0) {
      return {};
    }

    return {
      AND: conditions,
    };
  }

  private buildContractStateWhere(
    contractState: InfraServerContractState,
  ): Prisma.ProvisioningServerWhereInput {
    if (contractState === 'terminated') {
      return {
        provisioningStatus: VpsProvisioningStatus.RELEASED,
      };
    }

    return {
      provisioningStatus: {
        not: VpsProvisioningStatus.RELEASED,
      },
    };
  }

  private mapServerContractState(
    provisioningStatus: VpsProvisioningStatus,
  ): InfraServerContractState {
    return provisioningStatus === VpsProvisioningStatus.RELEASED
      ? 'terminated'
      : 'active';
  }

  private async performReconcile(options: ReconcileOptions) {
    const desiredMinimumFreeStacks =
      options.desiredMinimumFreeStacks ?? this.getMinimumFreeStacks();
    const bootstrapVpsCount = this.getBootstrapVpsCount();

    const [readyFreeStacks, activeServers, pendingServers] = await Promise.all([
      this.prisma.whatsAppAgent.count({
        where: {
          assignmentStatus: StackAssignmentStatus.FREE,
          status: WhatsAppAgentStatus.RUNNING,
        },
      }),
      this.prisma.provisioningServer.count({
        where: {
          provisioningStatus: {
            in: [
              VpsProvisioningStatus.PROVISIONING,
              VpsProvisioningStatus.READY,
              VpsProvisioningStatus.DEGRADED,
              VpsProvisioningStatus.REQUESTED,
            ],
          },
        },
      }),
      this.prisma.provisioningServer.findMany({
        where: {
          provisioningStatus: {
            in: [
              VpsProvisioningStatus.PROVISIONING,
              VpsProvisioningStatus.REQUESTED,
            ],
          },
        },
        select: {
          plannedStacksCount: true,
        },
      }),
    ]);

    const pendingStackCapacity = pendingServers.reduce(
      (sum, server) => sum + server.plannedStacksCount,
      0,
    );

    const missingBootstrapServers = Math.max(
      bootstrapVpsCount - activeServers,
      0,
    );
    const effectiveFreeCapacity = readyFreeStacks + pendingStackCapacity;
    const missingStacks = Math.max(
      desiredMinimumFreeStacks - effectiveFreeCapacity,
      0,
    );
    const missingServersForFreeStacks =
      missingStacks === 0
        ? 0
        : Math.ceil(missingStacks / this.getDefaultStacksPerVps());
    const serversToProvision = Math.max(
      missingBootstrapServers,
      missingServersForFreeStacks,
    );

    if (serversToProvision <= 0) {
      return;
    }

    await this.provisionCapacity(
      {
        deviceType: options.deviceType,
        pairingToken: options.pairingToken,
        phoneNumber: options.phoneNumber,
        reason: options.reason,
        stacksPerVps: this.getDefaultStacksPerVps(),
        vpsCount: serversToProvision,
      },
      options.requestedByUserId,
    );
  }

  private async releaseStackAssignment(dto: ReleaseStackDto) {
    const agent = await this.prisma.whatsAppAgent.findFirst({
      where: dto.agentId
        ? { id: dto.agentId }
        : dto.userId
          ? { userId: dto.userId }
          : undefined,
    });

    if (!agent) {
      return {
        message: 'Aucune stack réservée à libérer.',
      };
    }

    await this.clearSessionRouting(agent);

    const releasedAgent = await this.prisma.whatsAppAgent.update({
      where: { id: agent.id },
      data: {
        allocatedAt: null,
        assignmentStatus: StackAssignmentStatus.FREE,
        releasedAt: new Date(),
        releaseReason: dto.reason ?? 'manual-release',
        reservationExpiresAt: null,
        userId: null,
      },
    });

    void this.reconcileCapacity({
      reason: 'post-release',
    }).catch((error) => {
      this.captureException('reconcile_after_release', error, {
        agentId: agent.id,
      });
    });

    return {
      agent: releasedAgent,
      message: 'Stack libérée.',
    };
  }

  private async finalizeProvisionedUserSession(
    workflow: ProvisioningWorkflowRun,
    server: ProvisioningServer | null,
  ) {
    if (!workflow.requestedByUserId || !workflow.pairingToken || !server) {
      return;
    }

    let agent = await this.prisma.whatsAppAgent.findUnique({
      where: { userId: workflow.requestedByUserId },
    });

    if (!agent) {
      const freeServerStack = await this.prisma.whatsAppAgent.findFirst({
        where: {
          assignmentStatus: StackAssignmentStatus.FREE,
          serverId: server.id,
          status: WhatsAppAgentStatus.RUNNING,
        },
        orderBy: [{ stackSlot: 'asc' }],
      });

      if (!freeServerStack) {
        return;
      }

      agent = await this.prisma.whatsAppAgent.update({
        where: { id: freeServerStack.id },
        data: {
          allocatedAt: new Date(),
          assignmentStatus: StackAssignmentStatus.RESERVED,
          reservationExpiresAt: this.buildReservationExpiry(),
          userId: workflow.requestedByUserId,
        },
      });
    }

    await this.primeSessionRouting(agent, {
      deviceType: (workflow.targetDeviceType as DeviceType) || 'desktop',
      pairingToken: workflow.pairingToken,
      phoneNumber: workflow.requestedPhoneNumber || '',
      userId: workflow.requestedByUserId,
    });

    if (!workflow.requestedPhoneNumber) {
      return;
    }

    try {
      await this.startAuthenticationForAssignedStack(agent, workflow);
    } catch (error) {
      this.captureException('start_authentication_after_provision', error, {
        agentId: agent.id,
        workflowId: workflow.id,
      });

      this.authGateway.emitConnectionError(
        workflow.pairingToken,
        'La stack est prête mais la session WhatsApp n’a pas pu démarrer.',
      );
    }
  }

  private async startAuthenticationForAssignedStack(
    agent: WhatsAppAgent,
    workflow: ProvisioningWorkflowRun,
  ) {
    const connectorUrl = this.buildConnectorUrl(agent);
    const deviceType = (workflow.targetDeviceType as DeviceType) || 'desktop';

    this.emitProvisioningUpdate(workflow.pairingToken!, {
      completedJobs: workflow.totalJobs,
      progress: Math.max(workflow.progressPercent, 90),
      stage: 'STACK_STARTING',
      status: 'running',
      workflowId: workflow.id,
    });

    await this.connectorClientService.startClient(connectorUrl, {
      targetInstanceId: this.getConnectorInstanceId(agent),
    });
    await this.delay(3000);

    if (deviceType === 'mobile') {
      const result = await this.connectorClientService.requestPairingCode(
        connectorUrl,
        workflow.requestedPhoneNumber!,
        {
          targetInstanceId: this.getConnectorInstanceId(agent),
        },
      );

      this.authGateway.emitPairingCodeReady(
        workflow.pairingToken!,
        result.code,
        workflow.requestedPhoneNumber!,
      );

      return;
    }

    this.emitProvisioningUpdate(workflow.pairingToken!, {
      completedJobs: workflow.totalJobs,
      progress: 96,
      stage: 'QR_FETCHING',
      status: 'running',
      workflowId: workflow.id,
    });

    try {
      const qr = await this.connectorClientService.getQRCode(connectorUrl, {
        targetInstanceId: this.getConnectorInstanceId(agent),
      });
      if (qr.success && qr.qrCode) {
        this.authGateway.emitQRCode(workflow.pairingToken!, qr.qrCode);
      }
    } catch {
      // The webhook path remains the primary source for QR updates.
    }
  }

  private async upsertProvisioningServer(
    workflow: ProvisioningWorkflowRun & { server: ProvisioningServer | null },
    dto: WorkflowCallbackDto,
  ) {
    const currentServer = workflow.server;
    const serverName =
      dto.server?.name || currentServer?.name || this.buildServerName();

    const server = currentServer
      ? await this.prisma.provisioningServer.update({
          where: { id: currentServer.id },
          data: {
            location: dto.server?.location ?? currentServer.location,
            metadata: this.toJsonInput(dto.metadata ?? currentServer.metadata),
            name: serverName,
            networkId: dto.server?.networkId ?? currentServer.networkId,
            privateIpv4: dto.server?.privateIpv4 ?? currentServer.privateIpv4,
            privateSubnet:
              dto.server?.privateSubnet ?? currentServer.privateSubnet,
            providerServerId:
              dto.server?.providerServerId ?? currentServer.providerServerId,
            provisioningStatus: this.mapServerStatus(dto.status),
            publicIpv4: dto.server?.publicIpv4 ?? currentServer.publicIpv4,
            publicIpv6: dto.server?.publicIpv6 ?? currentServer.publicIpv6,
            readyAt:
              dto.status === 'success' ? new Date() : currentServer.readyAt,
            serverType: dto.server?.serverType ?? currentServer.serverType,
          },
        })
      : await this.prisma.provisioningServer.create({
          data: {
            location: dto.server?.location,
            metadata: this.toJsonInput(dto.metadata),
            name: serverName,
            networkId: dto.server?.networkId,
            plannedStacksCount:
              dto.stacks?.length ?? workflow.requestedStacksPerVps,
            privateIpv4: dto.server?.privateIpv4,
            privateSubnet: dto.server?.privateSubnet,
            providerServerId: dto.server?.providerServerId,
            provisioningStatus: this.mapServerStatus(dto.status),
            publicIpv4: dto.server?.publicIpv4,
            publicIpv6: dto.server?.publicIpv6,
            readyAt: dto.status === 'success' ? new Date() : null,
            serverType: dto.server?.serverType ?? this.getDefaultServerType(),
          },
        });

    if (!workflow.serverId || workflow.serverId !== server.id) {
      await this.prisma.provisioningWorkflowRun.update({
        where: { id: workflow.id },
        data: {
          serverId: server.id,
        },
      });
    }

    return server;
  }

  private async upsertProvisionedStacks(
    server: ProvisioningServer,
    stacks: NonNullable<WorkflowCallbackDto['stacks']>,
  ) {
    for (const stack of stacks) {
      const existing = await this.prisma.whatsAppAgent.findFirst({
        where: {
          serverId: server.id,
          stackSlot: stack.stackSlot,
        },
      });

      const baseMetadata = {
        connectorInstanceId: stack.stackLabel || `stack-${stack.stackSlot}`,
        publicBaseUrl: stack.publicBaseUrl ?? null,
        qdrantGrpcPort: stack.qdrantGrpcPort ?? null,
        qdrantHttpPort: stack.qdrantHttpPort ?? null,
        redisPort: stack.redisPort ?? null,
        serverType: server.serverType,
      };

      if (existing) {
        await this.prisma.whatsAppAgent.update({
          where: { id: existing.id },
          data: {
            assignmentStatus:
              existing.assignmentStatus === StackAssignmentStatus.ERROR
                ? StackAssignmentStatus.FREE
                : existing.assignmentStatus,
            connectorPort: stack.connectorPort,
            ipAddress:
              stack.privateIpv4 ||
              server.privateIpv4 ||
              server.publicIpv4 ||
              '0.0.0.0',
            metadata: {
              ...(this.asObject(existing.metadata) || {}),
              ...baseMetadata,
            },
            port: stack.agentPort,
            serverId: server.id,
            stackLabel: stack.stackLabel || existing.stackLabel,
            stackSlot: stack.stackSlot,
            status: WhatsAppAgentStatus.RUNNING,
          },
        });
        continue;
      }

      await this.prisma.whatsAppAgent.create({
        data: {
          assignmentStatus: StackAssignmentStatus.FREE,
          connectionStatus: ConnectionStatus.PAIRING_REQUIRED,
          connectorPort: stack.connectorPort,
          encryptedPassword: this.cryptoService.encrypt(
            this.generateRandomPassword(),
          ),
          ipAddress:
            stack.privateIpv4 ||
            server.privateIpv4 ||
            server.publicIpv4 ||
            '0.0.0.0',
          metadata: baseMetadata,
          port: stack.agentPort,
          serverId: server.id,
          stackLabel: stack.stackLabel || `stack-${stack.stackSlot}`,
          stackSlot: stack.stackSlot,
          status: WhatsAppAgentStatus.RUNNING,
        },
      });
    }
  }

  private async verifyProvisionedConnectivity(
    server: ProvisioningServer,
    stacks: NonNullable<WorkflowCallbackDto['stacks']>,
  ) {
    for (const stack of stacks) {
      const baseIp = stack.privateIpv4 || server.privateIpv4;
      if (!baseIp) {
        continue;
      }

      const publicIp = server.publicIpv4 || baseIp;
      const healthTargets = [
        `https://${publicIp}:${stack.agentPort}/health`,
        `https://${publicIp}:${stack.connectorPort}/health`,
      ];

      for (const target of healthTargets) {
        try {
          const response = await axios.get(target, {
            httpsAgent: this.getInternalHttpsAgent(),
            timeout: 5000,
          });

          if (response.status < 200 || response.status >= 300) {
            throw new Error(`Health check failed with ${response.status}`);
          }
        } catch (error) {
          this.captureException('verify_stack_connectivity', error, {
            stackSlot: stack.stackSlot,
            target,
          });
        }
      }
    }
  }

  private async handleReleaseCallback(
    server: ProvisioningServer,
    workflow: ProvisioningWorkflowRun,
    status: WorkflowCallbackDto['status'],
  ) {
    if (status === 'failed' || status === 'cancelled') {
      await this.prisma.provisioningServer.update({
        where: { id: server.id },
        data: {
          provisioningStatus: VpsProvisioningStatus.ERROR,
        },
      });
      return;
    }

    if (status !== 'success') {
      return;
    }

    await this.prisma.whatsAppAgent.updateMany({
      where: {
        serverId: server.id,
      },
      data: {
        assignmentStatus: StackAssignmentStatus.RELEASING,
      },
    });

    await this.prisma.provisioningServer.update({
      where: { id: server.id },
      data: {
        provisioningStatus: VpsProvisioningStatus.RELEASED,
        releasedAt: new Date(),
      },
    });

    await this.prisma.provisioningWorkflowRun.update({
      where: { id: workflow.id },
      data: {
        completedAt: new Date(),
        status: ProvisioningWorkflowStatus.SUCCEEDED,
      },
    });
  }

  private async primeSessionRouting(
    agent: WhatsAppAgent,
    params: ReserveStackParams,
  ) {
    const connectorInstanceId = this.getConnectorInstanceId(agent);

    await this.cacheManager.set(
      `connector-session:${connectorInstanceId}`,
      params.pairingToken,
      300000,
    );

    if (params.deviceType === 'desktop') {
      await this.cacheManager.set(
        `qr-session:${params.phoneNumber}`,
        params.pairingToken,
        300000,
      );
    }
  }

  private async clearSessionRouting(agent: WhatsAppAgent) {
    const connectorInstanceId = this.getConnectorInstanceId(agent);
    await this.cacheManager.del(`connector-session:${connectorInstanceId}`);
  }

  private buildConnectorUrl(agent: WhatsAppAgent) {
    const protocol = agent.ipAddress === 'localhost' ? 'http' : 'https';
    return `${protocol}://${agent.ipAddress}:${agent.connectorPort}`;
  }

  private getConnectorInstanceId(agent: WhatsAppAgent) {
    return agent.stackLabel || agent.id;
  }

  private emitProvisioningUpdate(
    pairingToken: string,
    input: {
      completedJobs: number;
      progress: number;
      stage: string;
      status: WorkflowCallbackDto['status'];
      workflowId: string;
    },
  ) {
    const stageContent = this.getStageContent(input.stage);
    this.authGateway.emitProvisioningUpdate(pairingToken, {
      completedJobs: input.completedJobs,
      progress: input.progress,
      stage: input.stage,
      status: input.status,
      subtitle: stageContent.subtitle,
      title: stageContent.title,
      workflowId: input.workflowId,
    });
  }

  private getStageContent(stage: string) {
    switch (stage) {
      case 'SERVER_INITIALIZING':
        return {
          subtitle:
            'Nous démarrons un nouveau serveur pour accueillir votre agent.',
          title: 'Initialisation du serveur',
        };
      case 'STACK_INSTALLING':
        return {
          subtitle: 'Nous installons Bedones WhatsApp et ses dépendances.',
          title: "Installation de l'IA",
        };
      case 'STACK_STARTING':
        return {
          subtitle: 'Nous attendons que les services deviennent disponibles.',
          title: "Lancement de l'IA",
        };
      case 'QR_FETCHING':
        return {
          subtitle: 'Nous récupérons les informations de connexion.',
          title: 'Récupération du code QR',
        };
      default:
        return {
          subtitle: 'Provisionnement en cours.',
          title: 'Préparation de votre stack',
        };
    }
  }

  private async dispatchGithubWorkflow(
    workflowFile: string,
    inputs: Record<string, string>,
  ) {
    const repository = this.configService.get<string>(
      'GITHUB_ACTIONS_REPOSITORY',
    );
    const token = this.configService.get<string>('GITHUB_ACTIONS_TOKEN');

    if (!repository || !token) {
      throw new Error(
        'GITHUB_ACTIONS_REPOSITORY et GITHUB_ACTIONS_TOKEN sont requis.',
      );
    }

    const apiUrl = `https://api.github.com/repos/${repository}/actions/workflows/${workflowFile}/dispatches`;
    const loggedInputs = this.buildWorkflowDispatchLogInputs(inputs);

    this.logger.log(
      `[dispatch_github_workflow] workflow_file=${workflowFile} ref=${this.getGithubRef()} repository=${repository} url=${apiUrl} inputs=${JSON.stringify(loggedInputs)}`,
    );

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        inputs,
        ref: this.getGithubRef(),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(
        `[dispatch_github_workflow] workflow_file=${workflowFile} status=${response.status} url=${apiUrl} response=${body}`,
      );
      throw new Error(
        `GitHub workflow dispatch failed (${response.status}): ${body}`,
      );
    }

    this.logger.log(
      `[dispatch_github_workflow] workflow_file=${workflowFile} status=${response.status} repository=${repository}`,
    );
  }

  private buildWorkflowDispatchLogInputs(inputs: Record<string, string>) {
    return Object.fromEntries(
      Object.entries(inputs).map(([key, value]) => {
        if (key === 'requested_phone_number' && value) {
          return [key, this.maskPhoneNumber(value)];
        }

        return [key, value || '<empty>'];
      }),
    );
  }

  private maskPhoneNumber(value: string) {
    if (value.length <= 4) {
      return '****';
    }

    return `${value.slice(0, 3)}***${value.slice(-2)}`;
  }

  private findWorkflow(dto: WorkflowCallbackDto) {
    if (dto.workflowId) {
      return this.prisma.provisioningWorkflowRun.findUnique({
        where: { id: dto.workflowId },
        include: { server: true },
      });
    }

    if (dto.githubRunId) {
      return this.prisma.provisioningWorkflowRun.findFirst({
        where: { githubRunId: dto.githubRunId },
        include: { server: true },
      });
    }

    return Promise.resolve(null);
  }

  private assertCallbackSecret(secret?: string) {
    const configuredSecret = this.configService.get<string>(
      'STACK_INFRA_CALLBACK_SECRET',
    );

    if (!configuredSecret) {
      return;
    }

    if (!secret || secret !== configuredSecret) {
      throw new UnauthorizedException('Invalid workflow callback secret');
    }
  }

  private mapWorkflowStatus(
    status: WorkflowCallbackDto['status'],
  ): ProvisioningWorkflowStatus {
    switch (status) {
      case 'running':
        return ProvisioningWorkflowStatus.RUNNING;
      case 'success':
        return ProvisioningWorkflowStatus.SUCCEEDED;
      case 'cancelled':
        return ProvisioningWorkflowStatus.CANCELED;
      case 'failed':
      default:
        return ProvisioningWorkflowStatus.FAILED;
    }
  }

  private mapServerStatus(
    status: WorkflowCallbackDto['status'],
  ): VpsProvisioningStatus {
    switch (status) {
      case 'running':
        return VpsProvisioningStatus.PROVISIONING;
      case 'success':
        return VpsProvisioningStatus.READY;
      case 'cancelled':
        return VpsProvisioningStatus.RELEASED;
      case 'failed':
      default:
        return VpsProvisioningStatus.ERROR;
    }
  }

  private computeProgressPercent(
    completedJobs: number,
    totalJobs: number,
    status: WorkflowCallbackDto['status'],
  ) {
    if (status === 'success') {
      return 100;
    }

    if (totalJobs <= 0) {
      return 0;
    }

    return Math.max(
      0,
      Math.min(99, Math.round((completedJobs / totalJobs) * 100)),
    );
  }

  private shouldProvisionOnBoot() {
    const value =
      this.configService.get<string>('STACK_POOL_PROVISION_ON_BOOT', 'true') ||
      'true';

    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  }

  private getMinimumFreeStacks() {
    return this.getNumberConfig('STACK_POOL_MIN_FREE_STACKS', 4);
  }

  private getBootstrapVpsCount() {
    return this.getNumberConfig('STACK_POOL_BOOTSTRAP_VPS_COUNT', 0);
  }

  private getDefaultStacksPerVps() {
    return this.getNumberConfig('STACK_POOL_DEFAULT_STACKS_PER_VPS', 2);
  }

  private getDefaultServerType() {
    return this.sanitizeServerType(
      this.configService.get<string>('STACK_POOL_DEFAULT_SERVER_TYPE', 'cpx22'),
      'cpx22',
    );
  }

  private getDefaultLocation() {
    return this.sanitizeLocation(
      this.configService.get<string>('STACK_POOL_DEFAULT_LOCATION', 'nbg1'),
      'nbg1',
    );
  }

  private getWorkflowCallbackUrl() {
    const backendUrl = this.configService.get<string>('BACKEND_URL');
    if (!backendUrl) {
      throw new Error('BACKEND_URL is required to build workflow callbacks.');
    }

    return `${backendUrl.replace(/\/$/, '')}/stack-pool/workflows/callback`;
  }

  private getProvisionWorkflowFile() {
    return this.configService.get<string>(
      'GITHUB_PROVISION_WORKFLOW_FILE',
      'install-bedones-whatsapp-agent.yml',
    );
  }

  private getReleaseWorkflowFile() {
    return this.configService.get<string>(
      'GITHUB_RELEASE_WORKFLOW_FILE',
      'release-bedones-whatsapp-agent.yml',
    );
  }

  private getGithubRef() {
    return this.configService.get<string>('GITHUB_ACTIONS_REF', 'main');
  }

  private getNumberConfig(key: string, fallback: number) {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private buildServerName() {
    const prefix = this.sanitizeServerNameSegment(
      this.configService.get<string>(
        'STACK_POOL_SERVER_NAME_PREFIX',
        'bedones-wa',
      ),
      'bedones-wa',
    );
    const suffix = crypto.randomBytes(3).toString('hex');
    return `${prefix}-${Date.now()}-${suffix}`;
  }

  private sanitizeServerNameSegment(
    value: string | undefined,
    fallback: string,
  ) {
    const sanitized = (value ?? fallback)
      .replace(/['"]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    return sanitized || fallback;
  }

  private sanitizeServerType(value: string | undefined, fallback: string) {
    const sanitized = (value ?? fallback).trim().toLowerCase();
    return sanitized || fallback;
  }

  private sanitizeLocation(value: string | undefined, fallback: string) {
    const sanitized = (value ?? fallback).trim().toLowerCase();
    return sanitized || fallback;
  }

  private getHetznerSshKeyNames() {
    const rawValue = this.configService.get<string>(
      'HERZNET_SSH_KEY_NAMES',
      '',
    );
    const keys = rawValue
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    if (keys.length === 0) {
      throw new Error(
        'HERZNET_SSH_KEY_NAMES is required to provision Hetzner servers.',
      );
    }

    return keys;
  }

  private isHetznerResourceMissing(error: unknown) {
    return (
      error instanceof HetznerCloudApiError &&
      error.status === 404 &&
      error.code === 'resource_not_found'
    );
  }

  private async markServerDeletedDuringInitialization(
    workflow: ProvisioningWorkflowRun & { server: ProvisioningServer | null },
    providerServerId: number,
    error: unknown,
  ) {
    const errorMessage = `Le VPS Hetzner ${providerServerId} n'existe plus pendant l'initialisation.`;

    this.logger.warn(
      `[server_initialization] provider_server_missing workflow=${workflow.id} server=${workflow.server?.id ?? '<missing>'} provider_server_id=${providerServerId} error=${this.stringifyError(error)}`,
    );

    await this.failServerInitialization(
      workflow,
      errorMessage,
      error,
      VpsProvisioningStatus.RELEASED,
    );
  }

  private scaleServerInitializationProgress(providerProgress: number) {
    const normalized = Math.max(0, Math.min(100, providerProgress));
    return Math.max(0, Math.min(32, Math.round((normalized / 100) * 32)));
  }

  private buildReservationExpiry() {
    const ttlMinutes = this.getNumberConfig(
      'STACK_POOL_RESERVATION_TTL_MINUTES',
      15,
    );
    return new Date(Date.now() + ttlMinutes * 60_000);
  }

  private generateRandomPassword() {
    return crypto.randomBytes(16).toString('hex');
  }

  private asObject(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private toJsonInput(
    value: unknown,
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
    if (typeof value === 'undefined') {
      return undefined;
    }

    if (value === null) {
      return Prisma.JsonNull;
    }

    return value as Prisma.InputJsonValue;
  }

  private async delay(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private stringifyError(error: unknown) {
    return error instanceof Error ? error.message : `${error}`;
  }

  private captureException(
    operation: string,
    error: unknown,
    context: Record<string, unknown> = {},
  ) {
    this.logger.error(`[${operation}] ${this.stringifyError(error)}`);

    Sentry.captureException(error, {
      tags: {
        domain: 'stack_pool',
        operation,
      },
      contexts: {
        stackPool: context,
      },
    });
  }
}
