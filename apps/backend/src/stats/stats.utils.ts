export interface DailyStatsRecord {
  day: string;
  messages: number;
  messagesHandled: number;
  imageMessages: number;
  imageMessagesHandled: number;
  audioMessages: number;
  audioMessagesHandled: number;
  textMessages: number;
  textMessagesHandled: number;
  conversations: number;
  tokens: number;
}

interface AnalyticsOperationLike {
  chatId: string;
  createdAt: Date;
  status: string;
  totalTokens: number | null;
  userMessage: string;
  agentResponse?: string | null;
  metadata: unknown;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const ISO_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isIsoDay(value?: string): value is string {
  return typeof value === 'string' && ISO_DAY_PATTERN.test(value);
}

export function getUtcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function parseUtcDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

export function formatUtcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addUtcDays(day: string, amount: number): string {
  const next = parseUtcDay(day).getTime() + amount * DAY_IN_MS;
  return formatUtcDay(new Date(next));
}

export function enumerateUtcDays(startDay: string, endDay: string): string[] {
  const days: string[] = [];
  let cursor = startDay;

  while (cursor <= endDay) {
    days.push(cursor);
    cursor = addUtcDays(cursor, 1);
  }

  return days;
}

export function getUtcYearStart(year: number): string {
  return `${year}-01-01`;
}

export function getUtcYearEnd(year: number): string {
  return `${year}-12-31`;
}

export function createEmptyDailyStats(day: string): DailyStatsRecord {
  return {
    day,
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
  };
}

export function aggregateOperationsByDay<T extends AnalyticsOperationLike>(
  operations: T[],
): Map<string, DailyStatsRecord> {
  const byDay = new Map<string, DailyStatsRecord>();
  const conversationsByDay = new Map<string, Set<string>>();

  for (const operation of operations) {
    const day = formatUtcDay(operation.createdAt);
    const existing = byDay.get(day) ?? createEmptyDailyStats(day);
    const metadata = isRecord(operation.metadata) ? operation.metadata : {};
    const rawMessageType =
      typeof metadata.messageType === 'string'
        ? metadata.messageType
        : typeof metadata.mediaKind === 'string'
          ? metadata.mediaKind
          : '';
    const normalizedMessageType = rawMessageType.toLowerCase();
    const messageContent = operation.userMessage.toLowerCase();
    const isImage =
      normalizedMessageType === 'image' ||
      normalizedMessageType === 'photo' ||
      messageContent.includes('#image_metadata') ||
      messageContent.includes('[image]');
    const isAudio =
      normalizedMessageType === 'audio' ||
      normalizedMessageType === 'ptt' ||
      messageContent.includes('#audio_metadata') ||
      messageContent.includes('[audio]');
    const isHandled =
      operation.status === 'success' &&
      typeof operation.agentResponse === 'string' &&
      operation.agentResponse.trim().length > 0;

    existing.messages += 1;
    existing.tokens += operation.totalTokens ?? 0;

    if (isHandled) {
      existing.messagesHandled += 1;
    }

    if (isImage) {
      existing.imageMessages += 1;
      if (isHandled) {
        existing.imageMessagesHandled += 1;
      }
    } else if (isAudio) {
      existing.audioMessages += 1;
      if (isHandled) {
        existing.audioMessagesHandled += 1;
      }
    } else {
      existing.textMessages += 1;
      if (isHandled) {
        existing.textMessagesHandled += 1;
      }
    }

    const conversations = conversationsByDay.get(day) ?? new Set<string>();
    conversations.add(operation.chatId);
    conversationsByDay.set(day, conversations);
    existing.conversations = conversations.size;

    byDay.set(day, existing);
  }

  return byDay;
}
