import { ConnectorClientService } from '@app/connector-client/connector-client.service';
import {
  PageScriptService,
  ScriptVariables,
} from '@app/page-scripts/page-script.service';
import { PrismaService } from '@app/prisma/prisma.service';
import { WhatsAppAgentService } from '@app/whatsapp-agent/whatsapp-agent.service';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

/**
 * Type for script execution results
 */
type ScriptExecutionResult = unknown;

/**
 * Service providing wa-js tools for the AI agent
 * Executes scripts on the user's WhatsApp connector
 */
@Injectable()
export class WaJsToolsService {
  private readonly logger = new Logger(WaJsToolsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pageScriptService: PageScriptService,
    private readonly connectorClientService: ConnectorClientService,
    private readonly whatsappAgentService: WhatsAppAgentService,
  ) {}

  /**
   * Execute a wa-js script on the user's connector
   */
  private async executeScript(
    userId: string,
    scriptPath: string,
    variables: ScriptVariables = {},
  ): Promise<ScriptExecutionResult> {
    const agent = await this.prisma.whatsAppAgent.findFirst({
      where: { userId },
    });

    if (!agent) {
      throw new Error('WhatsApp agent not found for user');
    }

    // Get connector URL
    const connectorUrl = await this.whatsappAgentService.getConnectorUrl(agent);

    // Generate script with variables
    const script = this.pageScriptService.getScript(scriptPath, variables);

    // Execute on connector
    return await this.connectorClientService.executeScript(
      connectorUrl,
      script,
    );
  }

  /**
   * Create all wa-js tools for a user
   */
  createTools(userId: string): DynamicStructuredTool[] {
    return [
      // Labels tools
      ...this.createLabelTools(userId),
      // Chat tools
      ...this.createChatTools(userId),
      // Contact tools
      ...this.createContactTools(userId),
      // Group tools
      ...this.createGroupTools(userId),
      // Profile tools
      ...this.createProfileTools(userId),
      // Catalog tools
      ...this.createCatalogTools(userId),
    ];
  }

  // ========== LABELS TOOLS ==========

  private createLabelTools(userId: string): DynamicStructuredTool[] {
    return [
      new DynamicStructuredTool({
        name: 'getAllLabels',
        description: 'Récupérer tous les labels WhatsApp',
        schema: z.object({}),
        func: async () => {
          const result = await this.executeScript(
            userId,
            'labels/getAllLabels',
          );
          return JSON.stringify(result);
        },
      }),

      new DynamicStructuredTool({
        name: 'addNewLabel',
        description: 'Créer un nouveau label WhatsApp',
        schema: z.object({
          name: z.string().describe('Nom du label'),
          color: z.string().optional().describe('Couleur hex (ex: #4CAF50)'),
        }),
        func: async ({ name, color }) => {
          const result = await this.executeScript(
            userId,
            'labels/addNewLabel',
            {
              LABEL_NAME: name,
              LABEL_COLOR: color || '#4CAF50',
            },
          );
          return JSON.stringify(result);
        },
      }),

      new DynamicStructuredTool({
        name: 'editLabel',
        description: 'Modifier un label existant',
        schema: z.object({
          labelId: z.string().describe('ID du label'),
          name: z.string().describe('Nouveau nom'),
          color: z.string().optional().describe('Nouvelle couleur hex'),
        }),
        func: async ({ labelId, name, color }) => {
          const result = await this.executeScript(userId, 'labels/editLabel', {
            LABEL_ID: labelId,
            LABEL_NAME: name,
            LABEL_COLOR: color || '',
          });
          return JSON.stringify(result);
        },
      }),

      new DynamicStructuredTool({
        name: 'deleteLabel',
        description: 'Supprimer un label',
        schema: z.object({
          labelId: z.string().describe('ID du label à supprimer'),
        }),
        func: async ({ labelId }) => {
          const result = await this.executeScript(
            userId,
            'labels/deleteLabel',
            {
              LABEL_ID: labelId,
            },
          );
          return JSON.stringify(result);
        },
      }),

      new DynamicStructuredTool({
        name: 'addOrRemoveLabels',
        description: "Ajouter ou retirer des labels d'une conversation",
        schema: z.object({
          chatId: z.string().describe('ID de la conversation'),
          labelIds: z.array(z.string()).describe('IDs des labels'),
          action: z.enum(['add', 'remove']).describe('Action à effectuer'),
        }),
        func: async ({ chatId, labelIds, action }) => {
          const result = await this.executeScript(
            userId,
            'labels/addOrRemoveLabels',
            {
              CHAT_ID: chatId,
              LABEL_IDS: JSON.stringify(labelIds),
              ACTION: action,
            },
          );
          return JSON.stringify(result);
        },
      }),
    ];
  }

  // ========== CHAT TOOLS ==========

  private createChatTools(userId: string): DynamicStructuredTool[] {
    return [
      new DynamicStructuredTool({
        name: 'getMessages',
        description: "Lire les messages d'une conversation",
        schema: z.object({
          chatId: z.string().describe('ID de la conversation'),
          limit: z.number().optional().describe('Nombre de messages'),
        }),
        func: async ({ chatId, limit }) => {
          const result = await this.executeScript(userId, 'chat/getMessages', {
            CHAT_ID: chatId,
            LIMIT: String(limit || 20),
          });
          return JSON.stringify(result);
        },
      }),

      new DynamicStructuredTool({
        name: 'markIsRead',
        description: 'Marquer une conversation comme lue',
        schema: z.object({
          chatId: z.string().describe('ID de la conversation'),
        }),
        func: async ({ chatId }) => {
          const result = await this.executeScript(userId, 'chat/markIsRead', {
            CHAT_ID: chatId,
          });
          return JSON.stringify(result);
        },
      }),
    ];
  }

