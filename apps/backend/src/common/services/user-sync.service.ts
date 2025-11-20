import { ConnectorClientService } from '@app/connector-client';
import { PageScriptService } from '@app/page-scripts';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../prisma/prisma.service';

import { TokenService } from './token.service';

/**
 * Service responsible for synchronizing user data after WhatsApp connection
 * This includes profile info, business info, catalog, etc.
 */
@Injectable()
export class UserSyncService {
  private readonly logger = new Logger(UserSyncService.name);

  constructor(
    private readonly pageScriptService: PageScriptService,
    private readonly connectorClientService: ConnectorClientService,
    private readonly configService: ConfigService,
    private readonly tokenService: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Synchronize all user data after WhatsApp pairing
   * This is called after the "ready" event is received from WhatsApp
   *
   * @param phoneNumber - User's phone number (WhatsApp ID)
   * @returns Promise<void>
   */
  async synchronizeUserData(phoneNumber: string): Promise<void> {
    this.logger.log(`🔄 [START] User data synchronization for: ${phoneNumber}`);

    try {
      // Step 1: Execute client info script (profile, business info, avatar)
      await this.syncClientInfo(phoneNumber);

      // Step 2: Execute catalog script (collections, products, images)
      await this.syncCatalog(phoneNumber);

      this.logger.log(
        `✅ [END] User data synchronization completed for: ${phoneNumber}`,
      );
    } catch (error: any) {
      this.logger.error(
        `❌ [ERROR] User data synchronization failed for ${phoneNumber}: ${error.message}`,
        error.stack,
      );
      // We don't throw here to prevent blocking the pairing verification
      // The sync can be retried later
    }
  }

  /**
   * Synchronize client information (profile name, avatar, business info)
   *
   * @param clientId - WhatsApp client ID (phone number)
   * @returns Promise<void>
   */
  private async syncClientInfo(clientId: string): Promise<void> {
    this.logger.log(`🚀 [START] Executing client info script for: ${clientId}`);

    try {
      // Generate a JWT token signed with the clientId
      this.logger.debug(`[CLIENT-INFO] Generating upload token...`);
      const uploadToken =
        this.tokenService.generateCatalogUploadToken(clientId);
      this.logger.debug(`[CLIENT-INFO] Token generated successfully`);

      // Generate the script with variables
      this.logger.debug(`[CLIENT-INFO] Generating page script...`);
      const script = this.pageScriptService.getClientInfoScript({
        BACKEND_URL:
          this.configService.get<string>('BACKEND_URL') ||
          'http://localhost:3000',
        TOKEN: uploadToken,
      });
      this.logger.debug(`[CLIENT-INFO] Script generated successfully`);

      // Send the script to connector for execution
      this.logger.debug(`[CLIENT-INFO] Sending script to connector...`);
      const result = await this.connectorClientService.executeScript(script);

      if (result.success) {
        this.logger.log(
          `✅ [END] Client info script executed successfully for ${clientId}`,
        );
        this.logger.debug(`[CLIENT-INFO] Result:`, result.result);
      } else {
        this.logger.error(
          `❌ [ERROR] Client info script execution failed for ${clientId}`,
          result.error,
        );
        throw new Error(
          `Client info script failed: ${result.error || 'Unknown error'}`,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `❌ [ERROR] Failed to sync client info for ${clientId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Synchronize catalog data (collections, products, images)
   *
   * @param clientId - WhatsApp client ID (phone number)
   * @returns Promise<void>
   */
  private async syncCatalog(clientId: string): Promise<void> {
    this.logger.log(`🚀 [START] Executing catalog script for: ${clientId}`);

    try {
      // Generate a JWT token signed with the clientId
      this.logger.debug(`[CATALOG] Generating upload token...`);
      const uploadToken =
        this.tokenService.generateCatalogUploadToken(clientId);
      this.logger.debug(`[CATALOG] Token generated successfully`);

      // Récupérer les images existantes pour cet utilisateur
      this.logger.debug(`[CATALOG] Fetching existing images...`);
      const cleanedClientId = '+'
        .concat(clientId.replace(/@[a-z.]+$/i, ''))
        .replace('++', '+');

      const user = await this.prisma.user.findUnique({
        where: { phoneNumber: cleanedClientId },
        select: { id: true },
      });

      let initialOriginalsUrls: Array<{
        id: string;
        original_url: string;
        url: string;
      }> = [];

      if (user) {
        const existingImages = await this.prisma.productImage.findMany({
          where: {
            product: {
              user_id: user.id,
            },
          },
          select: {
            id: true,
            original_url: true,
            url: true,
          },
        });

        // Filtrer pour ne garder que les images avec original_url
        initialOriginalsUrls = existingImages
          .filter((img) => img.original_url)
          .map((img) => ({
            id: img.id,
            original_url: img.original_url!,
            url: img.url,
          }));

        this.logger.debug(
          `[CATALOG] Found ${initialOriginalsUrls.length} existing images`,
        );
      } else {
        this.logger.debug(`[CATALOG] User not found, assuming first sync`);
      }

      // Generate the script with variables
      this.logger.debug(`[CATALOG] Generating page script...`);
      const script = this.pageScriptService.getGetCatalogScript({
        BACKEND_URL:
          this.configService.get<string>('BACKEND_URL') ||
          'http://localhost:3000',
        TOKEN: uploadToken,
        INITIAL_ORIGINALS_URLS: JSON.stringify(initialOriginalsUrls),
      });
      this.logger.debug(`[CATALOG] Script generated successfully`);

      // Send the script to connector for execution
      this.logger.debug(`[CATALOG] Sending script to connector...`);
      const result = await this.connectorClientService.executeScript(script);

      if (result.success) {
        this.logger.log(
          `✅ [END] Catalog script executed successfully for ${clientId}`,
        );
        this.logger.debug(`[CATALOG] Result:`, result.result);
      } else {
        this.logger.error(
          `❌ [ERROR] Catalog script execution failed for ${clientId}`,
          result.error,
        );
        throw new Error(
          `Catalog script failed: ${result.error || 'Unknown error'}`,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `❌ [ERROR] Failed to sync catalog for ${clientId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
