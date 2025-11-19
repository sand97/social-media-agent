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

  /**
   * Upload un buffer (image depuis une requête HTTP)
   */
  async uploadBuffer(
    buffer: Buffer,
    objectKey: string,
    contentType: string = 'application/octet-stream',
  ): Promise<{ success: boolean; url?: string }> {
    if (!this.minioClient) {
      this.logger.warn('Minio non configuré, upload ignoré');
      return { success: false };
    }

    try {
      await this.minioClient.putObject(
        this.bucket,
        objectKey,
        buffer,
        buffer.length,
        {
          'Content-Type': contentType,
        },
      );

      const url = `${this.publicUrl}/${this.bucket}/${objectKey}`;

      this.logger.log(
        `✅ Buffer uploadé: ${objectKey} (${Math.round(buffer.length / 1024)}KB)`,
      );

      return { success: true, url };
    } catch (error: any) {
      this.logger.error(`❌ Erreur upload ${objectKey}: ${error.message}`);
      return { success: false };
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
