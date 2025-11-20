import { Module } from '@nestjs/common';

import { LangChainModule } from '../langchain/langchain.module';

import { ProductsAnalysisService } from './products-analysis.service';
import { ProductsController } from './products.controller';

@Module({
  imports: [LangChainModule],
  controllers: [ProductsController],
  providers: [ProductsAnalysisService],
  exports: [ProductsAnalysisService],
})
export class ProductsModule {}
