import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class ConnectorClientService implements OnModuleInit {
  private readonly logger = new Logger(ConnectorClientService.name);
  private readonly connectorUrl: string;
  public readonly sessionName: string;
  private axiosInstance: AxiosInstance;
  private isReady = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.connectorUrl = this.configService.get<string>(
      'CONNECTOR_URL',
      'http://localhost:3001',
    );
    this.sessionName = this.configService.get<string>(
      'WHATSAPP_SESSION_NAME',
      'whatsapp-agent-session',
    );

    this.axiosInstance = axios.create({
      baseURL: this.connectorUrl,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 seconds timeout
    });

    this.logger.log(`Connector URL configured: ${this.connectorUrl}`);
    this.logger.log(`Session Name: ${this.sessionName}`);
  }

  /**
   * Check connector status on module init and emit ready event
   */
  async onModuleInit() {
    // Wait a bit for connector to start, then check status
    setTimeout(() => {
      this.checkAndEmitReady().catch((error) => {
        this.logger.warn(
          `Failed to check connector status on startup: ${error.message}`,
        );
      });
    }, 2000);
  }

  /**
   * Check if connector is ready and emit event if it is
   */
  private async checkAndEmitReady(): Promise<void> {
    try {
      const status = await this.getStatus();

      if (status?.isReady === true && !this.isReady) {
        this.isReady = true;
        this.logger.log(
          '✅ Connector is ready - emitting connector.ready event',
        );
        this.eventEmitter.emit('connector.ready', {
          sessionName: this.sessionName,
        });
      }
    } catch (error) {
      this.logger.debug(`Connector not ready yet: ${error.message}`);
    }
  }

  /**
   * Send a WhatsApp message
   */
  async sendMessage(chatId: string, content: string): Promise<any> {
    this.logger.debug(`[CONNECTOR] Sending message to ${chatId}`);

    const response = await this.axiosInstance.post('/whatsapp/send-message', {
      sessionName: this.sessionName,
      to: chatId,
      message: content,
    });

    return response.data;
  }

  /**
   * Get a chat by ID
   */
  async getChatById(chatId: string): Promise<any> {
    this.logger.debug(`[CONNECTOR] Getting chat: ${chatId}`);

    const response = await this.axiosInstance.get(`/whatsapp/chat/${chatId}`, {
      params: {
        sessionName: this.sessionName,
      },
    });

    return response.data;
  }

  /**
   * Get a contact by ID
   */
  async getContactById(contactId: string): Promise<any> {
    this.logger.debug(`[CONNECTOR] Getting contact: ${contactId}`);

    const response = await this.axiosInstance.get(
      `/whatsapp/contact/${contactId}`,
      {
        params: {
          sessionName: this.sessionName,
        },
      },
    );

    return response.data;
  }

  /**
   * Get all chats
   */
  async getChats(): Promise<any[]> {
    this.logger.debug(`[CONNECTOR] Getting all chats`);

    const response = await this.axiosInstance.get('/whatsapp/chats', {
      params: {
        sessionName: this.sessionName,
      },
    });

    return response.data;
  }

  /**
   * Get all contacts
   */
  async getContacts(): Promise<any[]> {
    this.logger.debug(`[CONNECTOR] Getting all contacts`);

    const response = await this.axiosInstance.get('/whatsapp/contacts', {
      params: {
        sessionName: this.sessionName,
      },
    });

    return response.data;
  }

  /**
   * Get connector status
   */
  async getStatus(): Promise<any> {
    this.logger.debug(`[CONNECTOR] Getting connector status`);

    const response = await this.axiosInstance.get('/whatsapp/status', {
      params: {
        sessionName: this.sessionName,
      },
    });

    return response.data;
  }

  /**
   * Execute a script in the WhatsApp Web page context
   * @param script - JavaScript code to execute
   */
  async executeScript(script: string): Promise<any> {
    this.logger.debug(`[CONNECTOR] Executing script in page context`);

    const response = await this.axiosInstance.post('/whatsapp/execute-script', {
      sessionName: this.sessionName,
      script,
    });

    return response.data;
  }
}
