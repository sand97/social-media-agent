import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../guards/jwt-auth.guard';

import { SendMessageDto } from './dto/send-message.dto';
import { OnboardingService } from './onboarding.service';

/**
 * Controller for onboarding operations
 * Provides REST API for thread management and message handling
 */
@ApiTags('Onboarding')
@ApiBearerAuth()
@Controller('onboarding')
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  /**
   * Get onboarding thread with messages for current user
   */
  @Get('threads')
  @ApiOperation({
    summary: 'Get onboarding thread',
    description: 'Returns onboarding thread with messages and current score',
  })
  async getThread(@Request() req: any) {
    return await this.onboardingService.getThreadWithMessages(req.user.id);
  }

  /**
   * Send a user message and get AI response
   * This triggers the AI conversation flow
   */
  @Post('messages')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Send user message',
    description:
      'Sends a user message and triggers AI response. Returns 202 Accepted. Response will be sent via WebSocket.',
  })
  async sendMessage(@Request() req: any, @Body() dto: SendMessageDto) {
    // Process asynchronously, response will come via WebSocket
    this.onboardingService
      .handleUserMessage(req.user.id, dto.content)
      .catch((error) => {
        // Error handling is done in service with WebSocket emission
        console.error('Failed to handle user message:', error);
      });

    return { message: 'Message received, processing...' };
  }

  /**
   * Complete onboarding manually
   * User must have score >= 80 to complete (warning if not)
   */
  @Post('complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete onboarding',
    description:
      'Marks onboarding as completed and activates the user. Requires score >= 80%.',
  })
  async completeOnboarding(@Request() req: any) {
    return await this.onboardingService.completeOnboarding(req.user.id);
  }
}
