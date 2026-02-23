import { BackendClientService } from '@app/backend-client/backend-client.service';
import { CatalogSyncService } from '@app/catalog/catalog-sync.service';
import { Injectable, Logger } from '@nestjs/common';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class PairingSuccessHandlerService {
  private readonly logger = new Logger(PairingSuccessHandlerService.name);

  constructor(
    private readonly backendClient: BackendClientService,
    private readonly catalogSyncService: CatalogSyncService,
  ) {}

  async handle(data: any): Promise<void> {
    this.logger.log('WhatsApp pairing successful', {
      phoneNumber: data?.phoneNumber,
      profile: data?.profile,
    });

    const phoneNumber = data?.phoneNumber;
    const whatsappProfile = data?.profile || {};

    if (!phoneNumber) {
      throw new Error('Missing phone number in pairing_success event');
    }

    try {
      await lastValueFrom(
        this.backendClient.verifyPairingSuccess(phoneNumber, whatsappProfile),
      );

      this.logger.log(`Backend notified of successful pairing for ${phoneNumber}`);

      await this.catalogSyncService.triggerManualSync().catch((error) => {
        this.logger.error(
          'Failed to trigger catalog sync after pairing:',
          error.message,
        );
      });
    } catch (backendError: any) {
      this.logger.error(
        'Failed to notify backend of pairing:',
        backendError.message,
      );
    }
  }
}
