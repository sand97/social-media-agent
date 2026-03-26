import {
  addUtcDays,
  aggregateOperationsByDay,
  createEmptyDailyStats,
  enumerateUtcDays,
} from './stats.utils';

describe('stats.utils', () => {
  it('enumerates UTC day ranges inclusively', () => {
    expect(enumerateUtcDays('2026-03-01', '2026-03-03')).toEqual([
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
    ]);
  });

  it('adds UTC days without mutating the original day token', () => {
    expect(addUtcDays('2026-03-07', -1)).toBe('2026-03-06');
    expect(addUtcDays('2026-03-07', 2)).toBe('2026-03-09');
  });

  it('aggregates image, audio and text operations separately', () => {
    const aggregated = aggregateOperationsByDay([
      {
        chatId: '111@c.us',
        createdAt: new Date('2026-03-07T09:00:00.000Z'),
        status: 'success',
        totalTokens: 120,
        userMessage: 'Message ID: abc\n#IMAGE_METADATA: available',
        agentResponse: 'Voici le produit.',
        metadata: { messageType: 'image' },
      },
      {
        chatId: '111@c.us',
        createdAt: new Date('2026-03-07T10:00:00.000Z'),
        status: 'error',
        totalTokens: 10,
        userMessage: 'Bonjour',
        agentResponse: '',
        metadata: { messageType: 'text' },
      },
      {
        chatId: '222@g.us',
        createdAt: new Date('2026-03-07T10:30:00.000Z'),
        status: 'success',
        totalTokens: 30,
        userMessage: '#AUDIO_METADATA: available',
        agentResponse: 'Bien recu.',
        metadata: { messageType: 'audio' },
      },
      {
        chatId: '222@g.us',
        createdAt: new Date('2026-03-07T11:00:00.000Z'),
        status: 'success',
        totalTokens: 42,
        userMessage: 'Commande disponible ?',
        agentResponse: 'Oui.',
        metadata: {},
      },
    ]);

    expect(aggregated.get('2026-03-07')).toEqual({
      day: '2026-03-07',
      messages: 4,
      messagesHandled: 3,
      imageMessages: 1,
      imageMessagesHandled: 1,
      audioMessages: 1,
      audioMessagesHandled: 1,
      textMessages: 2,
      textMessagesHandled: 1,
      conversations: 2,
      tokens: 202,
    });
  });

  it('creates a zero-filled point', () => {
    expect(createEmptyDailyStats('2026-03-07')).toEqual({
      day: '2026-03-07',
      messages: 0,
      messagesHandled: 0,
      imageMessages: 0,
      imageMessagesHandled: 0,
      audioMessages: 0,
      audioMessagesHandled: 0,
      textMessages: 0,
      textMessagesHandled: 0,
      conversations: 0,
      tokens: 0,
    });
  });
});
