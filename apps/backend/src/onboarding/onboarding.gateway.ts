import { Logger, forwardRef, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { Server, Socket } from 'socket.io';

import { OnboardingService } from './onboarding.service';

/**
 * WebSocket Gateway for onboarding real-time communication
 * Handles:
 * - Sync progress updates
 * - AI conversation messages
 * - Score updates
 * - Thread status updates
 */
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
  namespace: '/onboarding',
})
export class OnboardingGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(OnboardingGateway.name);
  private userSockets: Map<string, Socket> = new Map(); // userId -> socket (local instance only)

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => OnboardingService))
    private readonly onboardingService: OnboardingService,
  ) {}

  /**
   * Initialize Redis adapter for multi-instance support
   * Called after WebSocket server is initialized
   */
  afterInit(server: Server) {
    const redisUrl = this.configService.get<string>('REDIS_URL');

    if (redisUrl) {
      try {
        const pubClient = new Redis(redisUrl);
        const subClient = pubClient.duplicate();

        server.adapter(createAdapter(pubClient, subClient));
        this.logger.log('✅ Redis adapter initialized for WebSocket');
      } catch (error) {
        this.logger.warn(
          `⚠️ Failed to initialize Redis adapter: ${error instanceof Error ? error.message : error}`,
        );
        this.logger.warn('WebSocket will work in single-instance mode');
      }
    } else {
      this.logger.warn(
        '⚠️ REDIS_URL not configured, WebSocket running in single-instance mode',
      );
    }
  }

  /**
   * Handle client connection with JWT authentication
   */
  async handleConnection(client: Socket) {
    try {
      // Extract JWT token from handshake
      const token =
        client.handshake.auth.token ||
        client.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      // Verify JWT token
      const payload = await this.jwtService.verifyAsync(token);
      const userId = payload.sub;

      if (!userId) {
        this.logger.warn(`Client ${client.id} has invalid token`);
        client.disconnect();
        return;
      }

      // Store user socket mapping
      this.userSockets.set(userId, client);
      client.data.userId = userId;

      this.logger.log(`User ${userId} connected (socket: ${client.id})`);

      // Join user to their personal room
      client.join(`user:${userId}`);
    } catch (error) {
      this.logger.error(
        `Authentication failed for client ${client.id}`,

        error,
      );
      client.disconnect();
    }
  }

  /**
   * Handle client disconnection
   */
  handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (userId) {
      this.userSockets.delete(userId);
      this.logger.log(`User ${userId} disconnected (socket: ${client.id})`);
    }
  }

  /**
   * Client sends a message to the AI
   */
  @SubscribeMessage('client:message')
  async handleClientMessage(
    @MessageBody() data: { content: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.data.userId;
    this.logger.log(`User ${userId} sent message: ${data.content}`);

    // Process message asynchronously
    this.onboardingService
      .handleUserMessage(userId, data.content)
      .catch((error) => {
        this.logger.error(`Failed to handle user message: ${error.message}`);
      });

    return {
      event: 'message:received',
      data: { success: true },
    };
  }

  /**
   * Client cancels the current AI processing
   */
  @SubscribeMessage('client:cancel')
  async handleClientCancel(@ConnectedSocket() client: Socket) {
    const userId = client.data.userId;
    this.logger.log(`User ${userId} requested cancellation`);

    const restoredContent =
      await this.onboardingService.cancelProcessing(userId);

    // Emit cancellation confirmation with the restored message
    this.server.to(`user:${userId}`).emit('onboarding:cancelled', {
      success: true,
      restoredContent,
    });

    return {
      event: 'cancel:received',
      data: { success: true },
    };
  }

  /**
   * Emit sync progress update to user
   */
  emitSyncProgress(
    userId: string,
    data: {
      step: 'clientInfo' | 'catalog';
      status: 'started' | 'in_progress' | 'completed' | 'failed';
      progress?: number;
      details?: string;
      timestamp?: string;
    },
  ) {
    this.server.to(`user:${userId}`).emit('sync:progress', data);
    this.logger.debug(`Emitted sync:progress to user ${userId}`, data);
  }

  /**
   * Emit sync started event
   */
  emitSyncStarted(userId: string, step: 'clientInfo' | 'catalog') {
    this.server.to(`user:${userId}`).emit('sync:started', { step });
    this.logger.log(`Emitted sync:started (${step}) to user ${userId}`);
  }

  /**
   * Emit sync completed event
   */
  emitSyncCompleted(userId: string, step: 'clientInfo' | 'catalog') {
    this.server.to(`user:${userId}`).emit('sync:completed', { step });
    this.logger.log(`Emitted sync:completed (${step}) to user ${userId}`);
  }

  /**
   * Emit sync failed event
   */
  emitSyncFailed(
    userId: string,
    step: 'clientInfo' | 'catalog',
    error: string,
  ) {
    this.server.to(`user:${userId}`).emit('sync:failed', { step, error });
    this.logger.error(
      `Emitted sync:failed (${step}) to user ${userId}: ${error}`,
    );
  }

  /**
   * Emit AI message to user
   */
  emitAIMessage(
    userId: string,
    data: {
      message: string;
      score?: number;
      context?: string;
      needs?: any;
      question?: string;
      propositions?: string[];
    },
  ) {
    this.server.to(`user:${userId}`).emit('onboarding:ai_message', data);
    this.logger.log(`Emitted AI message to user ${userId}`);
  }

  /**
   * Emit score update to user
   */
  emitScoreUpdate(userId: string, score: number) {
    this.server.to(`user:${userId}`).emit('score:updated', { score });
    this.logger.log(`Emitted score update to user ${userId}: ${score}`);
  }

  /**
   * Emit thread ready event (first message received)
   */
  emitThreadReady(userId: string) {
    this.server.to(`user:${userId}`).emit('thread:ready');
    this.logger.log(`Emitted thread:ready to user ${userId}`);
  }

  /**
   * Emit agent status update
   */
  emitAgentStatus(
    userId: string,
    status: {
      connectionStatus: string;
      syncStatus: string;
      syncProgress?: any;
    },
  ) {
    this.server.to(`user:${userId}`).emit('agent:status', status);
    this.logger.debug(`Emitted agent:status to user ${userId}`, status);
  }

  /**
   * Emit tool executing status
   */
  emitToolExecuting(userId: string, toolName: string) {
    this.server
      .to(`user:${userId}`)
      .emit('onboarding:tool_executing', { toolName });
    this.logger.debug(`Emitted tool_executing to user ${userId}: ${toolName}`);
  }

  /**
   * Emit thinking status (when AI is processing without tools)
   */
  emitThinking(userId: string, isThinking: boolean) {
    this.server
      .to(`user:${userId}`)
      .emit('onboarding:thinking', { isThinking });
    this.logger.debug(`Emitted thinking to user ${userId}: ${isThinking}`);
  }
}
