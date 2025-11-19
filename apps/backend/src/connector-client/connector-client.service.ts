import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class ConnectorClientService {
  private readonly logger = new Logger(ConnectorClientService.name);
  private axiosInstances: Map<string, AxiosInstance> = new Map();

  constructor(private readonly configService: ConfigService) {}

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
   * @param script The JavaScript code to execute
   */
  async executeScript(script: string): Promise<any> {
    const connectorUrl = this.configService.get<string>(
      'WHATSAPP_CONNECTOR_BASE_URL',
    );
    if (!connectorUrl) {
      throw new Error('WHATSAPP_CONNECTOR_BASE_URL is not configured');
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
   * @param sessionName The session name (user ID)
   */
  async requestPairingCode(
    connectorUrl: string,
    sessionName: string,
  ): Promise<any> {
    this.logger.log(
      `[CONNECTOR] Requesting pairing code for session: ${sessionName}`,
    );

    const instance = this.getAxiosInstance(connectorUrl);
    const response = await instance.post('/whatsapp/request-pairing-code', {
      sessionName,
    });

    return response.data;
  }

  /**
   * Send a message via WhatsApp
   * @param agentUrl The URL of the agent (not used with wa-js, kept for compatibility)
   * @param sessionName The session name (user ID)
   * @param to The recipient phone number
   * @param message The message text
   */
  async sendMessage(
    agentUrl: string,
    sessionName: string,
    to: string,
    message: string,
  ): Promise<any> {
    const connectorUrl = this.configService.get<string>(
      'WHATSAPP_CONNECTOR_BASE_URL',
    );
    if (!connectorUrl) {
      throw new Error('WHATSAPP_CONNECTOR_BASE_URL is not configured');
    }

    this.logger.debug(
      `[CONNECTOR] Sending message to ${to} via session: ${sessionName}`,
    );

    const instance = this.getAxiosInstance(connectorUrl);
    const response = await instance.post('/whatsapp/send-message', {
      sessionName,
      to,
      message,
    });

    return response.data;
  }
}
