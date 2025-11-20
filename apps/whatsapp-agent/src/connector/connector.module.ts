import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ConnectorClientService } from './connector-client.service';

@Module({
  imports: [ConfigModule],
  providers: [ConnectorClientService],
  exports: [ConnectorClientService],
})
export class ConnectorModule {}
