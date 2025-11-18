import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAPI, OpenAPIConfig } from '@packages/wppconnect-client';
import { ApiRequestOptions } from '@packages/wppconnect-client/core/ApiRequestOptions';
import { request as __request } from '@packages/wppconnect-client/core/request';

@Injectable()
export class ConnectorClientService {
  private readonly logger = new Logger(ConnectorClientService.name);

  constructor(private readonly configService: ConfigService) {}

  private getRequestConfig(
    connectorUrl: string,
    secretKey?: string,
  ): OpenAPIConfig {
    return {
      ...OpenAPI,
      BASE: connectorUrl,
      HEADERS: {
        Authorization: `Bearer ${secretKey}`,
      },
    };
  }

  private async request<T>(
    connectorUrl: string,
    options: ApiRequestOptions,
  ): Promise<T> {
    const secretKey = this.configService.get<string>('WPPCONNECT_SECRET_KEY');
    if (!secretKey) {
      throw new Error('WPPCONNECT_SECRET_KEY is not configured');
    }
    const config = this.getRequestConfig(connectorUrl, secretKey);
    return __request(config, options);
  }

  /**
   * Generate token for authentication with wppconnect-server
   * @param connectorUrl The URL of the WhatsApp connector
   * @param sessionName The name of the session
   */
  async generateToken(connectorUrl: string, sessionName: string): Promise<any> {
    const secretKey = this.configService.get<string>('WPPCONNECT_SECRET_KEY');
    if (!secretKey) {
      throw new Error('WPPCONNECT_SECRET_KEY is not configured');
    }

    return this.request(connectorUrl, {
      method: 'POST',
      url: '/api/{session}/{secretkey}/generate-token',
      path: {
        session: sessionName,
        secretkey: secretKey,
      },
    });
  }

  /**
   * Request a pairing code for WhatsApp authentication with phone number
   * @param connectorUrl The URL of the WhatsApp connector for this user
   * @param sessionName The name of the session to start
   * @param phoneNumber The phone number to use for pairing code (e.g., '5521999999999')
   * @param waitQrCode Whether to wait for QR code if phone code fails
   */
  async requestPairingCode(
    connectorUrl: string,
    sessionName: string,
    phoneNumber?: string,
    waitQrCode: boolean = false,
  ): Promise<any> {
    const backendUrl = this.configService.get<string>('BACKEND_URL');
    if (!backendUrl) {
      throw new Error('BACKEND_URL is not configured');
    }

    const body: any = {
      webhook: `${backendUrl}/webhooks/whatsapp/connected`,
      waitQrCode,
    };

    // If phone number is provided, request pairing code instead of QR code
    if (phoneNumber) {
      body.phone = phoneNumber;
    }

    return this.request(connectorUrl, {
      method: 'POST',
      url: '/api/{session}/start-session',
      path: {
        session: sessionName,
      },
      body,
    });
  }

  /**
   * Send a message via WhatsApp
   * @param connectorUrl The URL of the WhatsApp connector for this user
   */
  async sendMessage(
    connectorUrl: string,
    sessionName: string,
    to: string,
    message: string,
  ): Promise<any> {
    return this.request(connectorUrl, {
      method: 'POST',
      url: '/api/{session}/send-message',
      path: {
        session: sessionName,
      },
      body: {
        phone: to,
        message: message,
      },
    });
  }

  /**
   * Get WhatsApp connection status
   * @param connectorUrl The URL of the WhatsApp connector for this user
   */
  async getStatus(connectorUrl: string, sessionName: string): Promise<any> {
    return this.request(connectorUrl, {
      method: 'GET',
      url: '/api/{session}/check-connection-session',
      path: {
        session: sessionName,
      },
    });
  }

  /**
   * Get WhatsApp contacts
   * @param connectorUrl The URL of the WhatsApp connector for this user
   */
  async getContacts(connectorUrl: string, sessionName: string): Promise<any> {
    return this.request(connectorUrl, {
      method: 'GET',
      url: '/api/{session}/all-contacts',
      path: {
        session: sessionName,
      },
    });
  }

  /**
   * Get WhatsApp chats
   * @param connectorUrl The URL of the WhatsApp connector for this user
   */
  async getChats(connectorUrl: string, sessionName: string): Promise<any> {
    return this.request(connectorUrl, {
      method: 'POST',
      url: '/api/{session}/list-chats',
      path: {
        session: sessionName,
      },
    });
  }

  /**
   * Get WhatsApp Business profile
   * @param connectorUrl The URL of the WhatsApp connector for this user
   */
  async getBusinessProfile(
    connectorUrl: string,
    sessionName: string,
  ): Promise<any> {
    return this.request(connectorUrl, {
      method: 'GET',
      url: '/api/{session}/get-business-profiles-products',
      path: {
        session: sessionName,
      },
    });
  }

  /**
   * Get WhatsApp Business catalog
   * @param connectorUrl The URL of the WhatsApp connector for this user
   */
  async getCatalog(connectorUrl: string, sessionName: string): Promise<any> {
    return this.request(connectorUrl, {
      method: 'GET',
      url: '/api/{session}/get-products',
      path: {
        session: sessionName,
      },
    });
  }

  /**
   * Get session state with QR code and phone code
   * @param connectorUrl The URL of the WhatsApp connector for this user
   * @param sessionName The name of the session
   */
  async getSessionState(
    connectorUrl: string,
    sessionName: string,
  ): Promise<any> {
    return this.request(connectorUrl, {
      method: 'GET',
      url: '/api/{session}/status-session',
      path: {
        session: sessionName,
      },
    });
  }

