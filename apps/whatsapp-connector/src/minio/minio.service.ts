import * as fs from 'fs';
import * as path from 'path';

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private readonly minioClient: Minio.Client;
  private readonly bucket: string;

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

    if (!accessKey || !secretKey) {
      this.logger.warn(
        '⚠️  Minio credentials not configured. Minio service disabled.',
      );
      return;
    }

    // Log masqué pour debugging
    this.logger.debug(
      `Minio config - Endpoint: ${endpoint}:${port}, SSL: ${useSSL}, ` +
        `AccessKey: ${accessKey?.substring(0, 4)}..., ` +
        `SecretKey: ${secretKey?.substring(0, 4)}..., ` +
        `Bucket: ${this.bucket}`,
    );

    this.minioClient = new Minio.Client({
      endPoint: endpoint,
      port,
      useSSL: useSSL === true || useSSL === 'true',
      accessKey,
      secretKey,
      region: 'us-east-1', // Région par défaut
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
      // Vérifier si le bucket existe, sinon le créer
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
   * Vérifie si un fichier existe dans le bucket
   */
  async fileExists(key: string): Promise<boolean> {
    if (!this.minioClient) {
      return false;
    }

    try {
      await this.minioClient.statObject(this.bucket, key);
      return true;
    } catch (error: any) {
      if (error.code === 'NotFound') {
        return false;
      }
      this.logger.error(
        `❌ Erreur vérification fichier ${key}: ${error.message}`,
      );
      return false;
    }
  }

  /**
   * Upload un fichier depuis le système de fichiers local
   */
  async uploadFile(
    localFilePath: string,
    objectKey: string,
    contentType?: string,
  ): Promise<boolean> {
    if (!this.minioClient) {
      this.logger.warn('Minio non configuré, upload ignoré');
      return false;
    }

    try {
      // Vérifier si le fichier local existe
      if (!fs.existsSync(localFilePath)) {
        this.logger.error(`❌ Fichier local introuvable: ${localFilePath}`);
        return false;
      }

      // Détecter le content-type si non fourni
      if (!contentType) {
        const ext = path.extname(localFilePath).toLowerCase();
        const mimeTypes: { [key: string]: string } = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.json': 'application/json',
          '.txt': 'text/plain',
        };
        contentType = mimeTypes[ext] || 'application/octet-stream';
      }

      // Upload du fichier
      const fileStats = fs.statSync(localFilePath);
      const metaData = {
        'Content-Type': contentType,
        'Content-Length': fileStats.size,
      };

      await this.minioClient.fPutObject(
        this.bucket,
        objectKey,
        localFilePath,
        metaData,
      );

      this.logger.log(
        `✅ Fichier uploadé: ${objectKey} (${Math.round(fileStats.size / 1024)}KB)`,
      );
      return true;
    } catch (error: any) {
      this.logger.error(`❌ Erreur upload ${objectKey}: ${error.message}`);
      return false;
    }
  }

  /**
   * Upload un objet JSON
   */
  async uploadJson(objectKey: string, data: any): Promise<boolean> {
    if (!this.minioClient) {
      this.logger.warn('Minio non configuré, upload ignoré');
      return false;
    }

    try {
      const jsonString = JSON.stringify(data, null, 2);
      const buffer = Buffer.from(jsonString, 'utf8');

      await this.minioClient.putObject(
        this.bucket,
        objectKey,
        buffer,
        buffer.length,
        {
          'Content-Type': 'application/json',
        },
      );

      this.logger.log(
        `✅ JSON uploadé: ${objectKey} (${Math.round(buffer.length / 1024)}KB)`,
      );
      return true;
    } catch (error: any) {
      this.logger.error(`❌ Erreur upload JSON ${objectKey}: ${error.message}`);
      return false;
    }
  }

  /**
   * Télécharge un fichier depuis Minio
   */
  async downloadFile(
    objectKey: string,
    localFilePath: string,
  ): Promise<boolean> {
    if (!this.minioClient) {
      this.logger.warn('Minio non configuré, download ignoré');
      return false;
    }

    try {
      // Créer le dossier local si nécessaire
      const localDir = path.dirname(localFilePath);
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }

      await this.minioClient.fGetObject(this.bucket, objectKey, localFilePath);
      this.logger.log(`✅ Fichier téléchargé: ${objectKey} → ${localFilePath}`);
      return true;
    } catch (error: any) {
      this.logger.error(`❌ Erreur download ${objectKey}: ${error.message}`);
      return false;
    }
  }

  /**
   * Liste les objets avec un préfixe donné
   */
  async listObjects(prefix: string): Promise<string[]> {
    if (!this.minioClient) {
      return [];
    }

    return new Promise((resolve, reject) => {
      const objects: string[] = [];
      const stream = this.minioClient.listObjects(this.bucket, prefix, true);

      stream.on('data', (obj) => {
        if (obj.name) {
          objects.push(obj.name);
        }
      });

      stream.on('error', (error) => {
        this.logger.error(`❌ Erreur listage ${prefix}: ${error.message}`);
        reject(error);
      });

      stream.on('end', () => {
        resolve(objects);
      });
    });
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

  /**
   * Obtient une URL pré-signée pour télécharger un fichier (valide pendant X secondes)
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
}
