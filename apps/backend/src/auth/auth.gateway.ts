import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { Server, Socket } from 'socket.io';

/**
 * WebSocket Gateway for authentication QR code real-time updates
 * Handles:
 * - QR code updates (when WhatsApp refreshes the QR code)
 * - Connection status updates
 */
@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
  namespace: '/auth',
})
export class AuthGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AuthGateway.name);
  // Map pairingToken -> socket (for local instance)
  private tokenSockets: Map<string, Socket> = new Map();

  constructor(private readonly configService: ConfigService) {}

  /**
   * Initialize Redis adapter for multi-instance support
   */
  afterInit(server: Server) {
    const redisUrl = this.configService.get<string>('REDIS_URL');

    if (redisUrl) {
      try {
        const pubClient = new Redis(redisUrl);
        const subClient = pubClient.duplicate();

        server.adapter(createAdapter(pubClient, subClient));
        this.logger.log('✅ Redis adapter initialized for Auth WebSocket');
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
   * Handle client connection with pairingToken
   */
  async handleConnection(client: Socket) {
    try {
      // Extract pairingToken from handshake
      const pairingToken =
        (client.handshake.auth?.pairingToken as string) ||
        (client.handshake.query?.pairingToken as string);

      if (!pairingToken) {
        this.logger.warn(`Client ${client.id} connected without pairingToken`);
        client.disconnect();
        return;
      }

      // Store token-socket mapping
      this.tokenSockets.set(pairingToken, client);
      client.data.pairingToken = pairingToken;

      this.logger.log(
        `Client connected with pairingToken: ${pairingToken} (socket: ${client.id})`,
      );

      // Join client to room based on pairingToken
      await client.join(`pairing:${pairingToken}`);
    } catch (error) {
      this.logger.error(`Connection failed for client ${client.id}`, error);
      client.disconnect();
    }
  }

  /**
   * Handle client disconnection
   */
  handleDisconnect(client: Socket) {
    const pairingToken = client.data.pairingToken as string | undefined;
    if (pairingToken) {
      this.tokenSockets.delete(pairingToken);
      this.logger.log(
        `Client disconnected: ${pairingToken} (socket: ${client.id})`,
      );
    }
  }

  /**
   * Emit QR code update to client
   */
  emitQRCode(pairingToken: string, qrCode: string) {
    const timestamp = new Date().toISOString();
    const payload = {
      qrCode,
      timestamp,
      // Expected refresh interval for WhatsApp Web QR codes (20-30 seconds)
      expectedRefreshInterval: 25000, // 25 seconds in milliseconds
    };

    this.server.to(`pairing:${pairingToken}`).emit('auth:qr-update', payload);

    this.logger.log(
      `[${timestamp}] 📤 Emitted QR code update to pairing: ${pairingToken} (QR length: ${qrCode.length})`,
    );
  }

  /**
   * Emit connection success to client
   */
  emitConnectionSuccess(pairingToken: string) {
    this.server.to(`pairing:${pairingToken}`).emit('auth:connected', {
      success: true,
      timestamp: new Date().toISOString(),
    });
    this.logger.log(`Emitted connection success to pairing: ${pairingToken}`);
  }

  /**
   * Emit connection error to client
   */
  emitConnectionError(pairingToken: string, error: string) {
    this.server.to(`pairing:${pairingToken}`).emit('auth:error', {
      error,
      timestamp: new Date().toISOString(),
    });
    this.logger.error(`Emitted connection error to pairing: ${pairingToken}`);
  }
}
