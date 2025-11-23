import { IsNotEmpty, IsString } from 'class-validator';

/**
 * DTO for sending a user message in onboarding conversation
 */
export class SendMessageDto {
  @IsNotEmpty()
  @IsString()
  content: string;
}
