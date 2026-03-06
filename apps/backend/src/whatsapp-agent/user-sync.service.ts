import { ConnectorClientService } from '@app/connector-client';
import { PageScriptService } from '@app/page-scripts';
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { TokenService } from '../common/services/token.service';
import { MinioService } from '../minio/minio.service';
import { OnboardingGateway } from '../onboarding/onboarding.gateway';
import { OnboardingService } from '../onboarding/onboarding.service';
import { PrismaService } from '../prisma/prisma.service';

import { WhatsAppAgentService } from './whatsapp-agent.service';
import {
  normalizeStoredCatalogImageUrl,
  partitionCatalogImagesByMinioPresence,
} from './catalog-image-sync.utils';

/**
 * Service responsible for synchronizing user data after WhatsApp connection
 * This includes profile info, business info, catalog, etc.
 * Now with WebSocket progress tracking!
 */
@Injectable()
export class UserSyncService {
  private readonly logger = new Logger(UserSyncService.name);

  constructor(
    private readonly pageScriptService: PageScriptService,
    private readonly connectorClientService: ConnectorClientService,
    private readonly configService: ConfigService,
    private readonly tokenService: TokenService,
    private readonly minioService: MinioService,
    private readonly prisma: PrismaService,
    private readonly whatsappAgentService: WhatsAppAgentService,
    @Inject(forwardRef(() => OnboardingGateway))
    private readonly onboardingGateway: OnboardingGateway,
    @Inject(forwardRef(() => OnboardingService))
    private readonly onboardingService: OnboardingService,
  ) {}

