import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private readonly minioClient: Minio.Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.configService.get<string>(
      'MINIO_ENDPOINT',
      'localhost',
    );
    const portValue = this.configService.get<string>('MINIO_PORT', '9000');
    const port = parseInt(portValue, 10);
    const useSSL = this.configService.get<boolean | string>(
      'MINIO_USE_SSL',
      false,
    );
    const accessKey = this.configService.get<string>('MINIO_ACCESS_KEY');
    const secretKey = this.configService.get<string>('MINIO_SECRET_KEY');
    this.bucket = this.configService.get<string>(
      'MINIO_BUCKET',
      'whatsapp-agent',
    );

    // Construire l'URL publique pour accéder aux fichiers
    const protocol = useSSL === true || useSSL === 'true' ? 'https' : 'http';
    const portSuffix =
      (protocol === 'https' && port === 443) ||
      (protocol === 'http' && port === 80)
        ? ''
        : `:${port}`;
    this.publicUrl = `${protocol}://${endpoint}${portSuffix}`;

    if (!accessKey || !secretKey) {
      this.logger.warn(
        '⚠️  Minio credentials not configured. Minio service disabled.',
      );
      return;
    }

    this.minioClient = new Minio.Client({
      endPoint: endpoint,
      port,
      useSSL: useSSL === true || useSSL === 'true',
      accessKey,
      secretKey,
      region: 'us-east-1',
    });

    this.logger.log(
      `✅ Minio client initialized: ${endpoint}:${port} (SSL: ${useSSL})`,
    );
  }

  async onModuleInit() {
    if (!this.minioClient) {
      return;
    }

    try {
      const bucketExists = await this.minioClient.bucketExists(this.bucket);
      if (!bucketExists) {
        await this.minioClient.makeBucket(this.bucket, 'us-east-1');
        this.logger.log(`📦 Bucket créé: ${this.bucket}`);
      } else {
        this.logger.log(`📦 Bucket existe: ${this.bucket}`);
      }
    } catch (error: any) {
      this.logger.error(`❌ Erreur initialisation bucket: ${error.message}`);
    }
  }

  private formatMinioError(error: any): string {
    const details = {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      statusCode: error?.statusCode,
      resource: error?.resource,
      bucketName: error?.bucketName,
      objectName: error?.objectName,
      region: error?.region || error?.amzBucketRegion,
      amzRequestId: error?.amzRequestid || error?.amzRequestId,
      amzId2: error?.amzId2,
      cause: error?.cause,
    };

    try {
      return JSON.stringify(details);
    } catch {
      return String(error?.message || error);
    }
  }

  private buildPublicObjectUrl(objectKey: string): string {
    return `${this.publicUrl}/${this.bucket}/${objectKey}`;
  }

  private async checkPublicObjectAvailability(objectKey: string): Promise<{
    exists: boolean | null;
    method: 'HEAD' | 'GET';
    statusCode?: number;
    details?: string;
    url: string;
  }> {
    const url = this.buildPublicObjectUrl(objectKey);

    try {
      const headResponse = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });

      if (headResponse.ok) {
        return {
          exists: true,
          method: 'HEAD',
          statusCode: headResponse.status,
          url,
        };
      }

      if (headResponse.status === 404) {
        return {
          exists: false,
          method: 'HEAD',
          statusCode: headResponse.status,
          url,
        };
      }

      this.logger.warn(
        `[MINIO] Public HEAD inconclusive objectKey=${objectKey} status=${headResponse.status}, retrying with ranged GET`,
      );
    } catch (error: any) {
      this.logger.warn(
        `[MINIO] Public HEAD failed objectKey=${objectKey} error=${error.message}, retrying with ranged GET`,
      );
    }

    try {
      const getResponse = await fetch(url, {
        method: 'GET',
        headers: {
          Range: 'bytes=0-0',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (getResponse.ok || getResponse.status === 206) {
        return {
          exists: true,
          method: 'GET',
          statusCode: getResponse.status,
          url,
        };
      }

      if (getResponse.status === 404) {
        return {
          exists: false,
          method: 'GET',
          statusCode: getResponse.status,
          url,
        };
      }

      return {
        exists: null,
        method: 'GET',
        statusCode: getResponse.status,
        details: `Unexpected public GET status ${getResponse.status}`,
        url,
      };
    } catch (error: any) {
      return {
        exists: null,
        method: 'GET',
        details: error.message,
        url,
      };
    }
  }

  /**
   * Extrait la clé objet MinIO depuis une URL publique.
   * Format attendu: {publicUrl}/{bucket}/{objectKey}
   */
  getObjectKeyFromUrl(fileUrl: string): string | null {
    if (!fileUrl) {
      return null;
    }

    try {
      const parsedUrl = new URL(fileUrl);
      const pathSegments = parsedUrl.pathname
        .split('/')
        .filter((segment) => segment.length > 0);
      const bucketIndex = pathSegments.indexOf(this.bucket);

      if (bucketIndex === -1) {
        return null;
      }

      const objectKey = pathSegments.slice(bucketIndex + 1).join('/');
      return objectKey ? decodeURIComponent(objectKey) : null;
    } catch (error: any) {
      this.logger.warn(
        `⚠️  Impossible d'extraire la clé objet depuis l'URL ${fileUrl}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Vérifie si un fichier existe dans MinIO.
   * Retourne:
   * - true: objet présent
   * - false: objet absent
   * - null: état non vérifiable (MinIO indisponible/erreur réseau)
   */
  async fileExists(objectKey: string): Promise<boolean | null> {
    if (!this.minioClient) {
      this.logger.warn('Minio non configuré, vérification ignorée');
      return null;
    }

    const availability = await this.checkPublicObjectAvailability(objectKey);

    if (availability.exists === true) {
      this.logger.debug(
        `[MINIO] Public availability verified objectKey=${objectKey} method=${availability.method} status=${availability.statusCode} url=${availability.url}`,
      );
      return true;
    }

    if (availability.exists === false) {
      this.logger.warn(
        `[MINIO] Public object missing objectKey=${objectKey} method=${availability.method} status=${availability.statusCode} url=${availability.url}`,
      );
      return false;
    }

    this.logger.error(
      `❌ [MINIO] Public availability check inconclusive objectKey=${objectKey} method=${availability.method} status=${availability.statusCode || 'n/a'} url=${availability.url} details=${availability.details || 'none'}`,
    );
    return null;
  }

  /**
   * Upload un buffer (image depuis une requête HTTP)
   */
  async uploadBuffer(
    buffer: Buffer,
    objectKey: string,
    contentType: string = 'application/octet-stream',
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    if (!this.minioClient) {
      this.logger.warn('Minio non configuré, upload ignoré');
      return { success: false, error: 'Minio not configured' };
    }

    try {
      this.logger.debug(
        `[MINIO] putObject start bucket=${this.bucket} objectKey=${objectKey} contentType=${contentType} bytes=${buffer.length}`,
      );

      await this.minioClient.putObject(
        this.bucket,
        objectKey,
        buffer,
        buffer.length,
        {
          'Content-Type': contentType,
        },
      );
      this.logger.debug(
        `[MINIO] putObject success bucket=${this.bucket} objectKey=${objectKey} bytes=${buffer.length}`,
      );

      const availability = await this.checkPublicObjectAvailability(objectKey);
      if (availability.exists !== true) {
        this.logger.error(
          `❌ [MINIO] Public verification failed right after putObject bucket=${this.bucket} objectKey=${objectKey} method=${availability.method} status=${availability.statusCode || 'n/a'} url=${availability.url} details=${availability.details || 'none'}`,
        );
        return {
          success: false,
          error: `public verification failed after putObject: method=${availability.method} status=${availability.statusCode || 'n/a'} details=${availability.details || 'none'}`,
        };
      }

      const url = availability.url;

      this.logger.log(
        `✅ Buffer uploadé: ${objectKey} (${Math.round(buffer.length / 1024)}KB)`,
      );
      this.logger.debug(
        `[MINIO] Public verification succeeded bucket=${this.bucket} objectKey=${objectKey} method=${availability.method} status=${availability.statusCode} url=${url}`,
      );

      return { success: true, url };
    } catch (error: any) {
      const formattedError = this.formatMinioError(error);
      this.logger.error(
        `❌ [MINIO] putObject failed bucket=${this.bucket} objectKey=${objectKey} contentType=${contentType} bytes=${buffer.length} details=${formattedError}`,
      );
      return {
        success: false,
        error: `putObject failed: ${formattedError}`,
      };
    }
  }

  /**
   * Obtient une URL pré-signée pour télécharger un fichier
   */
  async getPresignedUrl(
    objectKey: string,
    expirySeconds: number = 3600,
  ): Promise<string | null> {
    if (!this.minioClient) {
      return null;
    }

    try {
      const url = await this.minioClient.presignedGetObject(
        this.bucket,
        objectKey,
        expirySeconds,
      );
      return url;
    } catch (error: any) {
      this.logger.error(
        `❌ Erreur génération URL ${objectKey}: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Supprime un fichier
   */
  async deleteFile(objectKey: string): Promise<boolean> {
    if (!this.minioClient) {
      return false;
    }

    try {
      await this.minioClient.removeObject(this.bucket, objectKey);
      this.logger.log(`🗑️  Fichier supprimé: ${objectKey}`);
      return true;
    } catch (error: any) {
      this.logger.error(`❌ Erreur suppression ${objectKey}: ${error.message}`);
      return false;
    }
  }
}
