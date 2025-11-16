import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as qrcodeTerminal from 'qrcode-terminal';
import { firstValueFrom } from 'rxjs';
import { Client, LocalAuth } from 'whatsapp-web.js';

import { WebhookService } from './webhook.service';

@Injectable()
export class WhatsAppClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppClientService.name);
  private client: Client;
  private isReady = false;
  private qrCode: string | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly webhookService: WebhookService,
    private readonly httpService: HttpService,
  ) {}

  async onModuleInit() {
    await this.initialize();
  }

  async onModuleDestroy() {
    await this.destroy();
  }

  private async initialize() {
    this.logger.log('Initializing WhatsApp client...');

    const sessionPath = this.configService.get<string>(
      'WHATSAPP_SESSION_PATH',
      './data/sessions',
    );

    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: sessionPath,
      }),
      // webVersion: '2.3000.1026863126',
      // webVersionCache: { type: 'local', path: './.wwebjs_cache' },
      puppeteer: {
        // executablePath:
        //   '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--no-zygote',
          '--disable-gpu',
        ],
      },
    });

    this.setupEventListeners();

    await this.client.initialize();
  }

  private setupEventListeners() {
    // Liste exhaustive des événements wwebjs
    const events = [
      'ready',
      'authenticated',
      'auth_failure',
      'message',
      'message_create',
      'message_ack',
      'message_edit',
      'message_revoke_me',
      'message_revoke_everyone',
      'message_reaction',
      'media_uploaded',
      'group_join',
      'group_leave',
      'group_update',
      'group_admin_changed',
      'group_membership_request',
      'chat_archived',
      'chat_removed',
      'contact_changed',
      'disconnected',
      'change_state',
      'qr',
      'code',
      'incoming_call',
      'vote_update',
    ];

    // QR Code - afficher dans le terminal + traitement spécial
    this.client.on('qr', (...args) => {
      const [qr] = args;
      this.qrCode = qr;
      this.logger.log('QR Code received. Scan it to authenticate.');
      qrcodeTerminal.generate(qr, { small: true });

      // Envoyer tous les paramètres bruts au webhook
      this.webhookService.sendEvent('qr', args);
    });

    // Authenticated - événement déclenché lors du pairing réussi
    // Note: client.info n'est PAS encore disponible à ce stade
    this.client.on('authenticated', () => {
      const timestamp = new Date().toISOString();
      this.logger.log(
        `[${timestamp}] ✅ WhatsApp client authenticated successfully`,
      );
      this.logger.log('⏳ Waiting for "ready" event to retrieve user info...');
    });

    // Ready - traitement spécial pour le flag isReady
    // C'est ICI que client.info devient disponible
    this.client.on('ready', async (...args) => {
      const timestamp = new Date().toISOString();
      this.isReady = true;
      this.qrCode = null;
      this.logger.log(`[${timestamp}] ✅ WhatsApp client is ready!`, args);
      this.logger.log(
        '📞 Attempting to retrieve phone number and notify backend...',
      );

      this.webhookService.sendEvent('ready', args);

      // Notify backend of successful pairing
      // client.info est maintenant disponible
      await this.notifyBackendConnected();
    });

    // Auth failure
    this.client.on('auth_failure', (...args) => {
      this.logger.error('Authentication failure:', args);
      this.webhookService.sendEvent('auth_failure', args);
    });

    // Disconnected - traitement spécial pour le flag isReady
    this.client.on('disconnected', (...args) => {
      this.isReady = false;
      this.logger.warn('WhatsApp client disconnected:', args);
      this.webhookService.sendEvent('disconnected', args);
    });

    // Change state
    this.client.on('change_state', (...args) => {
      this.logger.log('State changed:', args);
      this.webhookService.sendEvent('change_state', args);
    });

    // Messages
    this.client.on('message', (...args) => {
      const [message] = args;
      this.logger.debug(`Message received from ${message?.from || 'unknown'}`);
      this.webhookService.sendEvent('message', args);
    });

    this.client.on('message_create', (...args) => {
      const [message] = args;
      this.logger.debug(
        `Message created: ${message?.id?._serialized || 'unknown'}`,
      );
      this.webhookService.sendEvent('message_create', args);
    });

    this.client.on('message_ack', (...args) => {
      const [message, ack] = args;
      this.logger.debug(
        `Message ACK: ${message?.id?._serialized || 'unknown'} - ${ack}`,
      );
      this.webhookService.sendEvent('message_ack', args);
    });

    this.client.on('message_edit', (...args) => {
      const [message] = args;
      this.logger.debug(
        `Message edited: ${message?.id?._serialized || 'unknown'}`,
      );
      this.webhookService.sendEvent('message_edit', args);
    });

    this.client.on('message_revoke_me', (...args) => {
      const [message] = args;
      this.logger.debug(
        `Message revoked for me: ${message?.id?._serialized || 'unknown'}`,
      );
      this.webhookService.sendEvent('message_revoke_me', args);
    });

    this.client.on('message_revoke_everyone', (...args) => {
      const [message] = args;
      this.logger.debug(
        `Message revoked for everyone: ${message?.id?._serialized || 'unknown'}`,
      );
      this.webhookService.sendEvent('message_revoke_everyone', args);
    });

    this.client.on('message_reaction', (...args) => {
      const [reaction] = args;
      this.logger.debug(
        `Message reaction: ${reaction?.id?._serialized || 'unknown'}`,
      );
      this.webhookService.sendEvent('message_reaction', args);
    });

    this.client.on('media_uploaded', (...args) => {
      const [message] = args;
      this.logger.debug(
        `Media uploaded: ${message?.id?._serialized || 'unknown'}`,
      );
      this.webhookService.sendEvent('media_uploaded', args);
    });

    // Groups
    this.client.on('group_join', (...args) => {
      this.logger.debug('User joined group');
      this.webhookService.sendEvent('group_join', args);
    });

    this.client.on('group_leave', (...args) => {
      this.logger.debug('User left group');
      this.webhookService.sendEvent('group_leave', args);
    });

    this.client.on('group_update', (...args) => {
      this.logger.debug('Group updated');
      this.webhookService.sendEvent('group_update', args);
    });

    this.client.on('group_admin_changed', (...args) => {
      this.logger.debug('Group admin changed');
      this.webhookService.sendEvent('group_admin_changed', args);
    });

    this.client.on('group_membership_request', (...args) => {
      this.logger.debug('Group membership request');
      this.webhookService.sendEvent('group_membership_request', args);
    });

    // Chats
    this.client.on('chat_archived', (...args) => {
      const [chat] = args;
      this.logger.debug(`Chat archived: ${chat?.id?._serialized || 'unknown'}`);
      this.webhookService.sendEvent('chat_archived', args);
    });

    this.client.on('chat_removed', (...args) => {
      const [chat] = args;
      this.logger.debug(`Chat removed: ${chat?.id?._serialized || 'unknown'}`);
      this.webhookService.sendEvent('chat_removed', args);
    });

    // Contacts
    this.client.on('contact_changed', (...args) => {
      const [contact] = args;
      this.logger.debug(
        `Contact changed: ${contact?.id?._serialized || 'unknown'}`,
      );
      this.webhookService.sendEvent('contact_changed', args);
    });

    // Calls
    this.client.on('incoming_call', (...args) => {
      this.logger.debug('Incoming call');
      this.webhookService.sendEvent('incoming_call', args);
    });

    // Vote update (pour les polls)
    this.client.on('vote_update', (...args) => {
      this.logger.debug('Vote update');
      this.webhookService.sendEvent('vote_update', args);
    });

    // Code (pour l'authentification par code)
    this.client.on('code', (...args) => {
      this.logger.debug('Authentication code received');
      this.webhookService.sendEvent('code', args);
    });

    this.logger.log(`Listening to ${events.length} WhatsApp events`);
  }

  /**
   * Execute une méthode du client WhatsApp de manière générique
   */
  async executeMethod(method: string, parameters: any[] = []): Promise<any> {
    if (!this.client) {
      throw new Error('WhatsApp client is not initialized');
    }

    // Vérifier que la méthode existe sur le client
    if (typeof (this.client as any)[method] !== 'function') {
      throw new Error(`Method "${method}" does not exist on WhatsApp client`);
    }

    this.logger.debug(`Executing method: ${method} with params:`, parameters);

    try {
      return await (this.client as any)[method](...parameters);
    } catch (error) {
      this.logger.error(`Error executing method ${method}:`, error);
      throw error;
    }
  }

  /**
   * Retourne l'état actuel du client
   */
  getStatus() {
    return {
      isReady: this.isReady,
      hasQrCode: !!this.qrCode,
      state: this.client?.info || null,
    };
  }

  /**
   * Retourne le QR code actuel (si disponible)
   */
  getQrCode() {
    return this.qrCode;
  }

  /**
   * Détruit le client proprement
   */
  private async destroy() {
    if (this.client) {
      this.logger.log('Destroying WhatsApp client...');
      await this.client.destroy();
      this.isReady = false;
      this.qrCode = null;
    }
  }

  /**
   * Retourne l'instance du client (à utiliser avec précaution)
   */
  getClient(): Client {
    return this.client;
  }

  /**
   * Request pairing code for phone number authentication
   */
  async requestPairingCode(phoneNumber: string): Promise<string> {
    if (!this.client) {
      throw new Error('WhatsApp client is not initialized');
    }

    try {
      this.logger.log(
        `Requesting pairing code for phone number: ${phoneNumber}`,
      );
      const code = await this.client.requestPairingCode(
        phoneNumber.replace('+', ''),
      );
      this.logger.log(`Pairing code generated successfully`);
      return code;
    } catch (error) {
      this.logger.error('Error requesting pairing code:', error);
      throw error;
    }
  }

  /**
   * Get business profile
   * Note: Cette méthode n'est pas disponible dans l'API officielle wwebjs
   * Conservée pour compatibilité mais retourne un objet vide
   */
  async getBusinessProfile(): Promise<any> {
    this.logger.warn(
      'getBusinessProfile is not available in wwebjs API - returning empty object',
    );
    return {};
  }

  /**
   * Get catalog (products)
   */
  async getCatalog(): Promise<any> {
    if (!this.client) {
      throw new Error('WhatsApp client is not initialized');
    }

    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }

    try {
      this.logger.log('Fetching catalog...');
      // Get products catalog using the wid from client info
      const catalog = await (this.client as any).getProductCatalog(
        this.client.info.wid._serialized,
      );
      this.logger.log('Catalog retrieved successfully');
      return catalog;
    } catch (error) {
      this.logger.error('Error getting catalog:', error);
      throw error;
    }
  }

  /**
   * Get labels/tags
   */
  async getLabels(): Promise<any> {
    if (!this.client) {
      throw new Error('WhatsApp client is not initialized');
    }

    if (!this.isReady) {
      throw new Error('WhatsApp client is not ready');
    }

    try {
      this.logger.log('Fetching labels...');
      const labels = await this.client.getLabels();
      this.logger.log('Labels retrieved successfully');
      return labels;
    } catch (error) {
      this.logger.error('Error getting labels:', error);
      throw error;
    }
  }

  /**
   * Notify backend that WhatsApp is connected
   */
  private async notifyBackendConnected(): Promise<void> {
    try {
      this.logger.log(
        'Gathering WhatsApp connection information...',
        this.client.info,
      );

      // Get phone number and profile info
      // wid.user contient le numéro sans le '+', on l'ajoute
      const rawPhoneNumber = this.client.info?.wid?.user || '';
      const phoneNumber = rawPhoneNumber ? `+${rawPhoneNumber}` : '';
      let profile: any = {};
      const businessInfo: any = {};

      if (!phoneNumber) {
        this.logger.warn(
          'No phone number available yet, skipping notification',
        );
        return;
      }

      this.logger.log(`Phone number retrieved: ${phoneNumber}`);

      try {
        profile = {
          pushname: this.client.info?.pushname || '',
          platform: this.client.info?.platform || '',
        };
      } catch (error) {
        this.logger.warn('Could not fetch profile:', error);
      }

      // Note: getBusinessProfile n'existe pas dans wwebjs API
      // On garde businessInfo vide pour l'instant
      this.logger.debug(
        'Business profile info not available in current wwebjs version',
      );

      const connectionData = {
        phoneNumber,
        profile: {
          ...profile,
          ...businessInfo,
        },
      };

      // Send custom event "pairing_success" to agent webhooks with all info
      this.logger.log(
        `Sending pairing_success event to webhooks for ${phoneNumber}`,
      );
      await this.webhookService.sendEvent('pairing_success', connectionData);

      this.logger.log('Pairing success event sent to webhooks');
    } catch (error: any) {
      this.logger.error('Failed to notify of connection:', error.message);
      // Don't throw - this is not critical
    }
  }
}
