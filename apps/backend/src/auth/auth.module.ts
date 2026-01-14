import { ConnectorClientModule } from '@app/connector-client';
import { PrismaModule } from '@app/prisma/prisma.module';
import { WhatsAppAgentModule } from '@app/whatsapp-agent/whatsapp-agent.module';
import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { OnboardingModule } from '../onboarding/onboarding.module';

import { AuthController } from './auth.controller';
import { AuthGateway } from './auth.gateway';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN') || '7d',
        },
      }),
    }),
    PrismaModule,
    WhatsAppAgentModule,
    ConnectorClientModule,
    forwardRef(() => OnboardingModule),
  ],
  providers: [AuthService, JwtStrategy, AuthGateway],
  controllers: [AuthController],
  exports: [AuthService, AuthGateway],
})
export class AuthModule {}
