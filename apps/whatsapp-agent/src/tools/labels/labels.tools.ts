import { ConnectorClientService } from '@app/connector/connector-client.service';
import { PageScriptService } from '@app/page-scripts/page-script.service';
import { tool } from '@langchain/core/tools';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import { instrumentTools } from '../tool-logging.util';

/**
 * Labels (tags) tools for the WhatsApp agent
 * Handles contact labeling and label retrieval
 */
@Injectable()
export class LabelsTools {
  private readonly logger = new Logger(LabelsTools.name);

  constructor(
    private readonly connectorClient: ConnectorClientService,
    private readonly scriptService: PageScriptService,
  ) {}

  /**
   * Create all labels tools
   */
  createTools() {
    const tools = [
      this.createGetContactLabelsTool(),
      this.createAddLabelToContactTool(),
      this.createRemoveLabelFromContactTool(),
    ];

    return instrumentTools(this.logger, LabelsTools.name, tools);
  }

  /**
   * Get labels for a contact
   */
  private createGetContactLabelsTool() {
    return tool(
      async (_input, config?: any) => {
        try {
          const contactId =
            config?.context?.contactId || config?.context?.chatId;
          if (!contactId) {
            return JSON.stringify({
              success: false,
              error: 'No chatId in runtime context',
            });
          }

          const script = this.scriptService.getScript(
            'labels/getContactLabels',
            {
              CONTACT_ID: contactId,
            },
          );

          const { result: labels } =
            await this.connectorClient.executeScript(script);

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
          'Get labels (tags) of the current contact. Use only when label information is explicitly needed to decide the next action.',
        schema: z.object({}),
      },
    );
  }

  /**
   * Add a label to a contact
   */
  private createAddLabelToContactTool() {
    return tool(
      async ({ labelId }, config?: any) => {
        try {
          const contactId =
            config?.context?.chatId || config?.context?.contactId;
          if (!contactId) {
            return JSON.stringify({
              success: false,
              error: 'No chatId in runtime context',
            });
          }

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
        description: 'Add a label (tag) to the current WhatsApp contact',
        schema: z.object({
          labelId: z.string().describe('Label ID to add'),
        }),
      },
    );
  }

  /**
   * Remove a label from a contact
   */
  private createRemoveLabelFromContactTool() {
    return tool(
      async ({ labelId }, config?: any) => {
        try {
          const contactId =
            config?.context?.chatId || config?.context?.contactId;
          if (!contactId) {
            return JSON.stringify({
              success: false,
              error: 'No chatId in runtime context',
            });
          }

          const script = this.scriptService.getScript(
            'labels/removeLabelFromContact',
            {
              CONTACT_ID: contactId,
              LABEL_ID: labelId,
            },
          );

          await this.connectorClient.executeScript(script);

          return JSON.stringify({
            success: true,
            message: 'Label retiré avec succès',
          });
        } catch (error: any) {
          return JSON.stringify({
            success: false,
            error: error.message,
          });
        }
      },
      {
        name: 'remove_label_from_contact',
        description: 'Remove a label (tag) from the current WhatsApp contact',
        schema: z.object({
          labelId: z.string().describe('Label ID to remove'),
        }),
      },
    );
  }
}
