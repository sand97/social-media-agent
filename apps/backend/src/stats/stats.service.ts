import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { StatsAnalyticsQueryDto } from './dto/stats-analytics-query.dto';
import { StatsAnalyticsResponseDto } from './dto/stats-analytics-response.dto';
import {
  addUtcDays,
  aggregateOperationsByDay,
  createEmptyDailyStats,
  enumerateUtcDays,
  getUtcToday,
  getUtcYearStart,
  isIsoDay,
  parseUtcDay,
} from './stats.utils';

@Injectable()
export class StatsService {
  private readonly logger = new Logger(StatsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getUserAnalytics(
    userId: string,
    query: StatsAnalyticsQueryDto,
  ): Promise<StatsAnalyticsResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        whatsappAgent: {
          select: { id: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const today = getUtcToday();
    const { startDate, endDate } = this.resolveRange(query, today);
    const yesterday = addUtcDays(today, -1);
    const closedRangeEnd = endDate < today ? endDate : yesterday;

    if (startDate <= closedRangeEnd) {
      await this.backfillClosedRangeForUser(
        user.id,
        user.whatsappAgent?.id,
        startDate,
        closedRangeEnd,
      );
    }

    const snapshots = await this.prisma.userDailyStat.findMany({
      where: {
        userId,
        day: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { day: 'asc' },
    });

    const seriesByDay = new Map(
      snapshots.map((snapshot) => [
        snapshot.day,
        {
          day: snapshot.day,
          messages: snapshot.messages,
          messagesHandled: snapshot.messagesHandled,
          imageMessages: snapshot.imageMessages,
          imageMessagesHandled: snapshot.imageMessagesHandled,
          audioMessages: snapshot.audioMessages,
          audioMessagesHandled: snapshot.audioMessagesHandled,
          textMessages: snapshot.textMessages,
          textMessagesHandled: snapshot.textMessagesHandled,
          conversations: snapshot.conversations,
          tokens: snapshot.tokens,
        },
      ]),
    );

    if (startDate <= today && endDate >= today) {
      const liveToday = await this.buildLiveDayForUser(
        user.id,
        user.whatsappAgent?.id,
        today,
      );
      seriesByDay.set(today, liveToday);
    }

    const series = enumerateUtcDays(startDate, endDate).map(
      (day) => seriesByDay.get(day) ?? createEmptyDailyStats(day),
    );

    return {
      range: {
        startDate,
        endDate,
        includesToday: startDate <= today && endDate >= today,
        timezone: 'UTC',
      },
      generatedAt: new Date().toISOString(),
      series,
    };
  }

  async snapshotYesterdayForAllUsers(): Promise<{
    day: string;
    processedUsers: number;
  }> {
    const day = addUtcDays(getUtcToday(), -1);
    return this.snapshotClosedDayForAllUsers(day);
  }

  async snapshotClosedDayForAllUsers(day: string): Promise<{
    day: string;
    processedUsers: number;
  }> {
    if (!isIsoDay(day)) {
      throw new BadRequestException('day must use YYYY-MM-DD format');
    }

    const agents = await this.prisma.whatsAppAgent.findMany({
      where: {
        userId: {
          not: null,
        },
      },
      select: {
        userId: true,
        id: true,
      },
    });

    const uniqueUsers = new Map<string, string | undefined>();
    for (const agent of agents) {
      if (agent.userId) {
        uniqueUsers.set(agent.userId, agent.id);
      }
    }

    await Promise.all(
      Array.from(uniqueUsers.entries()).map(([userId, agentId]) =>
        this.backfillClosedRangeForUser(userId, agentId, day, day),
      ),
    );

    this.logger.log(
      `Daily stats snapshot complete for ${day} (${uniqueUsers.size} user(s))`,
    );

    return {
      day,
      processedUsers: uniqueUsers.size,
    };
  }

  private resolveRange(
    query: StatsAnalyticsQueryDto,
    today: string,
  ): { startDate: string; endDate: string } {
    const defaultStart = getUtcYearStart(parseUtcDay(today).getUTCFullYear());
    const requestedStart = query.startDate || defaultStart;
    const requestedEnd = query.endDate || today;
    const endDate = requestedEnd > today ? today : requestedEnd;

    if (!isIsoDay(requestedStart) || !isIsoDay(endDate)) {
      throw new BadRequestException('Dates must use YYYY-MM-DD format');
    }

    if (requestedStart > endDate) {
      throw new BadRequestException('startDate must be before or equal to endDate');
    }

    return {
      startDate: requestedStart,
      endDate,
    };
  }

  private async backfillClosedRangeForUser(
    userId: string,
    agentId: string | undefined,
    startDate: string,
    endDate: string,
  ): Promise<void> {
    const existing = await this.prisma.userDailyStat.findMany({
      where: {
        userId,
        day: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        day: true,
      },
    });

    const existingDays = new Set(existing.map((entry) => entry.day));
    const missingDays = enumerateUtcDays(startDate, endDate).filter(
      (day) => !existingDays.has(day),
    );

    if (missingDays.length === 0) {
      return;
    }

    const firstMissing = missingDays[0];
    const lastMissing = missingDays[missingDays.length - 1];
    const operations = await this.prisma.agentOperation.findMany({
      where: this.buildOperationsWhere(userId, agentId, firstMissing, lastMissing),
      select: {
        chatId: true,
        createdAt: true,
        totalTokens: true,
        status: true,
        userMessage: true,
        agentResponse: true,
        metadata: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const aggregated = aggregateOperationsByDay(operations);
    const snapshotRows = missingDays.map((day) => {
      const point = aggregated.get(day) ?? createEmptyDailyStats(day);
      return {
        userId,
        day,
        messages: point.messages,
        messagesHandled: point.messagesHandled,
        imageMessages: point.imageMessages,
        imageMessagesHandled: point.imageMessagesHandled,
        audioMessages: point.audioMessages,
        audioMessagesHandled: point.audioMessagesHandled,
        textMessages: point.textMessages,
        textMessagesHandled: point.textMessagesHandled,
        conversations: point.conversations,
        tokens: point.tokens,
      };
    });

    await this.prisma.userDailyStat.createMany({
      data: snapshotRows,
      skipDuplicates: true,
    });
  }

  private async buildLiveDayForUser(
    userId: string,
    agentId: string | undefined,
    day: string,
  ) {
    const operations = await this.prisma.agentOperation.findMany({
      where: this.buildOperationsWhere(userId, agentId, day, day),
      select: {
        chatId: true,
        createdAt: true,
        totalTokens: true,
        status: true,
        userMessage: true,
        agentResponse: true,
        metadata: true,
      },
    });

    return aggregateOperationsByDay(operations).get(day) ?? createEmptyDailyStats(day);
  }

  private buildOperationsWhere(
    userId: string,
    agentId: string | undefined,
    startDay: string,
    endDay: string,
  ) {
    const endExclusive = addUtcDays(endDay, 1);
    const ownerFilter = agentId
      ? [{ userId }, { userId: null, agentId }]
      : [{ userId }];

    return {
      OR: ownerFilter,
      createdAt: {
        gte: parseUtcDay(startDay),
        lt: parseUtcDay(endExclusive),
      },
    };
  }
}
