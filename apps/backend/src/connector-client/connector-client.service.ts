import { PageScriptService } from '@app/page-scripts';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class ConnectorClientService {
  private readonly logger = new Logger(ConnectorClientService.name);
  private axiosInstances: Map<string, AxiosInstance> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly pageScriptService: PageScriptService,
  ) {}

  private getAxiosInstance(connectorUrl: string): AxiosInstance {
    if (!this.axiosInstances.has(connectorUrl)) {
      const instance = axios.create({
        baseURL: connectorUrl,
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 60000, // 60 seconds timeout
      });

      this.axiosInstances.set(connectorUrl, instance);
    }

    return this.axiosInstances.get(connectorUrl)!;
  }

  /**
   * Execute a JavaScript script in the WhatsApp Web page context
   * Used by page scripts to interact with WhatsApp Web (WPP.js)
   * @param connectorUrl The URL of the WhatsApp connector
   * @param script The JavaScript code to execute
   */
  async executeScript(connectorUrl: string, script: string): Promise<any> {
    if (!connectorUrl) {
      throw new Error('connectorUrl is required');
    }

    this.logger.debug(
      `[CONNECTOR] Executing script on connector: ${connectorUrl}`,
    );

    const instance = this.getAxiosInstance(connectorUrl);
    const response = await instance.post('/whatsapp/execute-script', {
      script,
    });

    return response.data;
  }

  /**
   * Request a pairing code for WhatsApp authentication
   * @param connectorUrl The URL of the WhatsApp connector
   * @param phoneNumber The session name (user ID)
   */
  async requestPairingCode(
    connectorUrl: string,
    phoneNumber: string,
  ): Promise<any> {
    this.logger.log(`[CONNECTOR] Requesting pairing code for: ${phoneNumber}`);

    const instance = this.getAxiosInstance(connectorUrl);
    const response = await instance.post('/whatsapp/request-pairing-code', {
      phoneNumber,
    });

    return response.data;
  }

  /**
   * Check if WhatsApp is authenticated
   * @param connectorUrl The URL of the WhatsApp connector
   */
  async isAuthenticated(connectorUrl: string): Promise<{
    success: boolean;
    result?: {
      success: boolean;
      isAuthenticated: boolean;
      error?: string;
    };
    error?: string;
  }> {
    this.logger.debug(
      `[CONNECTOR] Checking authentication status on: ${connectorUrl}`,
    );

    const script = this.pageScriptService.getIsAuthenticatedScript();
    const result = await this.executeScript(connectorUrl, script);

    return result;
  }

  /**
   * Send a text message via WhatsApp
   * Intègre automatiquement la vérification du contact (queryExists) et l'envoi du message
   * @param connectorUrl The URL of the WhatsApp connector
   * @param phoneNumber Phone number in format: [number]@c.us (e.g., "33612345678@c.us")
   * @param message The message text
   */
  async sendTextMessage(
    connectorUrl: string,
    phoneNumber: string,
    message: string,
  ): Promise<{
    success: boolean;
    result?: {
      success: boolean;
      messageId?: string;
      timestamp?: number;
      ack?: number;
      wid?: string;
      contact?: any;
      error?: string;
      phoneNumber?: string;
    };
    error?: string;
  }> {
    this.logger.debug(
      `[CONNECTOR] Sending text message to ${phoneNumber} via: ${connectorUrl}`,
    );

    // Échapper le message pour éviter les problèmes d'injection
    const escapedMessage = message
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$');

    const script = this.pageScriptService.getSendTextMessageScript({
      PHONE_NUMBER: phoneNumber,
      MESSAGE: escapedMessage,
    });

    const result = await this.executeScript(connectorUrl, script);

    return result;
  }

  /**
   * Get QR code for WhatsApp authentication
   * @param connectorUrl The URL of the WhatsApp connector
   */
  async getQRCode(connectorUrl: string): Promise<{
    success: boolean;
    qrCode?: string;
    message?: string;
  }> {
    this.logger.debug(`[CONNECTOR] Requesting QR code from: ${connectorUrl}`);

    const instance = this.getAxiosInstance(connectorUrl);
    const response = await instance.get('/whatsapp/qr');

    return response.data;
  }

  /**
   * Restart WhatsApp client to generate a new QR code
   * @param connectorUrl The URL of the WhatsApp connector
   */
  async restartClient(connectorUrl: string): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    this.logger.log(
      `[CONNECTOR] Restarting client to get new QR code: ${connectorUrl}`,
    );

    const instance = this.getAxiosInstance(connectorUrl);
    const response = await instance.post('/whatsapp/restart');

    return response.data;
  }
}
