import { CryptoService } from '@app/common/crypto.service';
import { UserSyncService } from '@app/common/services/user-sync.service';
import { ConnectorClientService } from '@app/connector-client';
import { UserStatus, ConnectionStatus } from '@app/generated/client';
import { PrismaService } from '@app/prisma/prisma.service';
import { WhatsAppAgentService } from '@app/whatsapp-agent/whatsapp-agent.service';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  Logger,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly cryptoService: CryptoService,
    private readonly configService: ConfigService,
    private readonly whatsappAgentService: WhatsAppAgentService,
    private readonly connectorClientService: ConnectorClientService,
    private readonly userSyncService: UserSyncService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  /**
   * Request a pairing code for WhatsApp authentication
   */
  async requestPairingCode(phoneNumber: string): Promise<{
    code: string;
    pairingToken: string;
    message: string;
  }> {
    try {
      // Check if user exists
      let user = await this.prisma.user.findUnique({
        where: { phoneNumber },
      });

      // Create user if doesn't exist
      if (!user) {
        user = await this.prisma.user.create({
          data: {
            phoneNumber,
            status: UserStatus.PENDING_PAIRING,
          },
        });
        this.logger.log(`Created new user with phone number: ${phoneNumber}`);
      } else if (user.status === UserStatus.ACTIVE) {
        throw new BadRequestException(
          'User is already paired and active. Please use login endpoint.',
        );
      }

      // Provision WhatsApp agent if not exists
      let agent = await this.whatsappAgentService.getAgentForUser(user.id);
      if (!agent) {
        agent = await this.whatsappAgentService.provisionAgent(user.id);
        this.logger.log(`Provisioned WhatsApp agent for user: ${user.id}`);
      }

      // Generate unique pairing token (valid for 2 minutes)
      const pairingToken = this.cryptoService.generateRandomToken(32); // 32 bytes = 64 hex chars
      const pairingTokenExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 2 minutes

      // Update user with pairing token and change status to PAIRING
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          pairingToken,
          pairingTokenExpiresAt,
          status: UserStatus.PAIRING,
        },
      });

      // Get connector URL (not agent URL)
      const connectorUrl =
        await this.whatsappAgentService.getConnectorUrl(agent);

      this.logger.log(`Pairing code request on: ${connectorUrl}`);

      // Request pairing code from connector
      const result = await this.connectorClientService.requestPairingCode(
        connectorUrl,
        user.id,
      );

      this.logger.log(
        `Pairing code requested successfully for: ${phoneNumber}`,
      );

      return {
        code: result.code,
        pairingToken,
        message: result.message || 'Pairing code sent successfully',
      };
    } catch (error) {
      this.logger.error(
        `Error requesting pairing code for ${phoneNumber}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Verify pairing success and complete user setup
   */
  async verifyPairingSuccess(
    phoneNumber: string,
    whatsappProfile: any,
  ): Promise<{
    accessToken: string;
    user: any;
  }> {
    try {
      // Find user by phone number
      const user = await this.prisma.user.findUnique({
        where: { phoneNumber },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Update user status to PAIRED and save WhatsApp profile
      const updatedUser = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          status: UserStatus.PAIRED,
          whatsappProfile: whatsappProfile,
        },
      });

      // Update WhatsApp agent connection status
      const agent = await this.whatsappAgentService.getAgentForUser(user.id);
      if (agent) {
        await this.prisma.whatsAppAgent.update({
          where: { id: agent.id },
          data: {
            connectionStatus: ConnectionStatus.CONNECTED,
          },
        });
      }

      // Generate JWT token
      const accessToken = this.generateJwtToken(user.id);

      this.logger.log(`Pairing verified successfully for user: ${user.id}`);

      // Synchronize user data (profile, business, catalog) in the background
      // We don't await this to avoid blocking the response
      this.userSyncService.synchronizeUserData(phoneNumber).catch((error) => {
        this.logger.error(
          `Background sync failed for user ${user.id}: ${error.message}`,
          error.stack,
        );
      });

      return {
        accessToken,
        user: {
          id: updatedUser.id,
          phoneNumber: updatedUser.phoneNumber,
          status: updatedUser.status,
          whatsappProfile: updatedUser.whatsappProfile,
        },
      };
    } catch (error) {
      this.logger.error(`Error verifying pairing for ${phoneNumber}`, error);
      throw error;
    }
  }

  /**
   * Confirm pairing completion by the user
   * Called by frontend when user confirms they've completed pairing
   */
  async confirmPairing(pairingToken: string): Promise<{
    accessToken: string;
    user: any;
  }> {
    try {
      // Find user by pairing token
      const user = await this.prisma.user.findFirst({
        where: { pairingToken },
      });

      if (!user) {
        throw new UnauthorizedException('Invalid pairing token');
      }

      // Check if token is expired
      if (
        !user.pairingTokenExpiresAt ||
        user.pairingTokenExpiresAt < new Date()
      ) {
        // Clear expired token
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            pairingToken: null,
            pairingTokenExpiresAt: null,
            status: UserStatus.PENDING_PAIRING,
          },
        });
        throw new UnauthorizedException('Pairing token expired');
      }

      // Check if user is actually paired (connector should have called webhook)
      if (user.status !== UserStatus.PAIRED) {
        throw new BadRequestException(
          'WhatsApp connection not yet confirmed. Please complete the pairing process on your phone.',
        );
      }

      // Update user status to ONBOARDING and clear pairing token
      const updatedUser = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          status: UserStatus.ONBOARDING,
          pairingToken: null,
          pairingTokenExpiresAt: null,
        },
        include: {
          whatsappAgent: true,
        },
      });

      // Generate JWT token for onboarding
      const accessToken = this.generateJwtToken(user.id);

      this.logger.log(`Pairing confirmed successfully for user: ${user.id}`);

      return {
        accessToken,
        user: {
          id: updatedUser.id,
          phoneNumber: updatedUser.phoneNumber,
          status: updatedUser.status,
          whatsappProfile: updatedUser.whatsappProfile,
        },
      };
    } catch (error) {
      this.logger.error(`Error confirming pairing with token`, error);
      throw error;
    }
  }

  /**
   * Send OTP to user's own WhatsApp number for login
   */
  async sendOTPToSelf(phoneNumber: string): Promise<{ message: string }> {
    try {
      // Find user by phone number
      const user = await this.prisma.user.findUnique({
        where: { phoneNumber },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Check if user is paired or active
      if (
        user.status !== UserStatus.PAIRED &&
        user.status !== UserStatus.ACTIVE
      ) {
        throw new BadRequestException(
          'User must complete pairing before logging in',
        );
      }

      // Generate 6-digit OTP
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

      // Store OTP in Redis with 5 minutes TTL
      const cacheKey = `otp:${phoneNumber}`;
      await this.cacheManager.set(cacheKey, otpCode, 300000); // 5 minutes in milliseconds

      this.logger.log(`OTP generated for ${phoneNumber}: ${otpCode}`);

      // Get agent URL
      const agentUrl = await this.whatsappAgentService.getAgentUrl(user.id);

      // Send OTP via WhatsApp
      const message = `Votre code de connexion est: ${otpCode}\n\nCe code expire dans 5 minutes.`;
      await this.connectorClientService.sendMessage(
        agentUrl,
        user.id,
        phoneNumber,
        message,
      );

      this.logger.log(`OTP sent successfully to ${phoneNumber}`);

      return {
        message: 'OTP envoyé avec succès',
      };
    } catch (error) {
      this.logger.error(`Error sending OTP to ${phoneNumber}`, error);
      throw error;
    }
  }

  /**
   * Verify OTP and complete login
   */
  async verifyOTP(
    phoneNumber: string,
    code: string,
  ): Promise<{
    accessToken: string;
    user: any;
  }> {
    try {
      // Get OTP from Redis
      const cacheKey = `otp:${phoneNumber}`;
      const storedOtp = await this.cacheManager.get<string>(cacheKey);

      if (!storedOtp) {
        throw new UnauthorizedException('OTP expired or not found');
      }

      // Compare codes
      if (storedOtp !== code) {
        throw new UnauthorizedException('Invalid OTP code');
      }

      // Delete OTP from cache
      await this.cacheManager.del(cacheKey);

      // Find user
      const user = await this.prisma.user.findUnique({
        where: { phoneNumber },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Update user status to ACTIVE and lastLoginAt
      const updatedUser = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          status: UserStatus.ACTIVE,
          lastLoginAt: new Date(),
        },
      });

      // Generate JWT token
      const accessToken = this.generateJwtToken(user.id);

      this.logger.log(`User logged in successfully: ${user.id}`);

      return {
        accessToken,
        user: {
          id: updatedUser.id,
          phoneNumber: updatedUser.phoneNumber,
          status: updatedUser.status,
          whatsappProfile: updatedUser.whatsappProfile,
          lastLoginAt: updatedUser.lastLoginAt,
        },
      };
    } catch (error) {
      this.logger.error(`Error verifying OTP for ${phoneNumber}`, error);
      throw error;
    }
  }

  /**
   * Validate user by ID (used by JWT strategy)
   */
  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      phoneNumber: user.phoneNumber,
      status: user.status,
      whatsappProfile: user.whatsappProfile,
    };
  }

  /**
   * Cleanup expired pairing sessions
   * Should be called periodically (e.g., every 5 minutes)
   */
  async cleanupExpiredPairingSessions(): Promise<{
    cleanedCount: number;
  }> {
    try {
      const now = new Date();

      // Find users with expired pairing tokens
      const expiredUsers = await this.prisma.user.findMany({
        where: {
          pairingToken: { not: null },
          pairingTokenExpiresAt: { lt: now },
          status: UserStatus.PAIRING,
        },
      });

      if (expiredUsers.length === 0) {
        return { cleanedCount: 0 };
      }

      // Clear pairing tokens and reset status
      await this.prisma.user.updateMany({
        where: {
          id: { in: expiredUsers.map((u) => u.id) },
        },
        data: {
          pairingToken: null,
          pairingTokenExpiresAt: null,
          status: UserStatus.PENDING_PAIRING,
        },
      });

      this.logger.log(
        `Cleaned up ${expiredUsers.length} expired pairing sessions`,
      );

      return { cleanedCount: expiredUsers.length };
    } catch (error) {
      this.logger.error('Error cleaning up expired pairing sessions', error);
      throw error;
    }
  }

  /**
   * Generate JWT token
   */
  generateJwtToken(userId: string): string {
    const payload = { sub: userId };
    return this.jwtService.sign(payload);
  }
}
