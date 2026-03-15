import { BadRequestException } from '@nestjs/common';

jest.mock(
  '@app/generated/client',
  () => ({
    PrismaClient: class PrismaClient {},
    User: class User {},
  }),
  { virtual: true },
);
jest.mock('../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../whatsapp-agent/user-sync.service', () => ({
  UserSyncService: class UserSyncService {},
}));

import { UserService } from './user.service';

describe('UserService', () => {
  const originalFetch = global.fetch;

  const createPayload = (overrides: Record<string, unknown> = {}) => ({
    category: 'bug',
    context: {
      appArea: 'dashboard-support',
      currentPlan: 'Free',
      route: '/support',
      timezone: 'Europe/Paris',
      url: 'http://localhost:5173/support',
      userId: 'frontend-user-id',
    },
    email: 'client@example.com',
    message: 'Le formulaire support reste bloque apres validation.',
    name: 'Jean Dupont',
    sentry: {
      dsn: 'https://549db520247ca4aa7f69f7e3eb5775f6@o1063428.ingest.us.sentry.io/4511042903539712',
      environment: 'test',
      release: 'frontend@test',
    },
    subject: 'Bug support',
    ...overrides,
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('relays support feedback through Sentry and returns the event id', async () => {
    const service = new UserService({} as any, {} as any);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
    }) as unknown as typeof fetch;

    const result = await service.submitSupportFeedback(
      'user-123',
      createPayload() as any,
    );

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        '/api/4511042903539712/envelope/?sentry_client=',
      ),
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(result.eventId).toMatch(/^[a-f0-9]{32}$/);
  });

  it('rejects an invalid feedback DSN before calling Sentry', async () => {
    const service = new UserService({} as any, {} as any);

    await expect(
      service.submitSupportFeedback(
        'user-123',
        createPayload({
          sentry: {
            dsn: 'invalid-dsn',
          },
        }) as any,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(global.fetch).toBe(originalFetch);
  });
});
