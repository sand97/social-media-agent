import * as crypto from 'crypto';

import { ConnectorClientService } from '@app/connector-client/connector-client.service';
import {
  PageScriptService,
  ScriptVariables,
} from '@app/page-scripts/page-script.service';
import {
  Injectable,
  ConflictException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WhatsAppAgent,
  WhatsAppAgentStatus,
  ConnectionStatus,
} from '@prisma/client';

import { CryptoService } from '../common/crypto.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WhatsAppAgentService {
  private readonly logger = new Logger(WhatsAppAgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: CryptoService,
    private readonly configService: ConfigService,
    private readonly connectorClientService: ConnectorClientService,
    private readonly pageScriptService: PageScriptService,
  ) {}

  /**
   * Provision a WhatsApp agent for a user
   * In dev: uses localhost:3002
   * In prod: will use Contabo API later
   */
  async provisionAgent(userId: string): Promise<WhatsAppAgent> {
    // Check if agent already exists
    const existingAgent = await this.prisma.whatsAppAgent.findUnique({
      where: { userId },
    });

    if (existingAgent) {
      throw new ConflictException(
        'WhatsApp agent already exists for this user',
      );
    }

    // Generate random password
    const password = this.generateRandomPassword();

    // Encrypt password
    const encryptedPassword = this.cryptoService.encrypt(password);

    // Get environment
    const nodeEnv = this.configService.get<string>('NODE_ENV') || 'development';
    const isDev = nodeEnv === 'development';

    // In dev: use localhost, in prod: will use Contabo API
    const ipAddress = isDev ? 'localhost' : 'TBD'; // Will be set by Contabo API
    const port = isDev ? 3002 : 0; // Agent port - will be set by Contabo API
    const connectorPort = isDev ? 3001 : 0; // Connector port - will be set by Contabo API

    try {
      // Create agent with PROVISIONING status
      let agent = await this.prisma.whatsAppAgent.create({
        data: {
          userId,
          ipAddress,
          port,
          connectorPort,
          encryptedPassword,
          status: WhatsAppAgentStatus.PROVISIONING,
          connectionStatus: ConnectionStatus.PAIRING_REQUIRED,
          metadata: {
            environment: nodeEnv,
            provisionedAt: new Date().toISOString(),
            plainPassword: isDev ? password : undefined, // Only store in dev for debugging
          },
        },
      });

      // In dev, immediately update to RUNNING
      // In prod, will wait for Contabo API confirmation
      if (isDev) {
        agent = await this.prisma.whatsAppAgent.update({
          where: { id: agent.id },
          data: {
            status: WhatsAppAgentStatus.RUNNING,
          },
        });

        this.logger.log(
          `Agent provisioned for user ${userId} at ${ipAddress}:${port}`,
        );
      } else {
        // TODO: Call Herznet API to provision the agent
        this.logger.log(`Agent provisioning initiated for user ${userId}`);
      }

      return agent;
    } catch (error) {
      this.logger.error(`Error provisioning agent for user ${userId}`, error);
      throw new InternalServerErrorException('Failed to provision agent');
    }
  }

  /**
   * Get the WhatsApp agent for a user
   */
  async getAgentForUser(userId: string): Promise<WhatsAppAgent | null> {
    return this.prisma.whatsAppAgent.findUnique({
      where: { userId },
    });
  }

  /**
   * Get the full URL for a user's agent
   */
  async getAgentUrl(userId: string): Promise<string> {
    const agent = await this.getAgentForUser(userId);

    if (!agent) {
      throw new NotFoundException('WhatsApp agent not found for this user');
    }

    const protocol = agent.ipAddress === 'localhost' ? 'http' : 'https';
    return `${protocol}://${agent.ipAddress}:${agent.port}`;
  }

  /**
   * Get the full URL for a user's WhatsApp connector
   */
  async getConnectorUrl(agent: WhatsAppAgent): Promise<string> {
    if (!agent) {
      throw new NotFoundException('WhatsApp agent not found for this user');
    }

    const protocol = agent.ipAddress === 'localhost' ? 'http' : 'https';
    return `${protocol}://${agent.ipAddress}:${agent.connectorPort}`;
  }

  /**
   * Update agent status
   */
  async updateAgentStatus(
    agentId: string,
    status: WhatsAppAgentStatus,
    connectionStatus?: ConnectionStatus,
  ): Promise<WhatsAppAgent> {
    const agent = await this.prisma.whatsAppAgent.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      throw new NotFoundException('WhatsApp agent not found');
    }

    const updateData: any = { status };

    if (connectionStatus !== undefined) {
      updateData.connectionStatus = connectionStatus;
    }

    return this.prisma.whatsAppAgent.update({
      where: { id: agentId },
      data: updateData,
    });
  }

  /**
   * Check agent health by calling /health endpoint
   */
  async checkAgentHealth(agentId: string): Promise<{
    healthy: boolean;
    status?: string;
    error?: string;
  }> {
    const agent = await this.prisma.whatsAppAgent.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      throw new NotFoundException('WhatsApp agent not found');
    }

    const url = `http://${agent.ipAddress}:${agent.port}/health`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      const healthy = response.ok;

      // Update last health check timestamp
      await this.prisma.whatsAppAgent.update({
        where: { id: agentId },
        data: { lastHealthCheckAt: new Date() },
      });

      return {
        healthy,
        status: response.status.toString(),
      };
    } catch (error) {
      this.logger.error(`Health check failed for agent ${agentId}`, error);
      return {
        healthy: false,
        error: error.message,
      };
    }
  }

  /**
   * Soft delete an agent
   */
  async deleteAgent(agentId: string): Promise<WhatsAppAgent> {
    const agent = await this.prisma.whatsAppAgent.findUnique({
      where: { id: agentId },
    });

    if (!agent) {
      throw new NotFoundException('WhatsApp agent not found');
    }

    // Soft delete by setting status to DELETED
    return this.prisma.whatsAppAgent.update({
      where: { id: agentId },
      data: {
        status: WhatsAppAgentStatus.DELETED,
      },
    });
  }

  /**
   * Generate a random password
   */
  private generateRandomPassword(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Execute a script on the user's WhatsApp connector
   */
  private async executeScript(
    userId: string,
    scriptPath: string,
    variables: ScriptVariables = {},
  ): Promise<unknown> {
    const agent = await this.prisma.whatsAppAgent.findFirst({
      where: { userId },
    });

    if (!agent) {
      throw new NotFoundException('WhatsApp agent not found for user');
    }

    const connectorUrl = await this.getConnectorUrl(agent);
    const script = this.pageScriptService.getScript(scriptPath, variables);

    return await this.connectorClientService.executeScript(
      connectorUrl,
      script,
    );
  }

  /**
   * Get all WhatsApp labels for a user
   */
  async getLabels(userId: string): Promise<
    Array<{
      id: string;
      name: string;
      hexColor: string;
      colorIndex: number;
      count: number;
    }>
  > {
    const result = await this.executeScript(userId, 'labels/getAllLabels');
    return result as Array<{
      id: string;
      name: string;
      hexColor: string;
      colorIndex: number;
      count: number;
    }>;
  }

  /**
   * Validate if a phone number exists on WhatsApp
   */
  async validateContact(
    userId: string,
    phoneNumber: string,
  ): Promise<{
    exists: boolean;
    phoneNumber: string;
    contactId?: string;
  }> {
    const result = await this.executeScript(
      userId,
      'contact/queryContactExists',
      { PHONE_NUMBER: phoneNumber },
    );
    return result as {
      exists: boolean;
      phoneNumber: string;
      contactId?: string;
    };
  }

  /**
   * Update agent configuration (test mode, production mode, labels)
   */
  async updateAgentConfig(
    userId: string,
    config: {
      testPhoneNumbers?: string[];
      testLabels?: string[];
      labelsToNotReply?: string[];
      productionEnabled?: boolean;
    },
  ): Promise<WhatsAppAgent> {
    const agent = await this.prisma.whatsAppAgent.findFirst({
      where: { userId },
    });

    if (!agent) {
      throw new NotFoundException('WhatsApp agent not found for user');
    }

    const updateData: Partial<{
      testPhoneNumbers: string[];
      testLabels: string[];
      labelsToNotReply: string[];
      productionEnabled: boolean;
    }> = {};

    if (config.testPhoneNumbers !== undefined) {
      updateData.testPhoneNumbers = config.testPhoneNumbers;
    }
    if (config.testLabels !== undefined) {
      updateData.testLabels = config.testLabels;
    }
    if (config.labelsToNotReply !== undefined) {
      updateData.labelsToNotReply = config.labelsToNotReply;
    }
    if (config.productionEnabled !== undefined) {
      updateData.productionEnabled = config.productionEnabled;
    }

    return this.prisma.whatsAppAgent.update({
      where: { id: agent.id },
      data: updateData,
    });
  }

  /**
   * Check if the agent can process a message from a chat
   * Returns agent configuration, context, and authorized groups
   */
  async canProcess(
    chatId: string,
    message: string,
  ): Promise<{
    allowed: boolean;
    reason?: string;
    agentContext?: string;
    managementGroupId?: string;
    agentId?: string;
    authorizedGroups?: Array<{ whatsappGroupId: string; usage: string }>;
  }> {
    // Extract user phone from chatId (format: "237657888690@c.us" or "12345@g.us")
    const phoneMatch = chatId.match(/^(\d+)@c\.us$/);

    if (!phoneMatch) {
      // For group messages, we need to find the user another way
      // For now, we'll handle group authorization later
      const isGroup = chatId.includes('@g.us');

      if (isGroup) {
        // Find user by checking if this group is in their authorized groups
        const group = await this.prisma.group.findFirst({
          where: { whatsappGroupId: chatId },
          include: {
            user: {
              include: {
                whatsappAgent: true,
                groups: true,
                onboardingThread: true,
              },
            },
          },
        });

        if (!group || !group.user) {
          return {
            allowed: false,
            reason: 'Group not found or not authorized',
          };
        }

        const user = group.user;
        const agent = user.whatsappAgent;

        if (!agent) {
          return {
            allowed: false,
            reason: 'Agent not found for this user',
          };
        }

        // Get agent context from onboarding thread
        const agentContext = user.onboardingThread?.context || '';

        // Get all authorized groups for this user
        const authorizedGroups = user.groups.map((g) => ({
          whatsappGroupId: g.whatsappGroupId,
          usage: g.usage,
        }));

        // Find management group (you can define this by usage or have a specific field)
        const managementGroup = user.groups.find((g) =>
          g.usage.toLowerCase().includes('gestion'),
        );

        return {
          allowed: true,
          agentContext,
          managementGroupId: managementGroup?.whatsappGroupId,
          agentId: agent.id,
          authorizedGroups,
        };
      }

      return {
        allowed: false,
        reason: 'Invalid chat ID format',
      };
    }

    const phoneNumber = phoneMatch[1];

    // Find user by phone number
    const user = await this.prisma.user.findUnique({
      where: { phoneNumber },
      include: {
        whatsappAgent: true,
        groups: true,
        onboardingThread: true,
      },
    });

    if (!user) {
      return {
        allowed: false,
        reason: 'User not found',
      };
    }

    const agent = user.whatsappAgent;

    if (!agent) {
      return {
        allowed: false,
        reason: 'Agent not configured for this user',
      };
    }

    // Check if agent is running
    if (agent.status !== WhatsAppAgentStatus.RUNNING) {
      return {
        allowed: false,
        reason: `Agent is not running (status: ${agent.status})`,
      };
    }

    // Get agent context from onboarding thread
    const agentContext = user.onboardingThread?.context || '';

    // Get all authorized groups
    const authorizedGroups = user.groups.map((g) => ({
      whatsappGroupId: g.whatsappGroupId,
      usage: g.usage,
    }));

    // Find management group
    const managementGroup = user.groups.find((g) =>
      g.usage.toLowerCase().includes('gestion'),
    );

    return {
      allowed: true,
      agentContext,
      managementGroupId: managementGroup?.whatsappGroupId,
      agentId: agent.id,
      authorizedGroups,
    };
  }

  /**
   * Log an agent operation with full metrics (tokens, tools, duration)
   */
  async logOperation(data: {
    // Context
    chatId: string;
    agentId?: string;
    userId?: string;

    // Messages
    userMessage: string;
    agentResponse: string;
    systemPrompt: string;

    // Metrics
    totalTokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    durationMs: number;
    modelName?: string;

    // Tools
    toolsUsed?: Array<{
      name: string;
      args: any;
      result?: any;
      error?: string;
      durationMs?: number;
    }>;

    // Status
    status: 'success' | 'error' | 'rate_limited';
    error?: string;

    // Metadata
    metadata?: any;
  }): Promise<{ success: boolean; operationId?: string }> {
    try {
      // Extract userId from chatId if not provided
      let userId = data.userId;
      if (!userId) {
        const phoneMatch = data.chatId.match(/^(\d+)@c\.us$/);
        if (phoneMatch) {
          const phoneNumber = phoneMatch[1];
          const user = await this.prisma.user.findUnique({
            where: { phoneNumber },
            select: { id: true },
          });
          userId = user?.id;
        }
      }

      // Create operation log in database
      const operation = await this.prisma.agentOperation.create({
        data: {
          // Context
          agentId: data.agentId,
          chatId: data.chatId,
          userId,

          // Messages
          userMessage: data.userMessage,
          agentResponse: data.agentResponse,
          systemPrompt: data.systemPrompt,

          // Metrics
          totalTokens: data.totalTokens,
          promptTokens: data.promptTokens,
          completionTokens: data.completionTokens,
          durationMs: data.durationMs,
          modelName: data.modelName,

          // Tools (stored as JSON)
          toolsUsed: data.toolsUsed || [],

          // Status
          status: data.status,
          error: data.error,

          // Metadata
          metadata: data.metadata || {},
        },
      });

      this.logger.log(
        `✅ Operation logged: ${operation.id} | Chat: ${data.chatId} | Duration: ${data.durationMs}ms | Tokens: ${data.totalTokens || 'N/A'} | Tools: ${data.toolsUsed?.length || 0}`,
      );

      return {
        success: true,
        operationId: operation.id,
      };
    } catch (error: any) {
      this.logger.error(
        `Failed to log operation for ${data.chatId}: ${error.message}`,
        error.stack,
      );

      return { success: false };
    }
  }
}
