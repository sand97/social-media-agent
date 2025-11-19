import * as path from 'path';

import { HealthModule } from '@app/health/health.module';
import { PrismaModule } from '@app/prisma/prisma.module';
import KeyvRedis from '@keyv/redis';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SentryModule } from '@sentry/nestjs/setup';
import { AcceptLanguageResolver, I18nModule } from 'nestjs-i18n';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { ProductsModule } from './products/products.module';
import { SettingsModule } from './settings/settings.module';
import { ConversationsModule } from './conversations/conversations.module';
import { OrdersModule } from './orders/orders.module';
import { WhatsAppAgentModule } from './whatsapp-agent/whatsapp-agent.module';
import { ConnectorClientModule } from './connector-client/connector-client.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { CommonModule } from './common/common.module';
import { CatalogModule } from './catalog/catalog.module';
import { PageScriptModule } from './page-scripts/page-script.module';
import { MinioModule } from './minio/minio.module';

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
    }),
    CacheModule.register({
      isGlobal: true,
      imports: [],
      inject: [],
      useFactory: () => ({
        stores: [new KeyvRedis(process.env.REDIS_URL)],
      }),
    }),
    PrismaModule,
    HealthModule,
    CommonModule,
    MinioModule,
    PageScriptModule,
    CatalogModule,
    ConnectorClientModule,
    WhatsAppAgentModule,
    AuthModule,
    UserModule,
    ProductsModule,
    SettingsModule,
    ConversationsModule,
    OrdersModule,
    WebhooksModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
