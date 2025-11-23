import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { ConnectorClientModule } from '../connector-client/connector-client.module';
import { PageScriptModule } from '../page-scripts/page-script.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PromptsModule } from '../prompts/prompts.module';
import { WhatsAppAgentModule } from '../whatsapp-agent/whatsapp-agent.module';

import { OnboardingController } from './onboarding.controller';
import { OnboardingGateway } from './onboarding.gateway';
import { OnboardingService } from './onboarding.service';
import { DbToolsService, WaJsToolsService } from './tools';

@Module({
  imports: [
    PrismaModule,
    PromptsModule,
    PageScriptModule,
    ConnectorClientModule,
    forwardRef(() => WhatsAppAgentModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN') || '7d',
        },
      }),
    }),
  ],
  controllers: [OnboardingController],
  providers: [
    OnboardingGateway,
    OnboardingService,
    DbToolsService,
    WaJsToolsService,
  ],
  exports: [OnboardingGateway, OnboardingService],
})
export class OnboardingModule {}
