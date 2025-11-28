import { Module } from '@nestjs/common';

import { PageScriptService } from './page-script.service';

@Module({
  providers: [PageScriptService],
  exports: [PageScriptService],
})
export class PageScriptModule {}
