import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ConnectorClientService } from './connector-client.service';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [ConnectorClientService],
  exports: [ConnectorClientService],
})
export class ConnectorClientModule {}
