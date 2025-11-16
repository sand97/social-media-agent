import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { Observable, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

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
}
