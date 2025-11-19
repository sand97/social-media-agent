import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CryptoService } from './crypto.service';
import { TokenService } from './services/token.service';
import { UserSyncService } from './services/user-sync.service';

// Import required modules for UserSyncService
import { PageScriptModule } from '../page-scripts/page-script.module';
import { ConnectorClientModule } from '../connector-client/connector-client.module';

@Global()
@Module({
  imports: [ConfigModule, PageScriptModule, ConnectorClientModule],
  providers: [CryptoService, TokenService, UserSyncService],
  exports: [CryptoService, TokenService, UserSyncService],
})
export class CommonModule {}
