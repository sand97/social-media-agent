import * as crypto from 'crypto';

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/**
 * Guard pour vérifier la signature des webhooks venant du connector
 * Le connector doit envoyer un header X-Connector-Signature avec
 * HMAC-SHA256(body, CONNECTOR_SECRET)
 */
@Injectable()
export class ConnectorSignatureGuard implements CanActivate {
  private readonly logger = new Logger(ConnectorSignatureGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const connectorSecret = this.configService.get<string>('CONNECTOR_SECRET');

    // Si pas de secret configuré, on autorise (développement)
    if (!connectorSecret) {
      this.logger.warn(
        '⚠️  CONNECTOR_SECRET not configured - signature verification disabled',
      );
      return true;
    }

    const signature = request.headers['x-connector-signature'] as string;

    if (!signature) {
      this.logger.error('❌ Missing X-Connector-Signature header');
      throw new UnauthorizedException('Missing signature');
    }

    // Générer la signature attendue
    const body = JSON.stringify(request.body);
    const expectedSignature = crypto
      .createHmac('sha256', connectorSecret)
      .update(body)
      .digest('hex');

    if (signature !== expectedSignature) {
      this.logger.error('❌ Invalid signature');
      this.logger.debug(`Expected: ${expectedSignature}`);
      this.logger.debug(`Received: ${signature}`);
      throw new UnauthorizedException('Invalid signature');
    }

    this.logger.debug('✅ Signature verified');
    return true;
  }
}
