import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

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
