import { randomUUID } from 'crypto';

import { User } from '@app/generated/client';
import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { UserSyncService } from '../whatsapp-agent/user-sync.service';

import { CreateSupportFeedbackDto } from './dto/create-support-feedback.dto';
import { ImportWhatsAppDataResponseDto } from './dto/import-whatsapp-data-response.dto';
import { SupportFeedbackResponseDto } from './dto/support-feedback-response.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const SENTRY_API_VERSION = '7';
const FEEDBACK_SDK_NAME = 'whatsapp-agent-backend.feedback-relay';
const FEEDBACK_SDK_VERSION = '1.0.0';

type SentryDsn = {
  host: string;
  path: string;
  projectId: string;
  protocol: string;
  publicKey: string;
};

function parseDsn(rawDsn: string): SentryDsn | null {
  try {
    const url = new URL(rawDsn);
    const pathname = url.pathname.replace(/^\/+/, '');
    const pathSegments = pathname.split('/').filter(Boolean);
    const projectId = pathSegments.pop();

    if (!projectId || !url.username) {
      return null;
    }

    return {
      host: url.host,
      path: pathSegments.join('/'),
      projectId,
      protocol: url.protocol,
      publicKey: url.username,
    };
  } catch {
    return null;
  }
}

function buildEnvelopeEndpoint(dsn: SentryDsn) {
  const pathPrefix = dsn.path ? `/${dsn.path}` : '';
  const query = new URLSearchParams({
    sentry_client: `${FEEDBACK_SDK_NAME}/${FEEDBACK_SDK_VERSION}`,
    sentry_key: dsn.publicKey,
    sentry_version: SENTRY_API_VERSION,
  });

  return `${dsn.protocol}//${dsn.host}${pathPrefix}/api/${dsn.projectId}/envelope/?${query.toString()}`;
}

function generateEventId() {
  return randomUUID().replace(/-/g, '');
}

function buildEnvelope(eventId: string, payload: Record<string, unknown>) {
  const header = {
    event_id: eventId,
    sdk: {
      name: FEEDBACK_SDK_NAME,
      version: FEEDBACK_SDK_VERSION,
    },
    sent_at: new Date().toISOString(),
  };

  return `${JSON.stringify(header)}\n${JSON.stringify({ type: 'feedback' })}\n${JSON.stringify(payload)}`;
}

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userSyncService: UserSyncService,
  ) {}

  /**
   * Get user by ID with all relations
   */
  async getById(userId: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        whatsappAgent: true,
        businessInfo: true,
        subscription: true,
      },
    });
  }

  /**
   * Get user by phone number
   */
  async getByPhoneNumber(phoneNumber: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { phoneNumber },
    });
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, data: UpdateUserDto): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  /**
   * Import WhatsApp Business data for a user
   * This triggers a manual synchronization of user data using page scripts
   */
  async importWhatsAppData(
    userId: string,
  ): Promise<ImportWhatsAppDataResponseDto> {
    this.logger.log(`Manually triggering data sync for user ${userId}`);

    try {
      const user = await this.getById(userId);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      if (!user.phoneNumber) {
        throw new InternalServerErrorException('User phone number not found');
      }

      // Trigger synchronization using UserSyncService
      // This will execute the page scripts to fetch fresh data
      await this.userSyncService.synchronizeUserData(user.phoneNumber);

      // Get updated business info and product count
      const businessInfo = await this.prisma.businessInfo.findUnique({
        where: { user_id: userId },
      });

      const productsCount = await this.prisma.product.count({
        where: { user_id: userId },
      });

      this.logger.log(`Successfully synchronized data for user ${userId}`);

      return {
        businessInfo,
        productsImported: productsCount,
        contactsImported: 0, // Contacts are not imported via page scripts yet
      };
    } catch (error) {
      this.logger.error(
        `Error synchronizing WhatsApp data for user ${userId}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to synchronize WhatsApp data. Please ensure your WhatsApp is connected.',
      );
    }
  }

  async submitSupportFeedback(
    userId: string,
    payload: CreateSupportFeedbackDto,
  ): Promise<SupportFeedbackResponseDto> {
    const parsedDsn = parseDsn(payload.sentry.dsn.trim());

    if (!parsedDsn) {
      throw new BadRequestException(
        'La configuration Sentry du feedback est invalide.',
      );
    }

    const eventId = generateEventId();
    const trimmedMessage = payload.message.trim();
    const trimmedSubject = payload.subject?.trim();
    const feedbackMessage = trimmedSubject
      ? `${trimmedSubject}\n\n${trimmedMessage}`
      : trimmedMessage;
    const requestUrl = payload.context?.url;
    const sentryPayload: Record<string, unknown> = {
      contexts: {
        app: {
          app_area: payload.context?.appArea,
          context_score: payload.context?.contextScore,
          current_plan: payload.context?.currentPlan,
          route: payload.context?.route,
          timezone: payload.context?.timezone,
        },
        feedback: {
          contact_email: payload.email,
          message: feedbackMessage,
          name: payload.name,
          source: 'support-page',
          url: requestUrl,
        },
      },
      environment: payload.sentry.environment,
      event_id: eventId,
      level: 'info',
      platform: 'javascript',
      release: payload.sentry.release,
      request: requestUrl
        ? {
            url: requestUrl,
          }
        : undefined,
      tags: {
        app_area: payload.context?.appArea || 'dashboard',
        category: payload.category,
        current_plan: payload.context?.currentPlan,
        feature: 'support-feedback',
      },
      timestamp: Math.floor(Date.now() / 1000),
      type: 'feedback',
      user: {
        email: payload.email,
        id: userId,
        username: payload.name,
      },
    };

    try {
      const response = await fetch(buildEnvelopeEndpoint(parsedDsn), {
        body: buildEnvelope(eventId, sentryPayload),
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8',
        },
        method: 'POST',
      });

      if (!response.ok) {
        const responseBody = await response.text();

        this.logger.error(
          `Sentry rejected support feedback for user ${userId} with status ${response.status}: ${responseBody}`,
        );

        throw new InternalServerErrorException(
          "Le support n'a pas pu recevoir votre message.",
        );
      }

      return { eventId };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(
        `Failed to relay support feedback for user ${userId}`,
        error,
      );

      throw new InternalServerErrorException(
        "Le support n'a pas pu recevoir votre message.",
      );
    }
  }

  /**
   * Get user statistics
   * Note: Messages and conversations are live WhatsApp data, not stored in DB
   */
  async getStats(userId: string): Promise<{
    ordersCount: number;
    creditsUsed: number;
    creditsRemaining: number;
    productsCount: number;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscription: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get orders count
    const ordersCount = await this.prisma.order.count({
      where: { userId },
    });

    // Get products count
    const productsCount = await this.prisma.product.count({
      where: { user_id: userId },
    });

    // Calculate credits used
    const creditHistory = await this.prisma.credit.findMany({
      where: {
        userId,
        type: 'USAGE',
      },
    });

    const creditsUsed = creditHistory.reduce(
      (sum, credit) => sum + Math.abs(credit.amount),
      0,
    );

    return {
      ordersCount,
      creditsUsed,
      creditsRemaining: user.credits,
      productsCount,
    };
  }
}