  /**
   * Get QR code image for session
   * @param connectorUrl The URL of the WhatsApp connector for this user
   * @param sessionName The name of the session
   */
  async getQrCode(connectorUrl: string, sessionName: string): Promise<any> {
    return this.request(connectorUrl, {
      method: 'GET',
      url: '/api/{session}/qrcode-session',
      path: {
        session: sessionName,
      },
    });
  }

  /**
   * Get all messages in a chat
   * @param connectorUrl The URL of the WhatsApp connector for this user
   * @param sessionName The name of the session
   * @param phone The phone number or chat ID
   */
  async getMessagesInChat(
    connectorUrl: string,
    sessionName: string,
    phone: string,
  ): Promise<any> {
    return this.request(connectorUrl, {
      method: 'GET',
      url: '/api/{session}/all-messages-in-chat/{phone}',
      path: {
        session: sessionName,
        phone,
      },
    });
  }

  /**
   * Get all groups
   * @param connectorUrl The URL of the WhatsApp connector for this user
   * @param sessionName The name of the session
   */
  async getAllGroups(connectorUrl: string, sessionName: string): Promise<any> {
    return this.request(connectorUrl, {
      method: 'GET',
      url: '/api/{session}/all-groups',
      path: {
        session: sessionName,
      },
    });
  }

  /**
   * Get phone number of the session
   * @param connectorUrl The URL of the WhatsApp connector for this user
   * @param sessionName The name of the session
   */
  async getPhoneNumber(
    connectorUrl: string,
    sessionName: string,
  ): Promise<any> {
    return this.request(connectorUrl, {
      method: 'GET',
      url: '/api/{session}/get-phone-number',
      path: {
        session: sessionName,
      },
    });
  }

  /**
   * Get device info (battery level, host device, etc.)
   * @param connectorUrl The URL of the WhatsApp connector for this user
   * @param sessionName The name of the session
   */
  async getHostDevice(connectorUrl: string, sessionName: string): Promise<any> {
    return this.request(connectorUrl, {
      method: 'GET',
      url: '/api/{session}/host-device',
      path: {
        session: sessionName,
      },
    });
  }

  /**
   * Get battery level
   * @param connectorUrl The URL of the WhatsApp connector for this user
   * @param sessionName The name of the session
   */
  async getBatteryLevel(
    connectorUrl: string,
    sessionName: string,
  ): Promise<any> {
    return this.request(connectorUrl, {
      method: 'GET',
      url: '/api/{session}/get-battery-level',
      path: {
        session: sessionName,
      },
    });
  }

  /**
   * Get profile picture URL
   * @param connectorUrl The URL of the WhatsApp connector for this user
   * @param sessionName The name of the session
   * @param phone The phone number to get profile pic from
   */
  async getProfilePic(
    connectorUrl: string,
    sessionName: string,
    phone: string,
  ): Promise<any> {
    return this.request(connectorUrl, {
      method: 'GET',
      url: '/api/{session}/profile-pic/{phone}',
      path: {
        session: sessionName,
        phone,
      },
    });
  }

  /**
   * Check if a number is registered on WhatsApp
   * @param connectorUrl The URL of the WhatsApp connector for this user
   * @param sessionName The name of the session
   * @param phone The phone number to check
   */
  async checkNumberStatus(
    connectorUrl: string,
    sessionName: string,
    phone: string,
  ): Promise<any> {
    return this.request(connectorUrl, {
      method: 'GET',
      url: '/api/{session}/check-number-status/{phone}',
      path: {
        session: sessionName,
        phone,
      },
    });
  }

  /**
   * Logout and delete session data
   * @param connectorUrl The URL of the WhatsApp connector for this user
   * @param sessionName The name of the session
   */
  async logoutSession(connectorUrl: string, sessionName: string): Promise<any> {
    return this.request(connectorUrl, {
      method: 'POST',
      url: '/api/{session}/logout-session',
      path: {
        session: sessionName,
      },
    });
  }

  /**
   * Close session without deleting data
   * @param connectorUrl The URL of the WhatsApp connector for this user
   * @param sessionName The name of the session
   */
  async closeSession(connectorUrl: string, sessionName: string): Promise<any> {
    return this.request(connectorUrl, {
      method: 'POST',
      url: '/api/{session}/close-session',
      path: {
        session: sessionName,
      },
    });
  }

  /**
   * Send a file via WhatsApp
   * @param connectorUrl The URL of the WhatsApp connector for this user
   * @param sessionName The name of the session
   * @param to The recipient phone number
   * @param base64Data Base64 encoded file data
   * @param filename The filename
   * @param caption Optional caption for the file
   */
  async sendFile(
    connectorUrl: string,
    sessionName: string,
    to: string,
    base64Data: string,
    filename: string,
    caption?: string,
  ): Promise<any> {
    return this.request(connectorUrl, {
      method: 'POST',
      url: '/api/{session}/send-file-base64',
      path: {
        session: sessionName,
      },
      body: {
        phone: to,
        base64: base64Data,
        filename,
        caption,
      },
    });
  }

  /**
   * Send an image via WhatsApp
   * @param connectorUrl The URL of the WhatsApp connector for this user
   * @param sessionName The name of the session
   * @param to The recipient phone number
   * @param base64Data Base64 encoded image data
   * @param caption Optional caption for the image
   */
  async sendImage(
    connectorUrl: string,
    sessionName: string,
    to: string,
    base64Data: string,
    caption?: string,
  ): Promise<any> {
    return this.request(connectorUrl, {
      method: 'POST',
      url: '/api/{session}/send-file-base64',
      path: {
        session: sessionName,
      },
      body: {
        phone: to,
        base64: base64Data,
        isImage: true,
        caption,
      },
    });
  }
}
