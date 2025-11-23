import * as crypto from 'crypto';

import { ConnectorClientService } from '@app/connector-client/connector-client.service';
import {
  WhatsAppAgent,
  WhatsAppAgentStatus,
  ConnectionStatus,
} from '@app/generated/client';
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
        // TODO: Call Contabo API to provision the agent
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
}
