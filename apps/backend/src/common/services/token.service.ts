import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

export interface CatalogUploadTokenPayload {
  clientId: string;
  type: 'catalog-upload';
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Génère un token JWT pour l'upload d'images de catalogue
   * Le token contient le clientId signé et expire après 1 heure
   */
  generateCatalogUploadToken(clientId: string): string {
    const jwtSecret = this.configService.get<string>('JWT_SECRET');

    if (!jwtSecret) {
      throw new Error('JWT_SECRET not configured');
    }

    const payload: CatalogUploadTokenPayload = {
      clientId,
      type: 'catalog-upload',
    };

    const token = jwt.sign(payload, jwtSecret, {
      expiresIn: '1h', // Token valide pendant 1 heure
    });

    this.logger.debug(`🔑 Generated catalog upload token for client: ${clientId}`);

    return token;
  }

  /**
   * Vérifie un token et retourne le clientId
   */
  verifyCatalogUploadToken(token: string): string {
    const jwtSecret = this.configService.get<string>('JWT_SECRET');

    if (!jwtSecret) {
      throw new Error('JWT_SECRET not configured');
    }

    try {
      const payload = jwt.verify(token, jwtSecret) as CatalogUploadTokenPayload;

      if (payload.type !== 'catalog-upload') {
        throw new Error('Invalid token type');
      }

      return payload.clientId;
    } catch (error: any) {
      this.logger.error(`❌ Token verification failed: ${error.message}`);
      throw error;
    }
  }
}