  // ========== CONTACT TOOLS ==========

  private createContactTools(userId: string): DynamicStructuredTool[] {
    return [
      new DynamicStructuredTool({
        name: 'getContact',
        description: "Obtenir les informations d'un contact",
        schema: z.object({
          contactId: z.string().describe('ID du contact'),
        }),
        func: async ({ contactId }) => {
          const result = await this.executeScript(
            userId,
            'contact/getContact',
            {
              CONTACT_ID: contactId,
            },
          );
          return JSON.stringify(result);
        },
      }),

      new DynamicStructuredTool({
        name: 'getContactList',
        description:
          'Obtenir la liste des contacts (max 10). Filtres disponibles: onlyMyContacts, withLabels, name (recherche par nom)',
        schema: z.object({
          onlyMyContacts: z
            .boolean()
            .optional()
            .describe('Uniquement mes contacts (défaut: true)'),
          withLabels: z
            .array(z.string())
            .optional()
            .describe('Filtrer par labels (noms ou IDs)'),
          name: z.string().optional().describe('Rechercher un contact par nom'),
          limit: z
            .number()
            .optional()
            .describe('Nombre max de résultats (max 10, défaut: 10)'),
        }),
        func: async ({ onlyMyContacts, withLabels, name, limit }) => {
          const result = await this.executeScript(
            userId,
            'contact/getContactList',
            {
              ONLY_MY_CONTACTS:
                onlyMyContacts !== undefined ? String(onlyMyContacts) : 'true',
              WITH_LABELS: withLabels ? JSON.stringify(withLabels) : '',
              NAME: name || '',
              LIMIT: String(limit || 10),
            },
          );
          return JSON.stringify(result);
        },
      }),

      new DynamicStructuredTool({
        name: 'queryContactExists',
        description: 'Vérifier si un numéro existe sur WhatsApp',
        schema: z.object({
          phoneNumber: z.string().describe('Numéro de téléphone'),
        }),
        func: async ({ phoneNumber }) => {
          const result = await this.executeScript(
            userId,
            'contact/queryContactExists',
            { PHONE_NUMBER: phoneNumber },
          );
          return JSON.stringify(result);
        },
      }),
    ];
  }

  // ========== GROUP TOOLS ==========

  private createGroupTools(userId: string): DynamicStructuredTool[] {
    return [
      new DynamicStructuredTool({
        name: 'getAllGroups',
        description: 'Récupérer tous les groupes WhatsApp',
        schema: z.object({}),
        func: async () => {
          const result = await this.executeScript(userId, 'group/getAllGroups');
          return JSON.stringify(result);
        },
      }),

      new DynamicStructuredTool({
        name: 'createGroup',
        description: 'Créer un nouveau groupe WhatsApp',
        schema: z.object({
          name: z.string().describe('Nom du groupe'),
          participants: z
            .array(z.string())
            .describe('Numéros des participants'),
        }),
        func: async ({ name, participants }) => {
          const result = await this.executeScript(userId, 'group/createGroup', {
            GROUP_NAME: name,
            PARTICIPANTS: JSON.stringify(participants),
          });
          return JSON.stringify(result);
        },
      }),
    ];
  }

  // ========== PROFILE TOOLS ==========

  private createProfileTools(userId: string): DynamicStructuredTool[] {
    return [
      new DynamicStructuredTool({
        name: 'getMyProfileName',
        description: 'Obtenir le nom du profil WhatsApp',
        schema: z.object({}),
        func: async () => {
          const result = await this.executeScript(
            userId,
            'profile/getMyProfileName',
          );
          return JSON.stringify(result);
        },
      }),

      new DynamicStructuredTool({
        name: 'setMyProfileName',
        description: 'Modifier le nom du profil WhatsApp',
        schema: z.object({
          name: z.string().describe('Nouveau nom'),
        }),
        func: async ({ name }) => {
          const result = await this.executeScript(
            userId,
            'profile/setMyProfileName',
            { PROFILE_NAME: name },
          );
          return JSON.stringify(result);
        },
      }),
    ];
  }

  // ========== CATALOG TOOLS ==========

  private createCatalogTools(userId: string): DynamicStructuredTool[] {
    return [
      new DynamicStructuredTool({
        name: 'getCollections',
        description: 'Récupérer toutes les collections du catalogue WhatsApp',
        schema: z.object({}),
        func: async () => {
          const result = await this.executeScript(
            userId,
            'catalog/getCollections',
          );
          return JSON.stringify(result);
        },
      }),

      new DynamicStructuredTool({
        name: 'getProductsFromCollection',
        description: "Récupérer les produits d'une collection spécifique",
        schema: z.object({
          collectionId: z.string().describe('ID de la collection'),
        }),
        func: async ({ collectionId }) => {
          const result = await this.executeScript(
            userId,
            'catalog/getProductsFromCollection',
            {
              COLLECTION_ID: collectionId,
            },
          );
          return JSON.stringify(result);
        },
      }),

      new DynamicStructuredTool({
        name: 'setProductVisibility',
        description: 'Afficher ou masquer un produit',
        schema: z.object({
          productId: z.string().describe('ID du produit'),
          visible: z.boolean().describe('Visible ou non'),
        }),
        func: async ({ productId, visible }) => {
          const result = await this.executeScript(
            userId,
            'catalog/setProductVisibility',
            {
              PRODUCT_ID: productId,
              VISIBLE: String(visible),
            },
          );
          return JSON.stringify(result);
        },
      }),
    ];
  }
}
