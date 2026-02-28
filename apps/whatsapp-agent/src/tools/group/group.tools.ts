import { ConnectorClientService } from '@app/connector/connector-client.service';
import { PageScriptService } from '@app/page-scripts/page-script.service';
import { tool } from '@langchain/core/tools';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import { instrumentTools } from '../tool-logging.util';

/**
 * Group tools for the WhatsApp agent
 * Provides group management and invitation capabilities
 */
@Injectable()
export class GroupTools {
  private readonly logger = new Logger(GroupTools.name);

  constructor(
    private readonly connectorClient: ConnectorClientService,
    private readonly scriptService: PageScriptService,
  ) {}

  /**
   * Create all group tools
   */
  createTools() {
    const tools = [this.createSendGroupInviteTool()];
    return instrumentTools(this.logger, GroupTools.name, tools);
  }

  /**
   * Send group invite message
   */
  private createSendGroupInviteTool() {
    return tool(
      async ({ inviteCode, groupId, expiration }, config?: any) => {
        try {
          const chatId = config?.context?.chatId;
          if (!chatId) {
            return JSON.stringify({
              success: false,
              error: 'No chatId in runtime context',
            });
          }

          const script = this.scriptService.getScript('group/sendGroupInvite', {
            TO: chatId,
            INVITE_CODE: inviteCode,
            GROUP_ID: groupId,
            EXPIRATION: expiration ? String(expiration) : '',
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
        name: 'send_group_invite',
        description:
          'Send a WhatsApp group invite to the current conversation. Great for inviting customers to support groups, communities, VIP groups, etc.',
        schema: z.object({
          inviteCode: z.string().describe('Group invite code (from WhatsApp)'),
          groupId: z.string().describe('Group ID (format: xxxxx@g.us)'),
          expiration: z
            .number()
            .optional()
            .describe('Invite expiration timestamp (in milliseconds)'),
        }),
      },
    );
  }
}
