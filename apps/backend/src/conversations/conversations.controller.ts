import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

@ApiTags('conversations')
@Controller('conversations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all conversations for current user' })
  @ApiResponse({
    status: 200,
    description: 'List of conversations retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getAllConversations(@Request() req: any) {
    return this.conversationsService.getAllForUser(req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get conversation by ID with messages' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiResponse({
    status: 200,
    description: 'Conversation retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async getConversation(@Param('id') id: string, @Request() req: any) {
    return this.conversationsService.getById(id, req.user.userId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new conversation' })
  @ApiResponse({
    status: 201,
    description: 'Conversation created successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @HttpCode(HttpStatus.CREATED)
  async createConversation(
    @Body() createConversationDto: CreateConversationDto,
    @Request() req: any,
  ) {
    return this.conversationsService.create(
      req.user.userId,
      createConversationDto,
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an existing conversation' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiResponse({
    status: 200,
    description: 'Conversation updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async updateConversation(
    @Param('id') id: string,
    @Body() updateConversationDto: UpdateConversationDto,
    @Request() req: any,
  ) {
    return this.conversationsService.update(
      id,
      req.user.userId,
      updateConversationDto,
    );
  }

  @Post(':id/tags')
  @ApiOperation({ summary: 'Add tag to conversation' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiResponse({
    status: 201,
    description: 'Tag added successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Conversation or tag not found' })
  @HttpCode(HttpStatus.CREATED)
  async addTag(
    @Param('id') id: string,
    @Body('tagId') tagId: string,
    @Request() req: any,
  ) {
    return this.conversationsService.addTag(id, req.user.userId, tagId);
  }

  @Delete(':id/tags/:tagId')
  @ApiOperation({ summary: 'Remove tag from conversation' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiParam({ name: 'tagId', description: 'Tag ID' })
  @ApiResponse({
    status: 204,
    description: 'Tag removed successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Conversation or tag not found' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeTag(
    @Param('id') id: string,
    @Param('tagId') tagId: string,
    @Request() req: any,
  ) {
    await this.conversationsService.removeTag(id, req.user.userId, tagId);
  }

  @Patch(':id/group')
  @ApiOperation({ summary: 'Set group for conversation' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiResponse({
    status: 200,
    description: 'Group set successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Conversation or group not found' })
  async setGroup(
    @Param('id') id: string,
    @Body('groupId') groupId: string,
    @Request() req: any,
  ) {
    return this.conversationsService.setGroup(id, req.user.userId, groupId);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Get messages for conversation' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of messages to retrieve',
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: 'Messages retrieved successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async getMessages(
    @Param('id') id: string,
    @Query('limit') limit: string,
    @Request() req: any,
  ) {
    const messageLimit = limit ? parseInt(limit, 10) : 50;
    return this.conversationsService.getMessages(
      id,
      req.user.userId,
      messageLimit,
    );
  }
}
