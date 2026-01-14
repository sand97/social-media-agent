import { CryptoService } from '@app/common/crypto.service';
import { ConnectorClientService } from '@app/connector-client';
import { PrismaService } from '@app/prisma/prisma.service';
import { UserSyncService } from '@app/whatsapp-agent/user-sync.service';
import { WhatsAppAgentService } from '@app/whatsapp-agent/whatsapp-agent.service';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserStatus, ConnectionStatus } from '@prisma/client';

import { OnboardingService } from '../onboarding/onboarding.service';

import { AuthenticatedUser } from './types/authenticated-user.type';

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
    @Inject(forwardRef(() => OnboardingService))
    private readonly onboardingService: OnboardingService,
  ) {}

  /**
   * Request a pairing code for WhatsApp authentication
   * Handles three scenarios: OTP (already connected), pairing (mobile), QR (desktop)
   */
  async requestPairingCode(
    phoneNumber: string,
    deviceType: 'mobile' | 'desktop' = 'mobile',
  ): Promise<{
    code?: string;
    pairingToken: string;
    message: string;
    scenario: 'pairing' | 'otp' | 'qr';
  }> {
    try {
      // Check if user exists
      let user = await this.prisma.user.findUnique({
        where: { phoneNumber },
      });

      // Provision WhatsApp agent if user exists
      let agent = user
        ? await this.whatsappAgentService.getAgentForUser(user.id)
        : null;

      // Check if agent is already authenticated
      let isAuthenticated = false;
      if (agent) {
        const connectorUrl =
          await this.whatsappAgentService.getConnectorUrl(agent);

        try {
          const authResult =
            await this.connectorClientService.isAuthenticated(connectorUrl);
          // authResult = { success: true, result: { success: true, isAuthenticated: true } }
          isAuthenticated = !!(
            authResult.success &&
            authResult.result?.success &&
            authResult.result?.isAuthenticated
          );
          this.logger.log(
            `Agent authentication status for ${phoneNumber}: ${isAuthenticated}`,
            authResult,
          );
        } catch (error) {
          this.logger.warn(
            `Failed to check authentication status for ${phoneNumber}`,
            error,
          );
        }
      }

      // Scenario 1: User exists AND agent is authenticated -> Send OTP
      if (user && isAuthenticated) {
        this.logger.log(
          `User ${phoneNumber} is already authenticated, sending OTP`,
        );
        return await this.sendOTPScenario(user);
      }

      // Scenario 2: New user OR not authenticated -> Pairing or QR
      this.logger.log(
        `User ${phoneNumber} needs pairing (new user or not authenticated)`,
      );

      // Create user if doesn't exist
      if (!user) {
        user = await this.prisma.user.create({
          data: {
            phoneNumber,
            status: UserStatus.PENDING_PAIRING,
          },
        });
        this.logger.log(`Created new user with phone number: ${phoneNumber}`);
      }

      // Provision WhatsApp agent if not exists
      if (!agent) {
        agent = await this.whatsappAgentService.provisionAgent(user.id);
        this.logger.log(`Provisioned WhatsApp agent for user: ${user.id}`);
      }

      // Generate unique pairing token (valid for 5 minutes)
      const pairingToken = this.cryptoService.generateRandomToken(32);
      const pairingTokenExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

      // Update user with pairing token and change status to PAIRING
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          pairingToken,
          pairingTokenExpiresAt,
          status: UserStatus.PAIRING,
        },
      });

      // Scenario 2a: Desktop device -> Return QR scenario (don't request pairing code)
      if (deviceType === 'desktop') {
        this.logger.log(
          `Desktop device detected, returning QR scenario for: ${phoneNumber}`,
        );
        return {
          pairingToken,
          message: 'Veuillez scanner le code QR avec WhatsApp',
          scenario: 'qr',
        };
      }

      // Scenario 2b: Mobile device -> Request pairing code
      // Get connector URL
      const connectorUrl =
        await this.whatsappAgentService.getConnectorUrl(agent);

      this.logger.log(`Pairing code request on: ${connectorUrl}`);

      // Request pairing code from connector
      const result = await this.connectorClientService.requestPairingCode(
        connectorUrl,
        phoneNumber,
      );

      this.logger.log(
        `Pairing code requested successfully for: ${phoneNumber}`,
      );

      return {
        code: result.code,
        pairingToken,
        message: result.message || 'Pairing code sent successfully',
        scenario: 'pairing',
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
   * Private method to handle OTP scenario when user is already authenticated
   */
  private async sendOTPScenario(user: any): Promise<{
    pairingToken: string;
    message: string;
    scenario: 'otp';
  }> {
    // Generate 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Generate pairing token for this session (valid for 5 minutes)
    const pairingToken = this.cryptoService.generateRandomToken(32);
    const pairingTokenExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // Store OTP in Redis with 5 minutes TTL
    const cacheKey = `otp:${user.phoneNumber}`;
    await this.cacheManager.set(cacheKey, otpCode, 300000); // 5 minutes

    // Update user with pairing token
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        pairingToken,
        pairingTokenExpiresAt,
      },
    });

    this.logger.log(`OTP generated for ${user.phoneNumber}: ${otpCode}`);

    // Get agent and connector URL
    const agent = await this.whatsappAgentService.getAgentForUser(user.id);
    if (!agent) {
      throw new Error('Agent not found for user');
    }

    const connectorUrl = await this.whatsappAgentService.getConnectorUrl(agent);

    // Format phone number for WhatsApp (remove + and add @c.us)
    const formattedPhoneNumber = user.phoneNumber.replace('+', '') + '@c.us';

    // Send OTP via WhatsApp (queryExists is now integrated in sendTextMessage)
    const message = `Votre code de connexion est: ${otpCode}\n\nCe code expire dans 5 minutes.`;
    const sendResult = await this.connectorClientService.sendTextMessage(
      connectorUrl,
      formattedPhoneNumber,
      message,
    );

    // sendResult = { success: true, result: { success: true, messageId: "...", wid: "..." } }
    if (!sendResult.success || !sendResult.result?.success) {
      throw new Error(
        `Failed to send OTP: ${sendResult.result?.error || sendResult.error || 'Unknown error'}`,
      );
    }

    this.logger.log(
      `OTP sent successfully to ${user.phoneNumber} (WID: ${sendResult.result.wid})`,
    );

    return {
      pairingToken,
      message: 'Un code de vérification a été envoyé à votre numéro WhatsApp',
      scenario: 'otp',
    };
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
   * Confirm pairing OR OTP based on pairingToken
   * Automatically detects the scenario and handles accordingly
   */
  async confirmPairing(
    pairingToken: string,
    otpCode?: string,
  ): Promise<{
    accessToken: string;
    redirectTo: string;
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
          },
        });
        throw new UnauthorizedException('Token expired');
      }

      // Check if this is an OTP scenario (OTP exists in cache)
      const cacheKey = `otp:${user.phoneNumber}`;
      const storedOtp = await this.cacheManager.get<string>(cacheKey);

      // Scenario 1: OTP Login (user already authenticated)
      if (storedOtp) {
        this.logger.log(`OTP scenario detected for user: ${user.id}`);

        if (!otpCode) {
          throw new BadRequestException('OTP code is required');
        }

        // Verify OTP
        if (storedOtp !== otpCode) {
          throw new UnauthorizedException('Invalid OTP code');
        }

        // Delete OTP from cache
        await this.cacheManager.del(cacheKey);

        // Check onboarding status
        const thread = await this.onboardingService.getThreadWithMessages(
          user.id,
        );
        const onboardingComplete = thread && thread.score >= 80;

        // Determine redirect path and user status
        let redirectTo = '/context';
        let userStatus: UserStatus = UserStatus.ONBOARDING;

        if (onboardingComplete) {
          redirectTo = '/dashboard';
          userStatus = UserStatus.ACTIVE;
        }

        // Update user status and clear pairing token
        const updatedUser = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            status: userStatus,
            lastLoginAt: new Date(),
            pairingToken: null,
            pairingTokenExpiresAt: null,
          },
        });

        // Generate JWT token
        const accessToken = this.generateJwtToken(user.id);

        this.logger.log(
          `User logged in successfully via OTP: ${user.id}, redirect to: ${redirectTo}`,
        );

        return {
          accessToken,
          redirectTo,
          user: {
            id: updatedUser.id,
            phoneNumber: updatedUser.phoneNumber,
            status: updatedUser.status,
            whatsappProfile: updatedUser.whatsappProfile,
            lastLoginAt: updatedUser.lastLoginAt,
          },
        };
      }

      // Scenario 2: Pairing (new device)
      this.logger.log(`Pairing scenario detected for user: ${user.id}`);

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

      this.logger.log(
        `Pairing confirmed successfully for user: ${user.id}, redirect to: /context`,
      );

      // New users always go through onboarding
      return {
        accessToken,
        redirectTo: '/context',
        user: {
          id: updatedUser.id,
          phoneNumber: updatedUser.phoneNumber,
          status: updatedUser.status,
          whatsappProfile: updatedUser.whatsappProfile,
        },
      };
    } catch (error) {
      this.logger.error(`Error confirming pairing/OTP with token`, error);
      throw error;
    }
  }

  /**
   * @deprecated Use confirmPairing with otpCode parameter instead
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
  async validateUser(userId: string): Promise<AuthenticatedUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        businessInfo: true,
        onboardingThread: {
          select: {
            score: true,
          },
        },
        whatsappAgent: {
          select: {
            testPhoneNumbers: true,
            testLabels: true,
            labelsToNotReply: true,
            productionEnabled: true,
          },
        },
      },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      phoneNumber: user.phoneNumber,
      status: user.status,
      whatsappProfile: user.whatsappProfile,
      businessInfo: user.businessInfo,
      contextScore: user.onboardingThread?.score ?? 0,
      agentConfig: user.whatsappAgent
        ? {
            testPhoneNumbers: user.whatsappAgent.testPhoneNumbers,
            testLabels: user.whatsappAgent.testLabels,
            labelsToNotReply: user.whatsappAgent.labelsToNotReply,
            productionEnabled: user.whatsappAgent.productionEnabled,
          }
        : null,
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

  /**
   * Request a QR code for WhatsApp authentication (desktop only)
   * This method provisions an agent for the user and returns the QR code
   */
  async requestCodeQR(phoneNumber: string): Promise<{
    qrCode: string;
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
        this.logger.log(`Created new user for QR code auth: ${phoneNumber}`);
      }

      // Generate unique pairing token (valid for 5 minutes)
      const pairingToken = this.cryptoService.generateRandomToken(32);
      const pairingTokenExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

      // Update user with pairing token and change status to PAIRING
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          pairingToken,
          pairingTokenExpiresAt,
          status: UserStatus.PAIRING,
        },
      });

      // Provision WhatsApp agent if not exists
      let agent = await this.whatsappAgentService.getAgentForUser(user.id);
      if (!agent) {
        agent = await this.whatsappAgentService.provisionAgent(user.id);
        this.logger.log(`Provisioned WhatsApp agent for QR code: ${user.id}`);
      }

      // Get connector URL
      const connectorUrl =
        await this.whatsappAgentService.getConnectorUrl(agent);

      this.logger.log(`Requesting QR code from: ${connectorUrl}`);

      // Request QR code from connector with retry logic
      let qrCode: string | null = null;
      const maxRetries = 10; // Wait up to 10 seconds for QR code
      const retryDelay = 1000; // 1 second between retries

      for (let i = 0; i < maxRetries; i++) {
        try {
          const result =
            await this.connectorClientService.getQRCode(connectorUrl);

          if (result.success && result.qrCode) {
            qrCode = result.qrCode;
            break;
          }
        } catch {
          // QR code not ready yet, wait and retry
          if (i < maxRetries - 1) {
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
          }
        }
      }

      if (!qrCode) {
        throw new Error(
          'QR code not available. The connector may already be authenticated.',
        );
      }

      this.logger.log(`QR code retrieved successfully for: ${phoneNumber}`);

      // Store phoneNumber -> pairingToken mapping in cache for webhook routing
      const cacheKey = `qr-session:${phoneNumber}`;
      await this.cacheManager.set(cacheKey, pairingToken, 300000); // 5 minutes
      this.logger.log(
        `Stored QR session mapping for ${phoneNumber} -> ${pairingToken}`,
      );

      // Schedule cleanup after 5 minutes if user hasn't connected
      // The cleanup will check if user is still in PAIRING status
      setTimeout(
        async () => {
          try {
            const userCheck = await this.prisma.user.findUnique({
              where: { id: user.id },
            });

            // If user is still in PAIRING status after 5 minutes, reset
            if (userCheck && userCheck.status === UserStatus.PAIRING) {
              await this.prisma.user.update({
                where: { id: user.id },
                data: {
                  status: UserStatus.PENDING_PAIRING,
                  pairingToken: null,
                  pairingTokenExpiresAt: null,
                },
              });
              this.logger.log(`QR code session expired for user: ${user.id}`);
            }
          } catch (error) {
            this.logger.error(
              `Error during QR code session cleanup for user ${user.id}`,
              error,
            );
          }
        },
        5 * 60 * 1000,
      ); // 5 minutes

      return {
        qrCode,
        pairingToken,
        message: 'Scannez le code QR avec WhatsApp',
      };
    } catch (error) {
      this.logger.error(`Error requesting QR code for ${phoneNumber}`, error);
      throw error;
    }
  }

  /**
   * Refresh QR code when it expires
   * This will restart the connector to generate a new QR code
   */
  async refreshCodeQR(pairingToken: string): Promise<{
    qrCode: string;
    pairingToken: string;
    message: string;
  }> {
    try {
      // Find user with this pairing token
      const user = await this.prisma.user.findFirst({
        where: {
          pairingToken,
          status: UserStatus.PAIRING,
          pairingTokenExpiresAt: { gte: new Date() }, // Token must not be expired
        },
      });

      if (!user) {
        throw new UnauthorizedException(
          'Invalid or expired pairing token. Please request a new QR code.',
        );
      }

      this.logger.log(`Refreshing QR code for user: ${user.phoneNumber}`);

      // Get the WhatsApp agent for this user
      const agent = await this.whatsappAgentService.getAgentForUser(user.id);
      if (!agent) {
        throw new Error('No WhatsApp agent found for this user');
      }

      // Get connector URL
      const connectorUrl =
        await this.whatsappAgentService.getConnectorUrl(agent);

      this.logger.log(
        `Restarting connector to generate new QR code: ${connectorUrl}`,
      );

      // Restart the connector to force new QR code generation
      await this.connectorClientService.restartClient(connectorUrl);

      // Wait a bit for the client to restart and generate a new QR code
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Request new QR code from connector with retry logic
      let qrCode: string | null = null;
      const maxRetries = 10;
      const retryDelay = 1000;

      for (let i = 0; i < maxRetries; i++) {
        try {
          const result =
            await this.connectorClientService.getQRCode(connectorUrl);

          if (result.success && result.qrCode) {
            qrCode = result.qrCode;
            break;
          }
        } catch {
          if (i < maxRetries - 1) {
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
          }
        }
      }

      if (!qrCode) {
        throw new Error('Failed to generate new QR code after restart');
      }

      this.logger.log(`New QR code generated for user: ${user.phoneNumber}`);

      return {
        qrCode,
        pairingToken, // Return the same pairing token
        message: 'Nouveau code QR généré avec succès',
      };
    } catch (error) {
      this.logger.error(`Error refreshing QR code`, error);
      throw error;
    }
  }
}
