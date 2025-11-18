import {
  Injectable,
  NotFoundException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectorClientService } from '../connector-client/connector-client.service';
import { WhatsAppAgentService } from '../whatsapp-agent/whatsapp-agent.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { ImportWhatsAppDataResponseDto } from './dto/import-whatsapp-data-response.dto';
import { User } from '@app/generated/client';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly connectorClient: ConnectorClientService,
    private readonly whatsappAgentService: WhatsAppAgentService,
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
  async updateProfile(
    userId: string,
    data: UpdateUserDto,
  ): Promise<User> {
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
   */
  async importWhatsAppData(
    userId: string,
  ): Promise<ImportWhatsAppDataResponseDto> {
    this.logger.log(`Importing WhatsApp data for user ${userId}`);

    try {
      // Get agent URL for user
      const agentUrl = await this.whatsappAgentService.getAgentUrl(userId);
      const user = await this.getById(userId);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Get business profile
      const businessProfileData = await this.connectorClient.getBusinessProfile(
        agentUrl,
        user.id,
      );

      // Get catalog
      const catalogData = await this.connectorClient.getCatalog(agentUrl, user.id);

      // Get contacts
      const contactsData = await this.connectorClient.getContacts(
        agentUrl,
        user.id,
      );

      // Update/create BusinessInfo record
      const businessInfo = await this.upsertBusinessInfo(
        userId,
        businessProfileData,
      );

      // Create Product records from catalog
      const productsImported = await this.importProducts(userId, catalogData);

      // Update user.whatsappProfile with data
      await this.updateWhatsAppProfile(userId, businessProfileData);

      // Count contacts imported (just for tracking)
      const contactsImported = Array.isArray(contactsData)
        ? contactsData.length
        : 0;

      this.logger.log(
        `Successfully imported data for user ${userId}: ${productsImported} products, ${contactsImported} contacts`,
      );

      return {
        businessInfo,
        productsImported,
        contactsImported,
      };
    } catch (error) {
      this.logger.error(
        `Error importing WhatsApp data for user ${userId}`,
        error,
      );
      throw new InternalServerErrorException(
        'Failed to import WhatsApp data. Please ensure your WhatsApp agent is connected.',
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
      where: { userId },
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

  /**
   * Upsert BusinessInfo from WhatsApp Business Profile
   */
  private async upsertBusinessInfo(
    userId: string,
    businessProfileData: any,
  ): Promise<any> {
    const profile = businessProfileData?.profile || businessProfileData || {};

    const businessData = {
      name: profile.name || profile.businessName || null,
      description: profile.description || profile.about || null,
      address: profile.address || null,
      city: profile.city || null,
      country: profile.country || null,
      website: profile.website || profile.websites?.[0] || null,
      phoneNumbers: profile.phoneNumbers || [],
    };

    return this.prisma.businessInfo.upsert({
      where: { userId },
      create: {
        userId,
        ...businessData,
      },
      update: businessData,
    });
  }

  /**
   * Import products from WhatsApp catalog
   */
  private async importProducts(
    userId: string,
    catalogData: any,
  ): Promise<number> {
    const products = catalogData?.products || catalogData || [];

    if (!Array.isArray(products) || products.length === 0) {
      return 0;
    }

    let importedCount = 0;

    for (const whatsappProduct of products) {
      try {
        // Check if product already exists by whatsappProductId
        const existingProduct = whatsappProduct.id
          ? await this.prisma.product.findFirst({
              where: {
                userId,
                whatsappProductId: whatsappProduct.id,
              },
            })
          : null;

        if (existingProduct) {
          // Update existing product
          await this.prisma.product.update({
            where: { id: existingProduct.id },
            data: {
              name: whatsappProduct.name || whatsappProduct.title,
              description: whatsappProduct.description,
              price: whatsappProduct.price
                ? parseFloat(whatsappProduct.price)
                : null,
              currency: whatsappProduct.currency || 'XAF',
              category: whatsappProduct.category,
              images: whatsappProduct.images || [],
            },
          });
        } else {
          // Create new product
          await this.prisma.product.create({
            data: {
              userId,
              whatsappProductId: whatsappProduct.id || null,
              name: whatsappProduct.name || whatsappProduct.title,
              description: whatsappProduct.description,
              price: whatsappProduct.price
                ? parseFloat(whatsappProduct.price)
                : null,
              currency: whatsappProduct.currency || 'XAF',
              category: whatsappProduct.category,
              images: whatsappProduct.images || [],
            },
          });
        }

        importedCount++;
      } catch (error) {
        this.logger.error(
          `Error importing product ${whatsappProduct.name}`,
          error,
        );
        // Continue with next product
      }
    }

    return importedCount;
  }

  /**
   * Update user's WhatsApp profile data
   */
  private async updateWhatsAppProfile(
    userId: string,
    businessProfileData: any,
  ): Promise<void> {
    const profile = businessProfileData?.profile || businessProfileData || {};

    const whatsappProfile = {
      pseudo: profile.name || profile.pushname,
      avatar: profile.profilePictureUrl || profile.avatar,
      verifiedName: profile.verifiedName,
      businessProfile: profile,
      importedAt: new Date().toISOString(),
    };

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        whatsappProfile,
      },
    });
  }
}
