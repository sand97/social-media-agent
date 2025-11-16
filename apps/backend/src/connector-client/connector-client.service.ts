import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { Observable, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

@Injectable()
export class ConnectorClientService {
  private readonly logger = new Logger(ConnectorClientService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Request a pairing code for WhatsApp authentication
   * @param connectorUrl The URL of the WhatsApp connector for this user
   * @param phoneNumber The phone number to pair
   */
  requestPairingCode(
    connectorUrl: string,
    phoneNumber: string,
  ): Observable<any> {
    const url = `${connectorUrl}/whatsapp/request-pairing-code`;

    return this.httpService.post(url, { phoneNumber }).pipe(
      map((response) => response.data),
      catchError((error: AxiosError) => {
        this.logger.error(
          `Error requesting pairing code: ${error.message}`,
          error.stack,
        );
        return throwError(() => error);
      }),
    );
  }

  /**
   * Send a message via WhatsApp
   * @param connectorUrl The URL of the WhatsApp connector for this user
   */
  sendMessage(
    connectorUrl: string,
    to: string,
    message: string,
  ): Observable<any> {
    const url = `${connectorUrl}/whatsapp/send`;

    return this.httpService.post(url, { to, message }).pipe(
      map((response) => response.data),
      catchError((error: AxiosError) => {
        this.logger.error(
          `Error sending message: ${error.message}`,
          error.stack,
        );
        return throwError(() => error);
      }),
    );
  }

  /**
   * Get WhatsApp connection status
   * @param connectorUrl The URL of the WhatsApp connector for this user
   */
  getStatus(connectorUrl: string): Observable<any> {
    const url = `${connectorUrl}/whatsapp/status`;

    return this.httpService.get(url).pipe(
      map((response) => response.data),
      catchError((error: AxiosError) => {
        this.logger.error(
          `Error getting status: ${error.message}`,
          error.stack,
        );
        return throwError(() => error);
      }),
    );
  }

  /**
   * Get WhatsApp contacts
   * @param connectorUrl The URL of the WhatsApp connector for this user
   */
  getContacts(connectorUrl: string): Observable<any> {
    const url = `${connectorUrl}/whatsapp/contacts`;

    return this.httpService.get(url).pipe(
      map((response) => response.data),
      catchError((error: AxiosError) => {
        this.logger.error(
          `Error getting contacts: ${error.message}`,
          error.stack,
        );
        return throwError(() => error);
      }),
    );
  }

  /**
   * Get WhatsApp chats
   * @param connectorUrl The URL of the WhatsApp connector for this user
   */
  getChats(connectorUrl: string): Observable<any> {
    const url = `${connectorUrl}/whatsapp/chats`;

    return this.httpService.get(url).pipe(
      map((response) => response.data),
      catchError((error: AxiosError) => {
        this.logger.error(`Error getting chats: ${error.message}`, error.stack);
        return throwError(() => error);
      }),
    );
  }

  /**
   * Get WhatsApp Business profile
   * @param connectorUrl The URL of the WhatsApp connector for this user
   */
  getBusinessProfile(connectorUrl: string): Observable<any> {
    const url = `${connectorUrl}/whatsapp/business-profile`;

    return this.httpService.get(url).pipe(
      map((response) => response.data),
      catchError((error: AxiosError) => {
        this.logger.error(
          `Error getting business profile: ${error.message}`,
          error.stack,
        );
        return throwError(() => error);
      }),
    );
  }

  /**
   * Get WhatsApp Business catalog
   * @param connectorUrl The URL of the WhatsApp connector for this user
   */
  getCatalog(connectorUrl: string): Observable<any> {
    const url = `${connectorUrl}/whatsapp/catalog`;

    return this.httpService.get(url).pipe(
      map((response) => response.data),
      catchError((error: AxiosError) => {
        this.logger.error(
          `Error getting catalog: ${error.message}`,
          error.stack,
        );
        return throwError(() => error);
      }),
    );
  }
}
