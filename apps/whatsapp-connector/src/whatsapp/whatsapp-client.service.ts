/* eslint-disable no-undef */
import * as fs from 'fs';

import { HttpService } from '@nestjs/axios';
import {
  NotFoundException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Wid } from 'node_modules/@wppconnect/wa-js/dist/whatsapp';
import { Client, LocalAuth } from 'whatsapp-web.js';

import {
  MessageHistoryResult,
  MessageHistoryService,
} from './services/message-history.service';
import { WebhookService } from './webhook.service';

@Injectable()
export class WhatsAppClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppClientService.name);
  private client: Client;
  private isReady = false;
  private qrCode: string | null = null;
  private connectedUserId: string | null = null;
  private wppInjected = false;
  private pageDebugListenersAttached = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly webhookService: WebhookService,
    private readonly httpService: HttpService,
    private readonly messageHistoryService: MessageHistoryService,
  ) {
    // Set reference in webhook service to avoid circular dependency
    this.webhookService.setWhatsAppClientService(this);
  }

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
        headless: false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--no-zygote',
          '--disable-web-security',
          // Désactiver CSP, CORS, et isolation pour permettre les fetch depuis les scripts
          '--disable-features=IsolateOrigins,site-per-process,ContentSecurityPolicy',
          '--disable-site-isolation-trials',
          '--disable-gpu',
        ],
        // @ts-ignore
        bypassCSP: true,
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
      this.logger.log(
        `🔐 QR Code received (length: ${qr?.length || 0}, args count: ${args.length})`,
      );
      // qrcodeTerminal.generate(qr, { small: true });

      // Envoyer tous les paramètres bruts au webhook
      this.logger.debug(
        `Sending QR event to webhook - args type: ${Array.isArray(args) ? 'array' : typeof args}, length: ${args.length}`,
      );
      this.ensureWPPInjected(false);
      this.webhookService.sendEvent('qr', args);
    });

    // Authenticated - événement déclenché lors du pairing réussi
    // Note: client.info n'est PAS encore disponible à ce stade
    this.client.on('authenticated', async () => {
      const timestamp = new Date().toISOString();
      this.logger.log(
        `[${timestamp}] ✅ WhatsApp client authenticated successfully`,
      );
      this.logger.log('⏳ Injecting WPP after authentication...');

      // Inject WPP immediately after authentication (important if 'ready' is not triggered)
      await this.ensureWPPInjected();
    });

    // Ready - traitement spécial pour le flag isReady
    // C'est ICI que client.info devient disponible
    this.client.on('ready', async (...args) => {
      const timestamp = new Date().toISOString();
      this.isReady = true;
      this.qrCode = null;
      this.logger.log(`[${timestamp}] ✅ WhatsApp client is ready!`, args);
      this.logger.log('📞 Attempting to inject WPP and retrieve user info...');

      // Inject WPP (will be skipped if already injected in 'authenticated' event)
      await this.ensureWPPInjected();
    });

    // Auth failure
    this.client.on('auth_failure', (...args) => {
      this.logger.error('Authentication failure:', args);
      this.webhookService.sendEvent('auth_failure', args);
    });

    // Disconnected - traitement spécial pour le flag isReady
    this.client.on('disconnected', (...args) => {
      this.isReady = false;
      this.connectedUserId = null;
      this.logger.warn('WhatsApp client disconnected:', args);
      this.webhookService.sendEvent('disconnected', args);
    });

    // Change state
    this.client.on('change_state', (...args) => {
      this.logger.log('State changed:', args);
      this.webhookService.sendEvent('change_state', args);
    });

    // Messages
    this.client.on('message', async (...args) => {
      const [message] = args;

      // Enrich message with proper chatId and contact labels
      try {
        // Get the real contactId (not @lid format)
        const contactId = (await message?.getContact())?.id?._serialized;

        // Add contactId to message object (generic way, like labels)
        // This ensures all events have access to the real contact ID
        (message as any).contactId = contactId;

        this.logger.debug(
          `Message from: ${message.from} | Real contactId: ${contactId}`,
        );

        // Get contact labels
        if (contactId && this.client.pupPage) {
          this.logger.debug(`Fetching labels for contact: ${contactId}`);

          // Use WPP API in browser context (the method that works)
          // const labels = await this.client.pupPage.evaluate(async (chatId) => {
          //   try {
          //     // Get the contact object which contains label IDs
          //     const contact = await window.WPP.contact.get(chatId);
          //     console.log('contact', contact);
          //
          //     if (!contact) {
          //       return [];
          //     }
          //
          //     const contactLabelIds = contact.attributes.labels || [];
          //
          //     console.log('contactLabelIds', contactLabelIds);
          //
          //     if (!contactLabelIds || contactLabelIds.length === 0) {
          //       return [];
          //     }
          //
          //     // Get all available labels
          //     const allLabels = await window.WPP.labels.getAllLabels();
          //
          //     // Filter to get only the labels assigned to this contact
          //     const contactLabels = allLabels.filter((label: any) =>
          //       contactLabelIds.includes(label.id),
          //     );
          //
          //     console.log('contactLabels', contactLabels);
          //
          //     // Return the label objects
          //     return contactLabels.map((l: any) => ({
          //       id: l.id,
          //       name: l.name,
          //       hexColor: l.hexColor,
          //     }));
          //   } catch (err) {
          //     console.error(`Error fetching labels for ${chatId}:`, err);
          //     return [];
          //   }
          // }, contactId);
          //
          // // Enrich the message object with labels
          const labels = await this.client.getChatLabels(contactId);
          if (labels && labels.length > 0) {
            (message as any).contactLabels = labels;
            this.logger.log(
              `✅ Contact ${contactId} has ${labels.length} label(s): ${labels.map((l) => l.name).join(', ')}`,
            );
          } else {
            this.logger.debug(`Contact ${contactId} has no labels`);
          }
        } else {
          if (!contactId) {
            this.logger.warn('No contactId found in message');
          }
          if (!this.client.pupPage) {
            this.logger.warn('pupPage not available');
          }
        }

        // Get message history for context
        // Fetch recent messages to provide conversation context to the agent
        let messageHistory: MessageHistoryResult | null = null;
        try {
          if (this.isReady && this.client.pupPage) {
            const chatId = message.from; // Use @lid format for WPP API
            this.logger.log(
              `🔍 [CONNECTOR] Fetching history for chatId: ${chatId}`,
            );

            messageHistory = await this.messageHistoryService.getMessageHistory(
              this.client.pupPage,
              chatId,
              20,
            );

            if (messageHistory) {
              this.logger.log(
                `✅ [CONNECTOR] Retrieved ${messageHistory.totalFetched} messages (${messageHistory.hostMessageCount} from host, ${messageHistory.ourMessageCount} from us)`,
              );
              this.logger.log(
                `📋 [CONNECTOR] First message preview: ${messageHistory.messages[0]?.body?.substring(0, 50) || 'N/A'}`,
              );
            } else {
              this.logger.warn(
                `⚠️ [CONNECTOR] messageHistory is null after fetch`,
              );
            }
          } else {
            this.logger.warn(
              `⚠️ [CONNECTOR] Cannot fetch history - isReady: ${this.isReady}, pupPage: ${!!this.client.pupPage}`,
            );
          }
        } catch (error: any) {
          this.logger.error(
            `❌ [CONNECTOR] Failed to get message history: ${error.message}`,
          );
          this.logger.error(`Stack: ${error.stack}`);
          // Continue even if history retrieval fails
        }

        // Add message history to the message object
        if (messageHistory) {
          (message as any).messageHistory = messageHistory;
          this.logger.log(
            `✅ [CONNECTOR] Added ${messageHistory.messages.length} messages to message object`,
          );
        } else {
          this.logger.warn(`⚠️ [CONNECTOR] No history to add to message`);
        }

        // Enrich quoted message explicitly so webhook payload is stable
        const formatQuotedMessage = (quoted: any, quotedKey?: any) => {
          const formatted: any = {
            id:
              quoted?.id?._serialized ||
              quoted?.id ||
              quotedKey?._serialized ||
              undefined,
            from:
              quoted?.from?._serialized ||
              quoted?.from ||
              quotedKey?.remote ||
              undefined,
            fromMe:
              typeof quoted?.fromMe === 'boolean'
                ? quoted.fromMe
                : typeof quotedKey?.fromMe === 'boolean'
                  ? quotedKey.fromMe
                  : false,
            timestamp: quoted?.timestamp || quoted?.t,
            type: quoted?.type,
            hasMedia: Boolean(quoted?.hasMedia),
          };

          if (quoted?.type === 'product') {
            formatted.productId = quoted?.productId;
            formatted.title = quoted?.title;
            formatted.description = quoted?.description;
          } else {
            formatted.body = quoted?.body || '';
          }

          return formatted;
        };

        const quotedMsgKey =
          (message as any)?.quotedMsgKey ||
          (message as any)?._data?.quotedMsgKey ||
          (message as any)?.__x_quotedMsgKey;

        const stanzaId =
          (message as any)?.quotedStanzaID ||
          (message as any)?._data?.quotedStanzaID ||
          (message as any)?.__x_quotedStanzaID ||
          quotedMsgKey?.id;

        if (stanzaId) {
          (message as any).quotedStanzaID = stanzaId;
        }

        const inlineQuoted =
          (message as any)?.quotedMsg ||
          (message as any)?.__x_quotedMsg ||
          (message as any)?._data?.quotedMsg;

        if (inlineQuoted) {
          const formattedQuoted = formatQuotedMessage(inlineQuoted, quotedMsgKey);
          if (!formattedQuoted.id && stanzaId) {
            formattedQuoted.id = stanzaId;
          }
          (message as any).quotedMsg = formattedQuoted;
          this.logger.debug(
            `✅ [CONNECTOR] Added inline quoted message for ${message.id?._serialized}`,
          );
        } else if (
          (message as any)?.hasQuotedMsg &&
          typeof (message as any)?.getQuotedMessage === 'function'
        ) {
          try {
            const fetchedQuoted = await (message as any).getQuotedMessage();
            if (fetchedQuoted) {
              const formattedQuoted = formatQuotedMessage(
                fetchedQuoted,
                quotedMsgKey,
              );
              if (!formattedQuoted.id && stanzaId) {
                formattedQuoted.id = stanzaId;
              }
              (message as any).quotedMsg = formattedQuoted;
              this.logger.debug(
                `✅ [CONNECTOR] Fetched quoted message for ${message.id?._serialized}`,
              );
            }
          } catch (error: any) {
            this.logger.warn(
              `⚠️ [CONNECTOR] Failed to fetch quoted message for ${message.id?._serialized}: ${error.message}`,
            );
          }
        } else if (quotedMsgKey) {
          (message as any).quotedMsg = {
            id: quotedMsgKey._serialized || stanzaId,
            from: quotedMsgKey.remote,
            fromMe: Boolean(quotedMsgKey.fromMe),
          };
          this.logger.debug(
            `✅ [CONNECTOR] Added quoted key fallback for ${message.id?._serialized}`,
          );
        }

        // Télécharger le média si présent et l'attacher au payload
        if (message.hasMedia) {
          try {
            const media = await message.downloadMedia(); // { data: base64, mimetype, filename }
            if (media) {
              (message as any).downloadedMedia = media;
              this.logger.log(
                `✅ [CONNECTOR] Media attached to message ${message.id?._serialized}`,
              );
            }
          } catch (err: any) {
            this.logger.error(
              `❌ [CONNECTOR] Failed to download media for ${message.id?._serialized}: ${err.message}`,
            );
          }
        }
      } catch (error) {
        this.logger.error(
          'Failed to enrich message:',
          error.message,
          error.stack,
        );
        // Continue even if enrichment fails
      }

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
    // this.client.on('code', (...args) => {
    //   this.logger.debug('Authentication code received');
    //   this.webhookService.sendEvent('code', args);
    // });

    this.logger.log(`Listening to ${events.length} WhatsApp events`);
  }

  /**
   * Ensure WPP (WhatsApp Web JS library) is injected in the page context
   * This method is idempotent - it will only inject WPP once
   * Call this in both 'authenticated' and 'ready' events to ensure WPP is available
   */
  private async ensureWPPInjected(sendBackEvent = true): Promise<void> {
    // Don't inject twice
    if (this.wppInjected && !sendBackEvent) {
      this.logger.debug('WPP already injected, skipping');
      return;
    }

    const page = this.client.pupPage;
    if (!page) {
      this.logger.warn('Puppeteer page not available, cannot inject WPP');
      return;
    }

    this.attachPageDebugListeners(page);

    try {
      // Check if WPP is already available in the page (in case it was injected elsewhere)
      const wppAlreadyExists = await page.evaluate(() => {
        return typeof window.WPP !== 'undefined';
      });

      if (wppAlreadyExists) {
        this.logger.log('WPP already exists in page context');
      } else {
        // Load and inject WPP script
        this.logger.log('Loading WPP script from @wppconnect/wa-js...');
        const wppScriptPath = require.resolve('@wppconnect/wa-js');
        const wppScript = fs.readFileSync(wppScriptPath, 'utf8');

        this.logger.log('Injecting WPP script into page context...');
        await page.evaluate(wppScript);

        this.logger.log('WPP script injected, waiting for WPP.isReady...');
        // Wait for WPP to be ready
        await page.waitForFunction(() => window.WPP?.isReady, {
          timeout: 15000,
        });

        this.logger.log('✅ WPP is ready and available');

        // Expose nodeFetch to bypass CSP
        await this.exposeNodeFetchToPage(page);
        this.logger.log('nodeFetch exposed to browser context');

        this.wppInjected = true;
      }

      if (!sendBackEvent) {
        return;
      }
      // Get authentication status and user ID
      const isAuthenticated = await page.evaluate(() =>
        window.WPP.conn.isAuthenticated(),
      );
      const id = await page.evaluate(() => window.WPP.conn?.getMyUserId());

      this.logger.log(
        `WPP injected - isAuthenticated: ${isAuthenticated}, userID: ${id}`,
      );

      // If authenticated, store user ID and notify backend
      if (isAuthenticated && id) {
        this.connectedUserId = id._serialized;
        this.logger.log(`Connected user ID: ${id}`);
        const profile = await page.evaluate(() => {
          return {
            pushname: window.WPP.profile.getMyProfileName(),
            platform: window.WPP.conn.getPlatform(),
          };
        });

        await this.notifyBackendConnected(id, profile);
      }
    } catch (error) {
      this.logger.error('Error injecting WPP script:', error);
      this.logger.error('Error details:', error.stack);
      this.wppInjected = false;
    }
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
   * Execute JavaScript code in the WhatsApp Web page context
   */
  async executePageScript(script: string): Promise<any> {
    if (!this.client) {
      throw new Error('WhatsApp client is not initialized');
    }
    //
    // if (!this.isReady) {
    //   throw new Error('WhatsApp client is not ready yet - WPP not injected');
    // }

    const page = this.client.pupPage;
    if (!page) {
      throw new Error('Puppeteer page is not available');
    }

    this.attachPageDebugListeners(page);

    this.logger.debug('Executing page script in browser context');

    try {
      // Verify WPP is available before executing script
      const wppAvailable = await page.evaluate(() => {
        return typeof window.WPP !== 'undefined' && window.WPP?.isReady;
      });

      if (!wppAvailable) {
        await this.ensureWPPInjected(false);
      }

      // Execute the script in the page context
      console.log('script', script);
      return await page.evaluate(script);
    } catch (error) {
      this.logger.error('Error executing page script:', error);
      throw error;
    }
  }

  async getContactById(contactId: string): Promise<{
    id: string;
    number?: string;
    name?: string;
    pushname?: string;
    shortName?: string;
    formattedName?: string;
    isMyContact?: boolean;
    isWAContact?: boolean;
    isUser?: boolean;
  }> {
    if (!contactId) {
      throw new NotFoundException('contactId is required');
    }

    const page = this.client?.pupPage;
    if (!page) {
      throw new NotFoundException('Puppeteer page is not available');
    }

    await this.ensureWPPInjected(false);

    const contact = await page.evaluate(async (targetContactId: string) => {
      const resolved = (await window.WPP.contact.get(targetContactId)) as any;

      if (!resolved) {
        return null;
      }

      const resolvedId =
        typeof resolved.id === 'string'
          ? resolved.id
          : resolved.id?._serialized || resolved.attributes?.id?._serialized || '';

      return {
        id: resolvedId,
        number:
          resolved.phoneNumber ||
          resolved.id?.user ||
          resolved.attributes?.id?.user ||
          '',
        name: resolved.name || resolved.formattedName || resolved.pushname || '',
        pushname: resolved.pushname || '',
        shortName: resolved.shortName || '',
        formattedName: resolved.formattedName || '',
        isMyContact: Boolean(resolved.isMyContact),
        isWAContact: Boolean(resolved.isWAContact),
        isUser: Boolean(resolved.isUser),
      };
    }, contactId);

    if (!contact) {
      throw new NotFoundException(`Contact ${contactId} not found`);
    }

    return contact;
  }

  private attachPageDebugListeners(page: any) {
    if (this.pageDebugListenersAttached) {
      return;
    }

    page.on('console', (message: any) => {
      const text = message?.text?.() || '';

      if (!text.includes('[status/sendStatus]')) {
        return;
      }

      const type = message?.type?.() || 'log';
      const formattedMessage = `[PAGE:${type}] ${text}`;

      if (type === 'error') {
        this.logger.error(formattedMessage);
        return;
      }

      if (type === 'warning') {
        this.logger.warn(formattedMessage);
        return;
      }

      this.logger.log(formattedMessage);
    });

    page.on('pageerror', (error: Error) => {
      const message = error?.message || '';

      if (!message.includes('[status/sendStatus]')) {
        return;
      }

      this.logger.error(`[PAGE:error] ${message}`, error?.stack);
    });

    this.pageDebugListenersAttached = true;
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
   * Expose une fonction fetch côté Node.js au contexte du navigateur
   * Cela permet de contourner la CSP qui bloque fetch depuis le navigateur
   */
  private async exposeNodeFetchToPage(page: any) {
    // Exposer la fonction de base
    await page.exposeFunction(
      '__nodeFetch',
      async (url: string, options: any = {}) => {
        this.logger.debug(`[nodeFetch] ${options.method || 'GET'} ${url}`);

        try {
          // Convertir les options fetch en options axios
          const axiosConfig: any = {
            url,
            method: options.method || 'GET',
            headers: options.headers || {},
          };

          if (options.responseType) {
            axiosConfig.responseType = options.responseType;
          }

          // Gérer le body
          if (options.body) {
            if (typeof options.body === 'string') {
              axiosConfig.data = JSON.parse(options.body);
            } else {
              axiosConfig.data = options.body;
            }
          }

          // Faire la requête avec axios (côté Node.js, pas de CSP!)
          const response = await this.httpService.axiosRef.request(axiosConfig);
          const isBinaryResponse = options.responseType === 'arraybuffer';
          const serializedData = isBinaryResponse
            ? Buffer.from(response.data).toString('base64')
            : response.data;

          // Retourner une réponse simple (pas de fonctions, elles ne peuvent pas être sérialisées)
          return {
            ok: response.status >= 200 && response.status < 300,
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            data: serializedData,
            responseType: isBinaryResponse ? 'base64' : 'default',
          };
        } catch (error: any) {
          this.logger.error(`[nodeFetch] Error: ${error.message}`, error.stack);

          // Retourner une erreur
          return {
            ok: false,
            status: error.response?.status || 500,
            statusText: error.response?.statusText || 'Internal Server Error',
            headers: error.response?.headers || {},
            data: error.response?.data || { error: error.message },
            responseType: 'default',
          };
        }
      },
    );

    // Injecter un wrapper dans le navigateur qui simule l'API fetch
    await page.evaluate(() => {
      // @ts-ignore - Ces propriétés sont ajoutées dynamiquement
      window.nodeFetch = async (url: string, options: any) => {
        // @ts-ignore
        const response = await window.__nodeFetch(url, options);
        // Ajouter la méthode json() qui retourne les données
        return {
          ...response,
          json: async () => response.data,
          text: async () =>
            typeof response.data === 'string'
              ? response.data
              : JSON.stringify(response.data),
        };
      };
    });
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
   * Restart the WhatsApp client to force a new QR code generation
   * This is useful when the QR code expires and needs to be refreshed
   */
  async restartClient(): Promise<void> {
    this.logger.log('🔄 Restarting WhatsApp client to generate new QR code...');

    try {
      // Destroy the current client
      await this.destroy();

      // Wait a bit to ensure cleanup is complete
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Re-initialize the client (will trigger new QR code generation)
      await this.initialize();

      this.logger.log(
        '✅ WhatsApp client restarted successfully, new QR code will be emitted via webhook',
      );
    } catch (error) {
      this.logger.error('❌ Failed to restart WhatsApp client:', error);
      throw new Error('Failed to restart WhatsApp client');
    }
  }

  /**
   * Clean authentication data and restart the client from scratch
   * This method removes .wwebjs_cache and data directories to ensure a fresh start
   * Should ONLY be called when initiating a new authentication (NOT during polling)
   */
  async cleanAndRestartClient(): Promise<void> {
    this.logger.log('🧹 Cleaning WhatsApp client data and restarting...');

    try {
      // First, destroy the current client
      await this.destroy();

      // Wait a bit to ensure cleanup is complete
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Remove .wwebjs_cache directory
      const wwebjsCachePath = './.wwebjs_cache';
      if (fs.existsSync(wwebjsCachePath)) {
        this.logger.log(`Removing ${wwebjsCachePath} directory...`);
        fs.rmSync(wwebjsCachePath, { recursive: true, force: true });
        this.logger.log(`✅ ${wwebjsCachePath} removed`);
      }

      // Remove data directory
      const dataPath = './data';
      if (fs.existsSync(dataPath)) {
        this.logger.log(`Removing ${dataPath} directory...`);
        fs.rmSync(dataPath, { recursive: true, force: true });
        this.logger.log(`✅ ${dataPath} removed`);
      }

      // Reset WPP injection flag
      this.wppInjected = false;

      // Wait a bit before re-initializing
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Re-initialize the client (will trigger new QR code generation)
      await this.initialize();

      this.logger.log(
        '✅ WhatsApp client cleaned and restarted successfully, ready for fresh authentication',
      );
    } catch (error) {
      this.logger.error(
        '❌ Failed to clean and restart WhatsApp client:',
        error,
      );
      throw new Error('Failed to clean and restart WhatsApp client');
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

      // await this.client.destroy();
      //
      // await sleep(10000);
      //
      // await this.initialize(phoneNumber);

      const code = await this.client.requestPairingCode(
        phoneNumber.replace('+', ''),
      );
      this.logger.log(`Pairing code generated successfully`);
      return code;
    } catch (error) {
      this.logger.error('Error requesting pairing code:', error);
      // Si le pairing code échoue (limite WhatsApp atteinte), on suggère d'utiliser le QR code
      throw new Error(
        'La demande de code de jumelage a échoué. WhatsApp a une limite stricte sur cette fonctionnalité. Si vous êtes sur mobile, veuillez vous connecter depuis un ordinateur ou une tablette pour scanner le code QR.',
      );
    }
  }

  /**
   * Notify backend that WhatsApp is connected
   */
  private async notifyBackendConnected(
    id: Wid,
    profile: {
      pushname: string;
      platform: any;
    },
  ): Promise<void> {
    try {
      this.logger.log('Gathering WhatsApp connection information...');

      // Get phone number and profile info
      // wid.user contient le numéro sans le '+', on l'ajoute
      const rawPhoneNumber = id.user || '';
      const phoneNumber = rawPhoneNumber ? `+${rawPhoneNumber}` : '';

      if (!phoneNumber) {
        this.logger.warn(
          'No phone number available yet, skipping notification',
        );
        return;
      }

      this.logger.log(`Phone number retrieved: ${phoneNumber}`);

      const connectionData = {
        phoneNumber,
        profile: profile,
        id: id.user,
      };

      // Send custom event "pairing_success" to agent webhooks with all info
      this.logger.log(
        `🎉 Sending pairing_success event to webhooks for ${phoneNumber}`,
      );
      this.logger.debug(`Connection data: ${JSON.stringify(connectionData)}`);
      await this.webhookService.sendEvent('pairing_success', connectionData);

      this.logger.log('✅ Pairing success event sent to webhooks successfully');
    } catch (error: any) {
      this.logger.error('Failed to notify of connection:', error.message);
      // Don't throw - this is not critical
    }
  }

  /**
   * Get the connected user ID (WhatsApp account ID)
   */
  getConnectedUserId(): string | null {
    return this.connectedUserId;
  }
}
