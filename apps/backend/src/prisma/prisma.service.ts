import { PrismaClient } from '@app/generated/client';
import { Injectable, OnModuleInit } from '@nestjs/common';

@Injectable()
export class PrismaService extends PrismaClient<{
  omit: {
    productImage: {
      original_url: true;
    };
  };
}> {
  constructor() {
    super({
      omit: {
        productImage: {
          original_url: true,
        },
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }
}
