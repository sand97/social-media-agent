import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private webhookUrls: string[] = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.loadWebhookUrls();
  }

  private loadWebhookUrls() {
    const webhooksEnv = this.configService.get<string>('WEBHOOK_URLS', '');

    if (!webhooksEnv) {
      this.logger.warn('No webhook URLs configured');
      return;
    }

    // Parse les URLs séparées par des virgules
    this.webhookUrls = webhooksEnv
      .split(',')
      .map((url) => url.trim())
      .filter((url) => url.length > 0);

    this.logger.log(`Loaded ${this.webhookUrls.length} webhook URL(s)`);
    this.webhookUrls.forEach((url, index) => {
      this.logger.log(`  [${index + 1}] ${url}`);
    });
  }

  /**
   * Envoie un événement à tous les webhooks configurés
   */
  async sendEvent(eventName: string, data: any) {
    if (this.webhookUrls.length === 0) {
      this.logger.debug(
        `Event "${eventName}" - No webhooks configured, skipping`,
      );
      return;
    }

    const payload = {
      event: eventName,
      timestamp: new Date().toISOString(),
      data,
    };

    this.logger.debug(
      `Sending event "${eventName}" to ${this.webhookUrls.length} webhook(s)`,
    );

    // Envoyer à tous les webhooks en parallèle (sans attendre)
    const promises = this.webhookUrls.map((url) =>
      this.sendToWebhook(url, payload).catch((error) => {
        // Log l'erreur mais ne bloque pas les autres webhooks
        this.logger.error(
          `Failed to send event "${eventName}" to ${url}:`,
          error.message,
        );
      }),
    );

    // Fire and forget - on n'attend pas les réponses
    Promise.all(promises).catch(() => {
      // Ignore les erreurs globales
    });
  }

  /**
   * Génère une signature HMAC-SHA256 pour le payload
   */
  private generateSignature(payload: any): string | null {
    const connectorSecret =
      this.configService.get<string>('CONNECTOR_SECRET');

    if (!connectorSecret) {
      return null;
    }

    const body = JSON.stringify(payload);
    return crypto.createHmac('sha256', connectorSecret).update(body).digest('hex');
  }

  /**
   * Envoie un payload à un webhook spécifique
   */
  private async sendToWebhook(url: string, payload: any): Promise<void> {
    try {
      const headers: any = {
        'Content-Type': 'application/json',
        'User-Agent': 'WhatsApp-Connector/1.0',
      };

      // Ajouter la signature si un secret est configuré
      const signature = this.generateSignature(payload);
      if (signature) {
        headers['X-Connector-Signature'] = signature;
      }

      const response = await firstValueFrom(
        this.httpService.post(url, payload, {
          headers,
          timeout: 5000, // 5 secondes de timeout
        }),
      );

      this.logger.debug(`Event sent to ${url} - Status: ${response.status}`);
    } catch (error: any) {
      // Si c'est une erreur HTTP, on log le status code
      if (error.response) {
        throw new Error(
          `HTTP ${error.response.status}: ${error.response.statusText}`,
        );
      }
      throw error;
    }
  }

  /**
   * Permet de mettre à jour les URLs de webhook à chaud
   */
  setWebhookUrls(urls: string[]) {
    this.webhookUrls = urls.filter((url) => url.length > 0);
    this.logger.log(`Updated webhook URLs: ${this.webhookUrls.length} URL(s)`);
  }

  /**
   * Retourne la liste des webhooks configurés
   */
  getWebhookUrls(): string[] {
    return [...this.webhookUrls];
  }
}
