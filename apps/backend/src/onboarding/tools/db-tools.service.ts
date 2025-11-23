import { PrismaService } from '@app/prisma/prisma.service';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

/**
 * Service providing database tools for the AI agent
 * All tools are scoped to the user's context
 */
@Injectable()
export class DbToolsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create all database tools for a user
   */
  createTools(userId: string): DynamicStructuredTool[] {
    return [
      this.createReadUserInfoTool(userId),
      this.createReadBusinessProfileTool(userId),
      this.createReadProductsTool(userId),
      this.createReadTagsTool(userId),
      this.createReadGroupsTool(userId),
      this.createUpdateContextTool(userId),
      this.createUpdateNeedsTool(userId),
      this.createGetContextScoreTool(userId),
    ];
  }

  private createReadUserInfoTool(userId: string): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'readUserInfo',
      description: "Lire les informations de l'utilisateur connecté",
      schema: z.object({}),
      func: async () => {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            phoneNumber: true,
            status: true,
            createdAt: true,
          },
        });
        return JSON.stringify(user);
      },
    });
  }

  private createReadBusinessProfileTool(userId: string): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'readBusinessProfile',
      description: 'Lire le profil business WhatsApp complet',
      schema: z.object({}),
      func: async () => {
        const businessInfo = await this.prisma.businessInfo.findUnique({
          where: { user_id: userId },
        });
        return JSON.stringify(businessInfo);
      },
    });
  }

  private createReadProductsTool(userId: string): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'readProducts',
      description: 'Lire les produits du catalogue',
      schema: z.object({
        limit: z
          .number()
          .optional()
          .describe('Nombre max de produits (défaut 50)'),
        collectionId: z
          .string()
          .optional()
          .describe('Filtrer par ID de collection'),
      }),
      func: async ({ limit, collectionId }) => {
        const products = await this.prisma.product.findMany({
          where: {
            user_id: userId,
            ...(collectionId && { collection_id: collectionId }),
          },
          take: limit || 50,
          include: {
            metadata: true,
            collection: {
              select: { id: true, name: true },
            },
          },
        });
        return JSON.stringify(products);
      },
    });
  }

  private createReadTagsTool(userId: string): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'readTags',
      description: 'Lire les tags configurés en base de données',
      schema: z.object({}),
      func: async () => {
        const tags = await this.prisma.tag.findMany({
          where: { userId },
        });
        return JSON.stringify(tags);
      },
    });
  }

  private createReadGroupsTool(userId: string): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'readGroups',
      description: 'Lire les groupes configurés en base de données',
      schema: z.object({}),
      func: async () => {
        const groups = await this.prisma.group.findMany({
          where: { userId },
        });
        return JSON.stringify(groups);
      },
    });
  }

  private createUpdateContextTool(userId: string): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'updateContext',
      description: "Mettre à jour le contexte de l'agent (format Markdown)",
      schema: z.object({
        context: z.string().describe('Nouveau contexte en markdown'),
      }),
      func: async ({ context }) => {
        await this.prisma.onboardingThread.updateMany({
          where: { userId },
          data: { context },
        });
        return JSON.stringify({ success: true, message: 'Context updated' });
      },
    });
  }

  private createUpdateNeedsTool(userId: string): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'updateNeeds',
      description: "Mettre à jour les besoins identifiés pour l'agent",
      schema: z.object({
        needs: z.array(z.string()).describe('Liste des besoins'),
      }),
      func: async ({ needs }) => {
        await this.prisma.onboardingThread.updateMany({
          where: { userId },
          data: { needs },
        });
        return JSON.stringify({ success: true, message: 'Needs updated' });
      },
    });
  }

  private createGetContextScoreTool(userId: string): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: 'getContextScore',
      description: 'Obtenir le score actuel du contexte',
      schema: z.object({}),
      func: async () => {
        const thread = await this.prisma.onboardingThread.findFirst({
          where: { userId },
          select: { score: true },
        });
        return JSON.stringify({ score: thread?.score || 0 });
      },
    });
  }
}
