import { ConnectorClientService } from '@app/connector/connector-client.service';
import { PageScriptService } from '@app/page-scripts/page-script.service';
import { tool } from '@langchain/core/tools';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

/**
 * Labels (tags) tools for the WhatsApp agent
 * Handles contact labeling and label retrieval
 */
@Injectable()
export class LabelsTools {
  constructor(
    private readonly connectorClient: ConnectorClientService,
    private readonly scriptService: PageScriptService,
  ) {}

  /**
   * Create all labels tools
   */
  createTools() {
    return [
      this.createGetContactLabelsTool(),
      this.createAddLabelToContactTool(),
    ];
  }

  /**
   * Get labels for a contact
   */
  private createGetContactLabelsTool() {
    return tool(
      async ({ contactId }, config?: any) => {
        try {
          const script = this.scriptService.getScript(
            'labels/getContactLabels',
            {
              CONTACT_ID: contactId,
            },
          );

          const labels = await this.connectorClient.executeScript(script);

          return JSON.stringify({
            success: true,
            labels,
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'get_contact_labels',
        description:
          'Récupérer les labels (tags) associés à un contact WhatsApp',
        schema: z.object({
          contactId: z
            .string()
            .describe('ID du contact WhatsApp (format: 237xxx@c.us)'),
        }),
      },
    );
  }

  /**
   * Add a label to a contact
   */
  private createAddLabelToContactTool() {
    return tool(
      async ({ contactId, labelId }, config?: any) => {
        try {
          const script = this.scriptService.getScript(
            'labels/addLabelToContact',
            {
              CONTACT_ID: contactId,
              LABEL_ID: labelId,
            },
          );

          await this.connectorClient.executeScript(script);

          return JSON.stringify({
            success: true,
            message: 'Label ajouté avec succès',
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'add_label_to_contact',
        description: 'Ajouter un label (tag) à un contact WhatsApp',
        schema: z.object({
          contactId: z
            .string()
            .describe('ID du contact WhatsApp (format: 237xxx@c.us)'),
          labelId: z.string().describe('ID du label à ajouter'),
        }),
      },
    );
  }
}
