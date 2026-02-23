import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { ProductsController } from './products.controller';
import { ProductsInternalController } from './products-internal.controller';
import { ProductsInternalService } from './products-internal.service';
import { ProductsService } from './products.service';

@Module({
  imports: [PrismaModule],
  controllers: [ProductsController, ProductsInternalController],
  providers: [ProductsService, ProductsInternalService],
  exports: [ProductsService],
})
export class ProductsModule {}
