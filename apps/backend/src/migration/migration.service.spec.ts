import { MigrationService } from '@app/migration/migration.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('MigrationService', () => {
  let service: MigrationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MigrationService],
    }).compile();

    service = module.get<MigrationService>(MigrationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
