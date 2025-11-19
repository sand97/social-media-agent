import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class ConnectorClientService {
  private readonly logger = new Logger(ConnectorClientService.name);
  private readonly connectorUrl: string;
  public readonly sessionName: string;
  private axiosInstance: AxiosInstance;

  constructor(private readonly configService: ConfigService) {
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
}
