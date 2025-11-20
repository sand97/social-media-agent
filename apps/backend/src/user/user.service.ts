import { User } from '@app/generated/client';
import {
  Injectable,
  NotFoundException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';

import { UserSyncService } from '../common/services/user-sync.service';
import { PrismaService } from '../prisma/prisma.service';

import { ImportWhatsAppDataResponseDto } from './dto/import-whatsapp-data-response.dto';
import { UpdateUserDto } from './dto/update-user.dto';

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

  /**
   * Get user statistics
   */
  async getStats(userId: string): Promise<{
    messagesCount: number;
    ordersCount: number;
    creditsUsed: number;
    creditsRemaining: number;
    productsCount: number;
    conversationsCount: number;
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

    // Get messages count
    const messagesCount = await this.prisma.message.count({
      where: {
        userId,
        isGeneratedByAI: true,
      },
    });

    // Get orders count
    const ordersCount = await this.prisma.order.count({
      where: { userId },
    });

    // Get products count
    const productsCount = await this.prisma.product.count({
      where: { user_id: userId },
    });

    // Get conversations count
    const conversationsCount = await this.prisma.conversation.count({
      where: { userId },
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
      messagesCount,
      ordersCount,
      creditsUsed,
      creditsRemaining: user.credits,
      productsCount,
      conversationsCount,
    };
  }
}
