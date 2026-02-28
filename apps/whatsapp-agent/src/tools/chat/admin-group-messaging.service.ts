import { ConnectorClientService } from '@app/connector/connector-client.service';
import { PageScriptService } from '@app/page-scripts/page-script.service';
import { Injectable, Logger } from '@nestjs/common';

import { ContactResolverService } from '../contact/contact-resolver.service';

type SendToManagementGroupOptions = {
  managementGroupId: string;
  message: string;
  chatId?: string;
  contactId?: string;
  shouldReplyToUser?: boolean;
  replyToUser?: string;
};

@Injectable()
export class AdminGroupMessagingService {
  private readonly logger = new Logger(AdminGroupMessagingService.name);

  constructor(
    private readonly connectorClient: ConnectorClientService,
    private readonly scriptService: PageScriptService,
    private readonly contactResolver: ContactResolverService,
  ) {}

  async sendToManagementGroup(options: SendToManagementGroupOptions): Promise<{
    success: boolean;
    groupResult?: unknown;
    userResult?: unknown;
    error?: string;
  }> {
    try {
      if (!options.managementGroupId) {
        return {
          success: false,
          error: 'No management group configured.',
        };
      }

      const formattedContact = await this.contactResolver.resolveContactNumber({
        contactId: options.contactId,
        chatId: options.chatId,
      });

      const enrichedMessage = `📱 Contact: ${formattedContact}\n\n${options.message}`;

      const groupScript = this.scriptService.getScript('chat/sendTextMessage', {
        TO: options.managementGroupId,
        MESSAGE: enrichedMessage,
        USE_TYPING: 'true',
      });

      const groupResult = await this.connectorClient.executeScript(groupScript);
      let userResult: unknown;

      const reply = options.replyToUser?.trim();
      if (options.shouldReplyToUser && options.chatId && reply) {
        const replyScript = this.scriptService.getScript(
          'chat/sendTextMessage',
          {
            TO: options.chatId,
            MESSAGE: reply,
            USE_TYPING: 'true',
          },
        );

        userResult = await this.connectorClient.executeScript(replyScript);
      }

      return {
        success: true,
        groupResult,
        userResult,
      };
    } catch (error: any) {
      this.logger.warn(
        `Failed to send message to management group: ${error?.message || error}`,
      );

      return {
        success: false,
        error: error?.message || 'Unknown error',
      };
    }
  }
}
