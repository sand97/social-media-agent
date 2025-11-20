import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { BackendClientService } from './backend-client.service';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [BackendClientService],
  exports: [BackendClientService],
})
export class BackendClientModule {}
