import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { RateLimitService } from './rate-limit.service';
import { SanitizationService } from './sanitization.service';

@Module({
  imports: [ConfigModule],
  providers: [SanitizationService, RateLimitService],
  exports: [SanitizationService, RateLimitService],
})
export class SecurityModule {}
