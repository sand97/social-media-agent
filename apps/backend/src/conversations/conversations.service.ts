import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { UpdateConversationDto } from './dto/update-conversation.dto';
import { Conversation } from '@app/generated/client';

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all conversations for a user with tags, group, and last message
   */
  async getAllForUser(userId: string) {
    return this.prisma.conversation.findMany({
      where: { userId },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
        group: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });
  }

  /**
   * Get conversation by ID with messages
   */
  async getById(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
        group: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this conversation',
      );
    }

    return conversation;
  }

  /**
   * Create a new conversation
   */
  async create(
    userId: string,
    data: CreateConversationDto,
  ): Promise<Conversation> {
    if (!data.whatsappChatId || data.whatsappChatId.trim() === '') {
      throw new BadRequestException('WhatsApp chat ID is required');
    }

    if (!data.contactNumber || data.contactNumber.trim() === '') {
      throw new BadRequestException('Contact number is required');
    }

    return this.prisma.conversation.create({
      data: {
        userId,
        whatsappChatId: data.whatsappChatId,
        contactName: data.contactName || null,
        contactNumber: data.contactNumber,
      },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
        group: true,
      },
    });
  }

  /**
   * Update an existing conversation
   */
  async update(
    conversationId: string,
    userId: string,
    data: UpdateConversationDto,
  ): Promise<Conversation> {
    // Verify ownership
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to update this conversation',
      );
    }

    // Build update data
    const updateData: any = {};
    if (data.contactName !== undefined) updateData.contactName = data.contactName;
    if (data.requiresManualResponse !== undefined)
      updateData.requiresManualResponse = data.requiresManualResponse;

    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: updateData,
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
        group: true,
      },
    });
  }

  /**
   * Add tag to conversation
   */
  async addTag(conversationId: string, userId: string, tagId: string) {
    // Verify conversation ownership
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to modify this conversation',
      );
    }

    // Verify tag ownership
    const tag = await this.prisma.tag.findUnique({
      where: { id: tagId },
    });

    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    if (tag.userId !== userId && !tag.isSystem) {
      throw new ForbiddenException(
        'You do not have permission to use this tag',
      );
    }

    // Check if tag is already added
    const existingTag = await this.prisma.conversationTag.findUnique({
      where: {
        conversationId_tagId: {
          conversationId,
          tagId,
        },
      },
    });

    if (existingTag) {
      throw new BadRequestException('Tag already added to this conversation');
    }

    return this.prisma.conversationTag.create({
      data: {
        conversationId,
        tagId,
      },
      include: {
        tag: true,
      },
    });
  }

  /**
   * Remove tag from conversation
   */
  async removeTag(conversationId: string, userId: string, tagId: string) {
    // Verify conversation ownership
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to modify this conversation',
      );
    }

    const conversationTag = await this.prisma.conversationTag.findUnique({
      where: {
        conversationId_tagId: {
          conversationId,
          tagId,
        },
      },
    });

    if (!conversationTag) {
      throw new NotFoundException('Tag not found on this conversation');
    }

    await this.prisma.conversationTag.delete({
      where: {
        conversationId_tagId: {
          conversationId,
          tagId,
        },
      },
    });
  }

  /**
   * Set group for conversation
   */
  async setGroup(conversationId: string, userId: string, groupId: string) {
    // Verify conversation ownership
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to modify this conversation',
      );
    }

    // Verify group ownership
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    if (group.userId !== userId && !group.isSystem) {
      throw new ForbiddenException(
        'You do not have permission to use this group',
      );
    }

    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: { groupId },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
        group: true,
      },
    });
  }

  /**
   * Get messages for conversation
   */
  async getMessages(
    conversationId: string,
    userId: string,
    limit: number = 50,
  ) {
    // Verify conversation ownership
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this conversation',
      );
    }

    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
