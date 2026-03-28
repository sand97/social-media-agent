import * as path from 'path';

import { ConnectorClientModule } from '@app/connector-client';
import { HealthModule } from '@app/health/health.module';
import { MigrationModule } from '@app/migration/migration.module';
import { PageScriptModule } from '@app/page-scripts';
import { PrismaModule } from '@app/prisma/prisma.module';
import KeyvRedis from '@keyv/redis';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SentryModule } from '@sentry/nestjs/setup';
import { AcceptLanguageResolver, I18nModule } from 'nestjs-i18n';

import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { CatalogModule } from './catalog/catalog.module';
import { CommonModule } from './common/common.module';
import aiConfig from './config/ai.config';
import { GoogleContactsModule } from './google-contacts/google-contacts.module';
import { MinioModule } from './minio/minio.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { OrdersModule } from './orders/orders.module';
import { ProductsModule } from './products/products.module';
import { SettingsModule } from './settings/settings.module';
import { StackPoolModule } from './stack-pool/stack-pool.module';
import { StatsModule } from './stats/stats.module';
import { StatusSchedulerModule } from './status-scheduler/status-scheduler.module';
import { UserModule } from './user/user.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { WhatsAppAgentModule } from './whatsapp-agent/whatsapp-agent.module';

@Module({
  imports: [
    SentryModule.forRoot(),
    I18nModule.forRoot({
      fallbackLanguage: 'fr',
      loaderOptions: {
        path: path.join(__dirname, '/i18n/'),
        watch: true,
      },
      resolvers: [AcceptLanguageResolver],
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [aiConfig],
    }),
    CacheModule.register({
      isGlobal: true,
      imports: [],
      inject: [],
      useFactory: () => ({
        stores: [new KeyvRedis(process.env.REDIS_URL)],
      }),
    }),
    MigrationModule,
    PrismaModule,
    HealthModule,
    CommonModule,
    GoogleContactsModule,
    MinioModule,
    PageScriptModule,
    CatalogModule,
    ConnectorClientModule,
    WhatsAppAgentModule,
    OnboardingModule,
    AuthModule,
    BillingModule,
    UserModule,
    StatsModule,
    StackPoolModule,
    StatusSchedulerModule,
    ProductsModule,
    SettingsModule,
    OrdersModule,
    WebhooksModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
