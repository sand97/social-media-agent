import { ConnectorClientService } from '@app/connector/connector-client.service';
import { PageScriptService } from '@app/page-scripts/page-script.service';
import { tool } from '@langchain/core/tools';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

/**
 * Chat tools for the WhatsApp agent
 * Provides comprehensive messaging and chat management capabilities
 */
@Injectable()
export class ChatTools {
  constructor(
    private readonly connectorClient: ConnectorClientService,
    private readonly scriptService: PageScriptService,
  ) {}

  /**
   * Create all chat tools
   */
  createTools() {
    return [
      this.createSendTextMessageTool(),
      this.createSendReactionTool(),
      this.createSendLocationTool(),
      this.createEditMessageTool(),
      this.createMarkIsReadTool(),
      this.createMarkIsUnreadTool(),
      this.createSetNotesTool(),
      this.createSendScheduledCallTool(),
      this.createGetQuotedMessageTool(),
      this.createMarkIsComposingTool(),
    ];
  }

  /**
   * Send text message with natural typing simulation
   */
  private createSendTextMessageTool() {
    return tool(
      async ({ to, message, useTyping }, config?: any) => {
        try {
          const script = this.scriptService.getScript('chat/sendTextMessage', {
            TO: to,
            MESSAGE: message,
            USE_TYPING: String(useTyping !== false),
          });

          const result = await this.connectorClient.executeScript(script);

          return JSON.stringify(result);
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'send_text_message',
        description:
          'Envoyer un message texte avec simulation de frappe naturelle. L\'agent montrera "en train d\'écrire..." pendant un délai calculé (80 WPM). Parfait pour des conversations naturelles.',
        schema: z.object({
          to: z
            .string()
            .describe(
              'ID du destinataire (numéro ou ID complet avec @c.us). Ex: "33765538022" ou "33765538022@c.us"',
            ),
          message: z.string().describe('Contenu du message texte'),
          useTyping: z
            .boolean()
            .optional()
            .default(true)
            .describe(
              'Activer la simulation de frappe (défaut: true). Désactiver pour messages urgents.',
            ),
        }),
      },
    );
  }

  /**
   * Send reaction to a message
   */
  private createSendReactionTool() {
    return tool(
      async ({ messageId, reaction }, config?: any) => {
        try {
          const script = this.scriptService.getScript('chat/sendReaction', {
            MESSAGE_ID: messageId,
            REACTION: reaction,
          });

          const result = await this.connectorClient.executeScript(script);

          return JSON.stringify(result);
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'send_reaction',
        description:
          'Envoyer une réaction emoji à un message. Utile pour donner un feedback rapide sans interrompre la conversation. Mettre "false" pour retirer une réaction.',
        schema: z.object({
          messageId: z
            .string()
            .describe('ID du message à réagir (format: true_xxxxx@c.us_yyyy)'),
          reaction: z
            .string()
            .describe(
              'Emoji de réaction (👍, ❤️, 😊, etc.) ou "false" pour retirer la réaction',
            ),
        }),
      },
    );
  }

  /**
   * Send location message
   */
  private createSendLocationTool() {
    return tool(
      async ({ to, lat, lng, name, address, url }, config?: any) => {
        try {
          const script = this.scriptService.getScript('chat/sendLocation', {
            TO: to,
            LAT: String(lat),
            LNG: String(lng),
            NAME: name || '',
            ADDRESS: address || '',
            URL: url || '',
          });

          const result = await this.connectorClient.executeScript(script);

          return JSON.stringify(result);
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'send_location',
        description:
          "Envoyer une localisation géographique. Parfait pour partager l'adresse du magasin, points de retrait, lieux de livraison, etc.",
        schema: z.object({
          to: z.string().describe('ID du destinataire (numéro ou avec @c.us)'),
          lat: z.number().describe('Latitude (ex: 48.8566 pour Paris)'),
          lng: z.number().describe('Longitude (ex: 2.3522 pour Paris)'),
          name: z
            .string()
            .optional()
            .describe('Nom du lieu (ex: "Notre Magasin Paris")'),
          address: z
            .string()
            .optional()
            .describe(
              'Adresse complète (ex: "123 rue de la Paix, 75001 Paris")',
            ),
          url: z
            .string()
            .optional()
            .describe('URL associée (ex: lien Google Maps)'),
        }),
      },
    );
  }

  /**
   * Edit a previously sent message
   */
  private createEditMessageTool() {
    return tool(
      async ({ messageId, newText, linkPreview }, config?: any) => {
        try {
          const script = this.scriptService.getScript('chat/editMessage', {
            MESSAGE_ID: messageId,
            NEW_TEXT: newText,
            LINK_PREVIEW: String(linkPreview !== false),
          });

          const result = await this.connectorClient.executeScript(script);

          return JSON.stringify(result);
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'edit_message',
        description:
          'Modifier un message précédemment envoyé. Utile pour corriger des erreurs ou mettre à jour des informations.',
        schema: z.object({
          messageId: z
            .string()
            .describe(
              'ID du message à modifier (format: true_xxxxx@c.us_yyyy)',
            ),
          newText: z.string().describe('Nouveau contenu du message'),
          linkPreview: z
            .boolean()
            .optional()
            .default(true)
            .describe('Activer la prévisualisation de liens'),
        }),
      },
    );
  }

  /**
   * Mark chat as unread
   */
  private createMarkIsUnreadTool() {
    return tool(
      async ({ chatId }, config?: any) => {
        try {
          const script = this.scriptService.getScript('chat/markIsUnread', {
            CHAT_ID: chatId,
          });

          const result = await this.connectorClient.executeScript(script);

          return JSON.stringify(result);
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'mark_unread',
        description:
          'Marquer une conversation comme non lue. Utile pour flagger les conversations qui nécessitent une intervention humaine ou un suivi ultérieur.',
        schema: z.object({
          chatId: z.string().describe('ID de la conversation à marquer'),
        }),
      },
    );
  }

  /**
   * Set internal notes for a chat
   */
  private createSetNotesTool() {
    return tool(
      async ({ chatId, content }, config?: any) => {
        try {
          const script = this.scriptService.getScript('chat/setNotes', {
            CHAT_ID: chatId,
            CONTENT: content,
          });

          const result = await this.connectorClient.executeScript(script);

          return JSON.stringify(result);
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'set_notes',
        description:
          "Définir des notes internes pour une conversation (mémoire de l'agent). IMPORTANT: Nécessite un compte WhatsApp Business. Utile pour stocker préférences clients, historique, contexte.",
        schema: z.object({
          chatId: z.string().describe('ID de la conversation'),
          content: z
            .string()
            .describe(
              'Contenu des notes (préférences, historique, contexte, etc.)',
            ),
        }),
      },
    );
  }

  /**
   * Send scheduled call message
   */
  private createSendScheduledCallTool() {
    return tool(
      async (
        { to, title, description, callType, timestampMs },
        config?: any,
      ) => {
        try {
          const script = this.scriptService.getScript(
            'chat/sendScheduledCall',
            {
              TO: to,
              TITLE: title,
              DESCRIPTION: description || '',
              CALL_TYPE: callType || 'voice',
              TIMESTAMP_MS: String(timestampMs),
            },
          );

          const result = await this.connectorClient.executeScript(script);

          return JSON.stringify(result);
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'send_scheduled_call',
        description:
          'Envoyer une invitation pour un appel planifié. Parfait pour prendre des RDV automatiquement, consultations, support téléphonique.',
        schema: z.object({
          to: z.string().describe('ID du destinataire'),
          title: z
            .string()
            .describe('Titre de l\'appel (ex: "Consultation Support")'),
          description: z.string().optional().describe("Description de l'appel"),
          callType: z
            .enum(['voice', 'video'])
            .optional()
            .default('voice')
            .describe("Type d'appel: voice ou video"),
          timestampMs: z
            .number()
            .describe(
              "Timestamp de l'appel en millisecondes depuis epoch (Date.now())",
            ),
        }),
      },
    );
  }

  /**
   * Get quoted message
   */
  private createGetQuotedMessageTool() {
    return tool(
      async ({ messageId }, config?: any) => {
        try {
          const script = this.scriptService.getScript('chat/getQuotedMessage', {
            MESSAGE_ID: messageId,
          });

          const result = await this.connectorClient.executeScript(script);

          return JSON.stringify(result);
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'get_quoted_message',
        description:
          'Récupérer le message cité/répondu dans une conversation. Utile pour comprendre le contexte des réponses.',
        schema: z.object({
          messageId: z
            .string()
            .describe('ID du message qui contient une citation'),
        }),
      },
    );
  }

  /**
   * Mark chat as read
   */
  private createMarkIsReadTool() {
    return tool(
      async ({ chatId }, config?: any) => {
        try {
          const script = this.scriptService.getScript('chat/markIsRead', {
            CHAT_ID: chatId,
          });

          const result = await this.connectorClient.executeScript(script);

          return JSON.stringify(result);
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'mark_read',
        description:
          "Marquer une conversation comme lue et envoyer l'événement SEEN. Utile après avoir traité des messages pour indiquer qu'ils ont été lus.",
        schema: z.object({
          chatId: z
            .string()
            .describe('ID de la conversation à marquer comme lue'),
        }),
      },
    );
  }

  /**
   * Mark as composing (typing indicator)
   */
  private createMarkIsComposingTool() {
    return tool(
      async ({ chatId, duration }, config?: any) => {
        try {
          const script = this.scriptService.getScript('chat/markIsComposing', {
            CHAT_ID: chatId,
            DURATION: String(duration || 2000),
          });

          const result = await this.connectorClient.executeScript(script);

          return JSON.stringify(result);
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'mark_composing',
        description:
          "Afficher l'indicateur \"en train d'écrire...\" dans une conversation. Utile pour rendre l'agent plus humain et naturel. Note: send_text_message le fait automatiquement.",
        schema: z.object({
          chatId: z.string().describe('ID de la conversation'),
          duration: z
            .number()
            .optional()
            .default(2000)
            .describe('Durée en millisecondes (défaut: 2000ms)'),
        }),
      },
    );
  }
}
