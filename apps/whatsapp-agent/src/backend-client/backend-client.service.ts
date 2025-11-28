import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { Observable, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

import {
  CanProcessRequest,
  CanProcessResponse,
  LogOperationRequest,
  LogOperationResponse,
} from './backend-api.types';

@Injectable()
export class BackendClientService {
  private readonly logger = new Logger(BackendClientService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    const baseUrl = this.configService.get<string>('BACKEND_URL');
    if (!baseUrl) {
      throw new Error('Missing BACKEND_URL');
    }
    this.baseUrl = baseUrl;
    this.logger.log(`Backend URL configured: ${this.baseUrl}`);
  }

  /**
   * Notify backend that WhatsApp pairing was successful
   * @param phoneNumber The user's phone number
   * @param whatsappProfile The WhatsApp profile information
   */
  verifyPairingSuccess(
    phoneNumber: string,
    whatsappProfile: any,
  ): Observable<any> {
    const url = `${this.baseUrl}/auth/verify-pairing`;

    this.logger.log(
      `Notifying backend of successful pairing for: ${phoneNumber}`,
    );

    return this.httpService
      .post(url, {
        phoneNumber,
        whatsappProfile,
      })
      .pipe(
        map((response) => {
          this.logger.log(`Backend notified successfully for: ${phoneNumber}`);
          return response.data;
        }),
        catchError((error: AxiosError) => {
          this.logger.error(
            `Error notifying backend for ${phoneNumber}: ${error.message}`,
            error.stack,
          );
          return throwError(() => error);
        }),
      );
  }

  /**
   * Make a GET request to the backend
   * @param path - API endpoint path
   * @param config - Request configuration (params, headers, etc.)
   */
  async get(path: string, config?: any): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    this.logger.debug(`GET ${url}`);

    try {
      const response = await this.httpService.axiosRef.get(url, config);
      return response;
    } catch (error: any) {
      this.logger.error(`Error GET ${url}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Make a POST request to the backend
   * @param path - API endpoint path
   * @param data - Request body data
   * @param config - Request configuration (headers, etc.)
   */
  async post(path: string, data?: any, config?: any): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    this.logger.debug(`POST ${url}`);

    try {
      const response = await this.httpService.axiosRef.post(url, data, config);
      return response;
    } catch (error: any) {
      this.logger.error(`Error POST ${url}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if the agent can process a message
   * Returns agent configuration and authorized groups
   */
  async canProcess(
    chatId: string,
    message: string,
  ): Promise<CanProcessResponse> {
    const url = `${this.baseUrl}/agent/can-process`;
    this.logger.debug(`POST ${url} for chatId: ${chatId}`);

    try {
      const requestData: CanProcessRequest = {
        chatId,
        message,
        timestamp: new Date().toISOString(),
      };

      const response =
        await this.httpService.axiosRef.post<CanProcessResponse>(
          url,
          requestData,
        );

      return response.data;
    } catch (error: any) {
      this.logger.error(
        `Error checking can-process for ${chatId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Log an agent operation to the backend
   */
  async logOperation(
    chatId: string,
    userMessage: string,
    agentResponse: string,
  ): Promise<LogOperationResponse> {
    const url = `${this.baseUrl}/agent/log-operation`;
    this.logger.debug(`POST ${url} for chatId: ${chatId}`);

    try {
      const requestData: LogOperationRequest = {
        chatId,
        userMessage,
        agentResponse,
        timestamp: new Date().toISOString(),
      };

      const response =
        await this.httpService.axiosRef.post<LogOperationResponse>(
          url,
          requestData,
        );

      return response.data;
    } catch (error: any) {
      // Log operation errors are non-critical, just log them
      this.logger.warn(
        `Failed to log operation for ${chatId}: ${error.message}`,
      );
      return { success: false };
    }
  }
}
