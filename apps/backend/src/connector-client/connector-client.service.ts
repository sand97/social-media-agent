import { PageScriptService } from '@app/page-scripts';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

type ConnectorRequestOptions = {
  targetInstanceId?: string;
};

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

  private buildHeaders(options?: ConnectorRequestOptions) {
    if (!options?.targetInstanceId) {
      return undefined;
    }

    return {
      'X-Bedones-Target-Instance': options.targetInstanceId,
    };
  }

  /**
   * Execute a JavaScript script in the WhatsApp Web page context
   * Used by page scripts to interact with WhatsApp Web (WPP.js)
   * @param connectorUrl The URL of the WhatsApp connector
   * @param script The JavaScript code to execute
   */
  async executeScript(
    connectorUrl: string,
    script: string,
    options?: ConnectorRequestOptions,
  ): Promise<any> {
    if (!connectorUrl) {
      throw new Error('connectorUrl is required');
    }

    this.logger.debug(
      `[CONNECTOR] Executing script on connector: ${connectorUrl}`,
    );

    const instance = this.getAxiosInstance(connectorUrl);
    try {
      const response = await instance.post(
        '/whatsapp/execute-script',
        {
          script,
        },
        {
          headers: this.buildHeaders(options),
        },
      );

      return response.data;
    } catch (error: any) {
      const status = error.response?.status;
      const data = error.response?.data;

      this.logger.error(
        `[CONNECTOR] Script execution failed (${status || 'unknown'}): ${
          data?.error || error.message
        }`,
      );

      if (data) {
        this.logger.debug(`[CONNECTOR] Error response:`, data);
      }

      throw new Error(data?.error || error.message);
    }
  }

  /**
   * Request a pairing code for WhatsApp authentication
   * @param connectorUrl The URL of the WhatsApp connector
   * @param phoneNumber The session name (user ID)
   */
  async requestPairingCode(
    connectorUrl: string,
    phoneNumber: string,
    options?: ConnectorRequestOptions,
  ): Promise<any> {
    this.logger.log(`[CONNECTOR] Requesting pairing code for: ${phoneNumber}`);

    const instance = this.getAxiosInstance(connectorUrl);
    const response = await instance.post(
      '/whatsapp/request-pairing-code',
      {
        phoneNumber,
      },
      {
        headers: this.buildHeaders(options),
      },
    );

    return response.data;
  }

  /**
   * Check if WhatsApp is authenticated
   * @param connectorUrl The URL of the WhatsApp connector
   */
  async isAuthenticated(
    connectorUrl: string,
    options?: ConnectorRequestOptions,
  ): Promise<{
    success: boolean;
    result?: {
      success: boolean;
      isAuthenticated: boolean;
      error?: string;
    };
    error?: string;
  }> {
    const script = this.pageScriptService.getIsAuthenticatedScript();
    const result = await this.executeScript(connectorUrl, script, options);
    this.logger.debug(
      `[CONNECTOR] Checking authentication status on: ${connectorUrl}`,
      result,
    );
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
    options?: ConnectorRequestOptions,
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

    const result = await this.executeScript(connectorUrl, script, options);

    return result;
  }

  /**
   * Get QR code for WhatsApp authentication
   * @param connectorUrl The URL of the WhatsApp connector
   */
  async getQRCode(
    connectorUrl: string,
    options?: ConnectorRequestOptions,
  ): Promise<{
    success: boolean;
    qrCode?: string;
    message?: string;
  }> {
    this.logger.debug(`[CONNECTOR] Requesting QR code from: ${connectorUrl}`);

    const instance = this.getAxiosInstance(connectorUrl);
    const response = await instance.get('/whatsapp/qr', {
      headers: this.buildHeaders(options),
    });

    return response.data;
  }

  /**
   * Restart WhatsApp client to generate a new QR code
   * @param connectorUrl The URL of the WhatsApp connector
   */
  async restartClient(
    connectorUrl: string,
    options?: ConnectorRequestOptions,
  ): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    this.logger.log(
      `[CONNECTOR] Restarting client to get new QR code: ${connectorUrl}`,
    );

    const instance = this.getAxiosInstance(connectorUrl);
    const response = await instance.post('/whatsapp/restart', undefined, {
      headers: this.buildHeaders(options),
    });

    return response.data;
  }

  /**
   * Start WhatsApp client explicitly when connector autostart is disabled
   */
  async startClient(
    connectorUrl: string,
    options?: ConnectorRequestOptions,
  ): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    this.logger.log(`[CONNECTOR] Starting client: ${connectorUrl}`);

    const instance = this.getAxiosInstance(connectorUrl);
    const response = await instance.post('/whatsapp/start', undefined, {
      headers: this.buildHeaders(options),
    });

    return response.data;
  }

  /**
   * Clean and restart WhatsApp client from scratch
   * Removes .wwebjs_cache and data directories to ensure fresh authentication
   * Should ONLY be called when initiating new authentication (NOT during polling)
   * @param connectorUrl The URL of the WhatsApp connector
   */
  async cleanAndRestartClient(
    connectorUrl: string,
    options?: ConnectorRequestOptions,
  ): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    this.logger.log(
      `[CONNECTOR] Cleaning and restarting client for fresh authentication: ${connectorUrl}`,
    );

    const instance = this.getAxiosInstance(connectorUrl);
    const response = await instance.post('/whatsapp/clean-restart', undefined, {
      headers: this.buildHeaders(options),
    });

    return response.data;
  }
}
