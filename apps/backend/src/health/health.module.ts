import { HealthController } from '@app/health/health.controller';
import { PrismaModule } from '@app/prisma/prisma.module';
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

@Module({
  controllers: [HealthController],
  imports: [PrismaModule, TerminusModule],
})
export class HealthModule {}
