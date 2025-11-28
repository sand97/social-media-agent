import { ConnectorClientService } from '@app/connector-client/connector-client.service';
import {
  PageScriptService,
  ScriptVariables,
} from '@app/page-scripts/page-script.service';
import { PrismaService } from '@app/prisma/prisma.service';
import { WhatsAppAgentService } from '@app/whatsapp-agent/whatsapp-agent.service';
import { Injectable, Logger } from '@nestjs/common';
import { tool } from 'langchain';
import { z } from 'zod';

import { AgentContext } from '../types/context.types';

/**
 * Type for script execution results
 */
type ScriptExecutionResult = unknown;

/**
 * Type pour le config des tools avec contexte typé
 */
type ToolConfig = {
  context?: AgentContext;
};

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
   * Create all wa-js tools (userId accessed via runtime context)
   */
  createTools(): ReturnType<typeof tool>[] {
    return [
      // Labels tools
      ...this.createLabelTools(),
      // Chat tools
      ...this.createChatTools(),
      // Contact tools
      ...this.createContactTools(),
      // Group tools
      ...this.createGroupTools(),
      // Profile tools
      ...this.createProfileTools(),
      // Catalog tools
      ...this.createCatalogTools(),
    ];
  }

  // ========== LABELS TOOLS ==========

  private createLabelTools(): ReturnType<typeof tool>[] {
    return [
      tool(
        async (_, config: ToolConfig) => {
          const userId = config?.context?.userId;
          if (!userId) {
            throw new Error('userId not found in runtime context');
          }
          const result = await this.executeScript(
            userId,
            'labels/getAllLabels',
          );
          return JSON.stringify(result);
        },
        {
          name: 'getAllLabels',
          description: 'Récupérer tous les labels WhatsApp',
          schema: z.object({}),
        },
      ),

      tool(
        async ({ name, color }, config: ToolConfig) => {
          const userId = config?.context?.userId;
          if (!userId) {
            throw new Error('userId not found in runtime context');
          }
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
        {
          name: 'addNewLabel',
          description: 'Créer un nouveau label WhatsApp',
          schema: z.object({
            name: z.string().describe('Nom du label'),
            color: z.string().optional().describe('Couleur hex (ex: #4CAF50)'),
          }),
        },
      ),

      tool(
        async ({ labelId, name, color }, config: ToolConfig) => {
          const userId = config?.context?.userId;
          if (!userId) {
            throw new Error('userId not found in runtime context');
          }
          const result = await this.executeScript(userId, 'labels/editLabel', {
            LABEL_ID: labelId,
            LABEL_NAME: name,
            LABEL_COLOR: color || '',
          });
          return JSON.stringify(result);
        },
        {
          name: 'editLabel',
          description: 'Modifier un label existant',
          schema: z.object({
            labelId: z.string().describe('ID du label'),
            name: z.string().describe('Nouveau nom'),
            color: z.string().optional().describe('Nouvelle couleur hex'),
          }),
        },
      ),

      tool(
        async ({ labelId }, config: ToolConfig) => {
          const userId = config?.context?.userId;
          if (!userId) {
            throw new Error('userId not found in runtime context');
          }
          const result = await this.executeScript(
            userId,
            'labels/deleteLabel',
            {
              LABEL_ID: labelId,
            },
          );
          return JSON.stringify(result);
        },
        {
          name: 'deleteLabel',
          description: 'Supprimer un label',
          schema: z.object({
            labelId: z.string().describe('ID du label à supprimer'),
          }),
        },
      ),

      tool(
        async ({ chatId, labelIds, action }, config: ToolConfig) => {
          const userId = config?.context?.userId;
          if (!userId) {
            throw new Error('userId not found in runtime context');
          }
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
        {
          name: 'addOrRemoveLabels',
          description: "Ajouter ou retirer des labels d'une conversation",
          schema: z.object({
            chatId: z.string().describe('ID de la conversation'),
            labelIds: z.array(z.string()).describe('IDs des labels'),
            action: z.enum(['add', 'remove']).describe('Action à effectuer'),
          }),
        },
      ),
    ];
  }

  // ========== CHAT TOOLS ==========

  private createChatTools(): ReturnType<typeof tool>[] {
    return [
      tool(
        async ({ chatId, limit }, config: ToolConfig) => {
          const userId = config?.context?.userId;
          if (!userId) {
            throw new Error('userId not found in runtime context');
          }
          const result = await this.executeScript(userId, 'chat/getMessages', {
            CHAT_ID: chatId,
            LIMIT: String(limit || 20),
          });
          return JSON.stringify(result);
        },
        {
          name: 'getMessages',
          description: "Lire les messages d'une conversation",
          schema: z.object({
            chatId: z.string().describe('ID de la conversation'),
            limit: z.number().optional().describe('Nombre de messages'),
          }),
        },
      ),

      tool(
        async ({ chatId }, config: ToolConfig) => {
          const userId = config?.context?.userId;
          if (!userId) {
            throw new Error('userId not found in runtime context');
          }
          const result = await this.executeScript(userId, 'chat/markIsRead', {
            CHAT_ID: chatId,
          });
          return JSON.stringify(result);
        },
        {
          name: 'markIsRead',
          description: 'Marquer une conversation comme lue',
          schema: z.object({
            chatId: z.string().describe('ID de la conversation'),
          }),
        },
      ),
    ];
  }

  // ========== CONTACT TOOLS ==========

  private createContactTools(): ReturnType<typeof tool>[] {
    return [
      tool(
        async ({ contactId }, config: ToolConfig) => {
          const userId = config?.context?.userId;
          if (!userId) {
            throw new Error('userId not found in runtime context');
          }
          const result = await this.executeScript(
            userId,
            'contact/getContact',
            {
              CONTACT_ID: contactId,
            },
          );
          return JSON.stringify(result);
        },
        {
          name: 'getContact',
          description: "Obtenir les informations d'un contact",
          schema: z.object({
            contactId: z.string().describe('ID du contact'),
          }),
        },
      ),

      tool(
        async (
          { onlyMyContacts, withLabels, name, limit },
          config: ToolConfig,
        ) => {
          const userId = config?.context?.userId;
          if (!userId) {
            throw new Error('userId not found in runtime context');
          }
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
        {
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
            name: z
              .string()
              .optional()
              .describe('Rechercher un contact par nom'),
            limit: z
              .number()
              .optional()
              .describe('Nombre max de résultats (max 10, défaut: 10)'),
          }),
        },
      ),

      tool(
        async ({ phoneNumber }, config: ToolConfig) => {
          const userId = config?.context?.userId;
          if (!userId) {
            throw new Error('userId not found in runtime context');
          }
          const result = await this.executeScript(
            userId,
            'contact/queryContactExists',
            { PHONE_NUMBER: phoneNumber },
          );
          return JSON.stringify(result);
        },
        {
          name: 'queryContactExists',
          description: 'Vérifier si un numéro existe sur WhatsApp',
          schema: z.object({
            phoneNumber: z.string().describe('Numéro de téléphone'),
          }),
        },
      ),
    ];
  }

  // ========== GROUP TOOLS ==========

  private createGroupTools(): ReturnType<typeof tool>[] {
    return [
      tool(
        async (_, config: ToolConfig) => {
          const userId = config?.context?.userId;
          if (!userId) {
            throw new Error('userId not found in runtime context');
          }
          const result = await this.executeScript(userId, 'group/getAllGroups');
          return JSON.stringify(result);
        },
        {
          name: 'getAllGroups',
          description: 'Récupérer tous les groupes WhatsApp',
          schema: z.object({}),
        },
      ),

      tool(
        async ({ name, participants }, config: ToolConfig) => {
          const userId = config?.context?.userId;
          if (!userId) {
            throw new Error('userId not found in runtime context');
          }
          const result = await this.executeScript(userId, 'group/createGroup', {
            GROUP_NAME: name,
            PARTICIPANTS: JSON.stringify(participants),
          });
          return JSON.stringify(result);
        },
        {
          name: 'createGroup',
          description: 'Créer un nouveau groupe WhatsApp',
          schema: z.object({
            name: z.string().describe('Nom du groupe'),
            participants: z
              .array(z.string())
              .describe('Numéros des participants'),
          }),
        },
      ),
    ];
  }

  // ========== PROFILE TOOLS ==========

  private createProfileTools(): ReturnType<typeof tool>[] {
    return [
      tool(
        async (_, config: ToolConfig) => {
          const userId = config?.context?.userId;
          if (!userId) {
            throw new Error('userId not found in runtime context');
          }
          const result = await this.executeScript(
            userId,
            'profile/getMyProfileName',
          );
          return JSON.stringify(result);
        },
        {
          name: 'getMyProfileName',
          description: 'Obtenir le nom du profil WhatsApp',
          schema: z.object({}),
        },
      ),

      tool(
        async ({ name }, config: ToolConfig) => {
          const userId = config?.context?.userId;
          if (!userId) {
            throw new Error('userId not found in runtime context');
          }
          const result = await this.executeScript(
            userId,
            'profile/setMyProfileName',
            { PROFILE_NAME: name },
          );
          return JSON.stringify(result);
        },
        {
          name: 'setMyProfileName',
          description: 'Modifier le nom du profil WhatsApp',
          schema: z.object({
            name: z.string().describe('Nouveau nom'),
          }),
        },
      ),
    ];
  }

  // ========== CATALOG TOOLS ==========

  private createCatalogTools(): ReturnType<typeof tool>[] {
    return [
      tool(
        async (_, config: ToolConfig) => {
          const userId = config?.context?.userId;
          if (!userId) {
            throw new Error('userId not found in runtime context');
          }
          const result = await this.executeScript(
            userId,
            'catalog/getCollections',
          );
          return JSON.stringify(result);
        },
        {
          name: 'getCollections',
          description: 'Récupérer toutes les collections du catalogue WhatsApp',
          schema: z.object({}),
        },
      ),

      tool(
        async ({ collectionId }, config: ToolConfig) => {
          const userId = config?.context?.userId;
          if (!userId) {
            throw new Error('userId not found in runtime context');
          }
          const result = await this.executeScript(
            userId,
            'catalog/getProductsFromCollection',
            {
              COLLECTION_ID: collectionId,
            },
          );
          return JSON.stringify(result);
        },
        {
          name: 'getProductsFromCollection',
          description: "Récupérer les produits d'une collection spécifique",
          schema: z.object({
            collectionId: z.string().describe('ID de la collection'),
          }),
        },
      ),

      tool(
        async ({ productId, visible }, config: ToolConfig) => {
          const userId = config?.context?.userId;
          if (!userId) {
            throw new Error('userId not found in runtime context');
          }
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
        {
          name: 'setProductVisibility',
          description: 'Afficher ou masquer un produit',
          schema: z.object({
            productId: z.string().describe('ID du produit'),
            visible: z.boolean().describe('Visible ou non'),
          }),
        },
      ),
    ];
  }
}
