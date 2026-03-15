import { ApiProperty } from '@nestjs/swagger';

export class SupportFeedbackResponseDto {
  @ApiProperty({
    description: 'Generated Sentry feedback event identifier',
    example: '4f3c0f5d5d8748f394e8d4c7a1b23456',
  })
  eventId: string;
}
