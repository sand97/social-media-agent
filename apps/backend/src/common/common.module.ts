import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from '../prisma/prisma.module';

import { CryptoService } from './crypto.service';
import { AgentInternalGuard } from './guards/agent-internal.guard';
import { TokenService } from './services/token.service';

@Global()
@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [CryptoService, TokenService, AgentInternalGuard],
  exports: [CryptoService, TokenService, AgentInternalGuard],
})
export class CommonModule {}
