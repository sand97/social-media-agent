import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PageScriptService } from './page-script.service';

@Module({
  imports: [ConfigModule],
  providers: [PageScriptService],
  exports: [PageScriptService],
})
export class PageScriptModule {}
