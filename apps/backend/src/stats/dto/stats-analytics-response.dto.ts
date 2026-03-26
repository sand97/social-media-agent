import { ApiProperty } from '@nestjs/swagger';

export class DailyStatsPointDto {
  @ApiProperty({ example: '2026-03-07' })
  day: string;

  @ApiProperty({ example: 18 })
  messages: number;

  @ApiProperty({ example: 16 })
  messagesHandled: number;

  @ApiProperty({ example: 3 })
  imageMessages: number;

  @ApiProperty({ example: 2 })
  imageMessagesHandled: number;

  @ApiProperty({ example: 4 })
  audioMessages: number;

  @ApiProperty({ example: 3 })
  audioMessagesHandled: number;

  @ApiProperty({ example: 15 })
  textMessages: number;

  @ApiProperty({ example: 14 })
  textMessagesHandled: number;

  @ApiProperty({ example: 7 })
  conversations: number;

  @ApiProperty({ example: 1240 })
  tokens: number;
}

export class StatsAnalyticsRangeDto {
  @ApiProperty({ example: '2026-01-01' })
  startDate: string;

  @ApiProperty({ example: '2026-03-07' })
  endDate: string;

  @ApiProperty({ example: true })
  includesToday: boolean;

  @ApiProperty({ example: 'UTC' })
  timezone: string;
}

export class StatsAnalyticsResponseDto {
  @ApiProperty({ type: () => StatsAnalyticsRangeDto })
  range: StatsAnalyticsRangeDto;

  @ApiProperty({ example: '2026-03-07T14:32:00.000Z' })
  generatedAt: string;

  @ApiProperty({ type: () => DailyStatsPointDto, isArray: true })
  series: DailyStatsPointDto[];
}
