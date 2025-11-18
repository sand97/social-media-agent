import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OpenAPI,
  OpenAPIConfig,
  request as __request,
  ApiRequestOptions,
} from '@packages/wppconnect-client';

@Injectable()
export class ConnectorClientService {
  private readonly logger = new Logger(ConnectorClientService.name);
  private readonly connectorUrl: string;
  public readonly sessionName: string;

  constructor(private readonly configService: ConfigService) {
    this.connectorUrl = this.configService.get<string>(
      'CONNECTOR_URL',
      'http://localhost:3001',
    );
    this.sessionName = this.configService.get<string>(
      'WHATSAPP_SESSION_NAME',
      'whatsapp-agent-session',
    );
    this.logger.log(`Connector URL configured: ${this.connectorUrl}`);
    this.logger.log(`Session Name: ${this.sessionName}`);
  }

  private getRequestConfig(): OpenAPIConfig {
    const secretKey = this.configService.get<string>('WPPCONNECT_SECRET_KEY');
    return {
      ...OpenAPI,
      BASE: this.connectorUrl,
      HEADERS: secretKey
        ? {
            Authorization: `Bearer ${secretKey}`,
          }
        : undefined,
    };
  }

  private async request<T>(options: ApiRequestOptions): Promise<T> {
    const config = this.getRequestConfig();
    return __request(config, options);
  }

  /**
   * Envoie un message WhatsApp
   */
  async sendMessage(chatId: string, content: string): Promise<any> {
    return this.request({
      method: 'POST',
      url: '/api/{session}/send-message',
      path: {
        session: this.sessionName,
      },
      body: {
        phone: chatId,
        message: content,
      },
    });
  }

  /**
   * Récupère un chat par ID
   */
  async getChatById(chatId: string): Promise<any> {
    return this.request({
      method: 'GET',
      url: '/api/{session}/chat-by-id/{phone}',
      path: {
        session: this.sessionName,
        phone: chatId,
      },
    });
  }

  /**
   * Récupère un contact par ID
   */
  async getContactById(contactId: string): Promise<any> {
    return this.request({
      method: 'GET',
      url: '/api/{session}/contact/{phone}',
      path: {
        session: this.sessionName,
        phone: contactId,
      },
    });
  }

  /**
   * Récupère tous les chats
   */
  async getChats(): Promise<any[]> {
    return this.request({
      method: 'POST',
      url: '/api/{session}/list-chats',
      path: {
        session: this.sessionName,
      },
    });
  }

  /**
   * Récupère tous les contacts
   */
  async getContacts(): Promise<any[]> {
    return this.request({
      method: 'GET',
      url: '/api/{session}/all-contacts',
      path: {
        session: this.sessionName,
      },
    });
  }

  /**
   * Marque un message comme lu
   */
  async markChatAsRead(chatId: string): Promise<any> {
    return this.request({
      method: 'POST',
      url: '/api/{session}/send-seen',
      path: {
        session: this.sessionName,
      },
      body: {
        phone: chatId,
      },
    });
  }

  /**
   * Archive un chat
   */
  async archiveChat(chatId: string): Promise<any> {
    return this.request({
      method: 'POST',
      url: '/api/{session}/archive-chat',
      path: {
        session: this.sessionName,
      },
      body: {
        phone: chatId,
        value: true,
      },
    });
  }

  /**
   * Mute un chat
   */
  async muteChat(chatId: string, unmuteDate?: Date): Promise<any> {
    // The new API does not support unmuteDate, so we ignore it.
    return this.request({
      method: 'POST',
      url: '/api/{session}/send-mute',
      path: {
        session: this.sessionName,
      },
      body: {
        phone: chatId,
        time: -1,
        type: 'permanently',
      },
    });
  }

  /**
   * Récupère le statut du connector
   */
  async getStatus(): Promise<any> {
    return this.request({
      method: 'GET',
      url: '/api/{session}/check-connection-session',
      path: {
        session: this.sessionName,
      },
    });
  }
}
