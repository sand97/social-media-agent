import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ConnectorClientModule } from '../connector-client/connector-client.module';
import { PageScriptModule } from '../page-scripts/page-script.module';
import { PrismaModule } from '../prisma/prisma.module';

import { CryptoService } from './crypto.service';
import { TokenService } from './services/token.service';
import { UserSyncService } from './services/user-sync.service';

// Import required modules for UserSyncService

@Global()
@Module({
  imports: [
    ConfigModule,
    PageScriptModule,
    ConnectorClientModule,
    PrismaModule,
  ],
  providers: [CryptoService, TokenService, UserSyncService],
  exports: [CryptoService, TokenService, UserSyncService],
})
export class CommonModule {}