  /**
   * Update sync progress in WhatsAppAgent and emit WebSocket event
   */
  private async updateSyncProgress(
    userId: string,
    step: 'clientInfo' | 'catalog',
    status: 'started' | 'in_progress' | 'completed' | 'failed',
    progress?: number,
    details?: string,
  ): Promise<void> {
    try {
      const agent = await this.whatsappAgentService.getAgentForUser(userId);
      if (!agent) return;

      // Get current syncProgress
      const currentProgress = (agent.syncProgress as any) || {};

      // Update progress for this step
      const updatedProgress = {
        ...currentProgress,
        [step]: {
          status,
          progress: progress ?? 100,
          details,
          timestamp: new Date().toISOString(),
        },
      };

      // Determine overall syncStatus
      let syncStatus: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' =
        'IN_PROGRESS';

      if (
        updatedProgress.clientInfo?.status === 'completed' &&
        updatedProgress.catalog?.status === 'completed'
      ) {
        syncStatus = 'COMPLETED';
      } else if (
        updatedProgress.clientInfo?.status === 'failed' ||
        updatedProgress.catalog?.status === 'failed'
      ) {
        syncStatus = 'FAILED';
      }

      // Update in database
      await this.prisma.whatsAppAgent.update({
        where: { id: agent.id },
        data: {
          syncProgress: updatedProgress,
          syncStatus,
        },
      });

      // Emit WebSocket event
      this.onboardingGateway.emitSyncProgress(userId, {
        step,
        status,
        progress,
        details,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(`Failed to update sync progress`, error);
    }
  }

  /**
   * Synchronize all user data after WhatsApp pairing
   * This is called after the "ready" event is received from WhatsApp
   *
   * @param phoneNumber - User's phone number (WhatsApp ID)
   * @returns Promise<void>
   */
  async synchronizeUserData(phoneNumber: string): Promise<void> {
    this.logger.log(`🔄 [START] User data synchronization for: ${phoneNumber}`);

    // Get user ID
    const cleanedPhoneNumber = '+'
      .concat(phoneNumber.replace(/@[a-z.]+$/i, ''))
      .replace('++', '+');

    const user = await this.prisma.user.findUnique({
      where: { phoneNumber: cleanedPhoneNumber },
    });

    if (!user) {
      this.logger.error(`User not found for: ${cleanedPhoneNumber}`);
      return;
    }

    try {
      // Set sync status to IN_PROGRESS
      const agent = await this.whatsappAgentService.getAgentForUser(user.id);
      if (agent) {
        await this.prisma.whatsAppAgent.update({
          where: { id: agent.id },
          data: { syncStatus: 'IN_PROGRESS' },
        });
      }

      let clientInfoFailed = false;
      let catalogFailed = false;

      // Step 1: Execute client info script (profile, business info, avatar)
      try {
        await this.syncClientInfo(phoneNumber, user.id);
      } catch (error: any) {
        clientInfoFailed = true;
        this.logger.error(
          `⚠️ Client info sync failed for ${phoneNumber}: ${error.message}`,
        );
      }

      // Step 2: Execute catalog script (collections, products, images)
      try {
        await this.syncCatalog(phoneNumber, user.id);
      } catch (error: any) {
        catalogFailed = true;
        this.logger.error(
          `⚠️ Catalog sync failed for ${phoneNumber}: ${error.message}`,
        );
      }

      if (!clientInfoFailed && !catalogFailed) {
        this.logger.log(
          `✅ [END] User data synchronization completed for: ${phoneNumber}`,
        );

        // Step 3: Trigger initial AI evaluation for onboarding
        // Only if thread doesn't exist or has no messages yet
        const existingThread =
          await this.onboardingService.getThreadWithMessages(user.id);
        const hasMessages =
          existingThread && existingThread.messages.length > 0;

        if (!hasMessages) {
          this.logger.log(
            `🤖 Triggering initial AI evaluation for user: ${user.id}`,
          );
          // This is done in the background to avoid blocking the sync completion
          this.onboardingService
            .performInitialEvaluation(user.id)
            .catch((error) => {
              this.logger.error(
                `Failed to perform initial AI evaluation for user ${user.id}: ${error.message}`,
                error.stack,
              );
            });
        } else {
          this.logger.log(
            `⏭️ Skipping AI evaluation for user ${user.id}: thread already exists with ${existingThread.messages.length} messages`,
          );
        }
      } else {
        this.logger.warn(
          `⚠️ User data synchronization completed with errors for: ${phoneNumber} (clientInfo=${clientInfoFailed ? 'failed' : 'ok'}, catalog=${catalogFailed ? 'failed' : 'ok'})`,
        );
      }
    } catch (error: any) {
      this.logger.error(
        `❌ [ERROR] User data synchronization failed for ${phoneNumber}: ${error.message}`,
        error.stack,
      );

      // Mark sync as failed
      const agent = await this.whatsappAgentService.getAgentForUser(user.id);
      if (agent) {
        await this.prisma.whatsAppAgent.update({
          where: { id: agent.id },
          data: { syncStatus: 'FAILED' },
        });
      }

      // We don't throw here to prevent blocking the pairing verification
      // The sync can be retried later
    }
  }

  /**
   * Synchronize client information (profile name, avatar, business info)
   *
   * @param clientId - WhatsApp client ID (phone number)
   * @param userId - User ID
   * @returns Promise<void>
   */
  private async syncClientInfo(
    clientId: string,
    userId: string,
  ): Promise<void> {
    this.logger.log(`🚀 [START] Executing client info script for: ${clientId}`);

    // Emit started event
    await this.updateSyncProgress(userId, 'clientInfo', 'started');
    this.onboardingGateway.emitSyncStarted(userId, 'clientInfo');

    try {
      // Get user and agent to retrieve connectorUrl
      const cleanedClientId = '+'
        .concat(clientId.replace(/@[a-z.]+$/i, ''))
        .replace('++', '+');

      const user = await this.prisma.user.findUnique({
        where: { phoneNumber: cleanedClientId },
      });

      if (!user) {
        throw new Error(`User not found for phone number: ${cleanedClientId}`);
      }

      const agent = await this.whatsappAgentService.getAgentForUser(user.id);
      if (!agent) {
        throw new Error(`Agent not found for user: ${user.id}`);
      }

      const connectorUrl =
        await this.whatsappAgentService.getConnectorUrl(agent);

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
      const result = await this.connectorClientService.executeScript(
        connectorUrl,
        script,
      );

      if (result.success) {
        this.logger.log(
          `✅ [END] Client info script executed successfully for ${clientId}`,
        );
        this.logger.debug(`[CLIENT-INFO] Result:`, result.result);

        // Emit completed event
        await this.updateSyncProgress(userId, 'clientInfo', 'completed', 100);
        this.onboardingGateway.emitSyncCompleted(userId, 'clientInfo');
      } else {
        this.logger.error(
          `❌ [ERROR] Client info script execution failed for ${clientId}`,
          result.error,
        );

        // Emit failed event
        await this.updateSyncProgress(
          userId,
          'clientInfo',
          'failed',
          0,
          result.error,
        );
        this.onboardingGateway.emitSyncFailed(
          userId,
          'clientInfo',
          result.error || 'Unknown error',
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

      // Emit failed event
      await this.updateSyncProgress(
        userId,
        'clientInfo',
        'failed',
        0,
        error.message,
      );
      this.onboardingGateway.emitSyncFailed(
        userId,
        'clientInfo',
        error.message,
      );

      throw error;
    }
  }

  private async purgeMissingMinioCatalogImages<
    T extends {
      id: string;
      original_url: string | null;
      normalized_url: string | null;
      url: string;
    },
  >(
    userId: string,
    images: T[],
  ): Promise<T[]> {
    if (images.length === 0) {
      return images;
    }

    const {
      reusableImages,
      missingImageIds,
      missingImages,
      unverifiableImages,
      invalidUrlImages,
    } = await partitionCatalogImagesByMinioPresence(images, {
      getObjectKeyFromUrl: (url) => this.minioService.getObjectKeyFromUrl(url),
      fileExists: (objectKey) => this.minioService.fileExists(objectKey),
    });

    if (missingImageIds.length > 0) {
      for (const entry of missingImages) {
        this.logger.warn(
          `[CATALOG] Missing MinIO object detected for ProductImage id=${entry.image.id} userId=${userId} objectKey=${entry.objectKey || 'unknown'} minioUrl=${entry.image.url} normalizedUrl=${entry.image.normalized_url || 'null'} originalUrl=${entry.image.original_url || 'null'}`,
        );
      }

      const deleteResult = await this.prisma.productImage.deleteMany({
        where: {
          id: {
            in: missingImageIds,
          },
          product: {
            user_id: userId,
          },
        },
      });

      this.logger.warn(
        `[CATALOG] Removed ${deleteResult.count} ProductImage entries whose MinIO object is missing`,
      );
    }

    for (const entry of unverifiableImages) {
      this.logger.warn(
        `[CATALOG] MinIO verification inconclusive for ProductImage id=${entry.image.id} userId=${userId} objectKey=${entry.objectKey || 'unknown'} minioUrl=${entry.image.url}`,
      );
    }

    for (const entry of invalidUrlImages) {
      this.logger.warn(
        `[CATALOG] MinIO URL could not be parsed for ProductImage id=${entry.image.id} userId=${userId} minioUrl=${entry.image.url}`,
      );
    }

    this.logger.debug(
      `[CATALOG] MinIO validation finished: userId=${userId}, reusable=${reusableImages.length}, missingRemoved=${missingImageIds.length}, unverifiableKept=${unverifiableImages.length}, invalidUrlKept=${invalidUrlImages.length}`,
    );

    return reusableImages;
  }

  /**
   * Synchronize catalog data (collections, products, images)
   *
   * @param clientId - WhatsApp client ID (phone number)
   * @param userId - User ID
   * @returns Promise<void>
   */
  private async syncCatalog(clientId: string, userId: string): Promise<void> {
    this.logger.log(`🚀 [START] Executing catalog script for: ${clientId}`);

    // Emit started event
    await this.updateSyncProgress(userId, 'catalog', 'started');
    this.onboardingGateway.emitSyncStarted(userId, 'catalog');

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

      if (!user) {
        throw new Error(`User not found for phone number: ${cleanedClientId}`);
      }

      let initialOriginalsUrls: Array<{
        id: string;
        original_url: string;
        normalized_url: string;
        url: string;
      }> = [];

      const existingImages = await this.prisma.productImage.findMany({
        where: {
          product: {
            user_id: user.id,
          },
        },
        select: {
          id: true,
          original_url: true,
          normalized_url: true,
          url: true,
        },
      });

      const verifiedExistingImages = await this.purgeMissingMinioCatalogImages(
        user.id,
        existingImages,
      );

      // Filtrer pour ne garder que les images avec normalized_url (ou original_url pour rétrocompatibilité)
      initialOriginalsUrls = verifiedExistingImages.reduce<
        Array<{
          id: string;
          original_url: string;
          normalized_url: string;
          url: string;
        }>
      >((accumulator, image) => {
        const normalizedUrl = normalizeStoredCatalogImageUrl(image);

        if (!normalizedUrl) {
          return accumulator;
        }

        accumulator.push({
          id: image.id,
          original_url: image.original_url || '',
          normalized_url: normalizedUrl,
          url: image.url,
        });

        return accumulator;
      }, []);

      this.logger.debug(
        `[CATALOG] Found ${initialOriginalsUrls.length} existing images`,
      );

      const agent = await this.whatsappAgentService.getAgentForUser(user.id);
      if (!agent) {
        throw new Error(`Agent not found for user: ${user.id}`);
      }

      const connectorUrl =
        await this.whatsappAgentService.getConnectorUrl(agent);

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
      const result = await this.connectorClientService.executeScript(
        connectorUrl,
        script,
      );

      if (result.success) {
        this.logger.log(
          `✅ [END] Catalog script executed successfully for ${clientId}`,
        );
        this.logger.debug(`[CATALOG] Result:`, result.result);

        // Emit completed event
        await this.updateSyncProgress(userId, 'catalog', 'completed', 100);
        this.onboardingGateway.emitSyncCompleted(userId, 'catalog');
      } else {
        this.logger.error(
          `❌ [ERROR] Catalog script execution failed for ${clientId}`,
          result.error,
        );

        // Emit failed event
        await this.updateSyncProgress(
          userId,
          'catalog',
          'failed',
          0,
          result.error,
        );
        this.onboardingGateway.emitSyncFailed(
          userId,
          'catalog',
          result.error || 'Unknown error',
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

      // Emit failed event
      await this.updateSyncProgress(
        userId,
        'catalog',
        'failed',
        0,
        error.message,
      );
      this.onboardingGateway.emitSyncFailed(userId, 'catalog', error.message);

      throw error;
    }
  }
}
