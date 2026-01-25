import { ConnectorClientService } from '@app/connector/connector-client.service';
import { PageScriptService } from '@app/page-scripts/page-script.service';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ContactResolverService {
  private readonly logger = new Logger(ContactResolverService.name);

  constructor(
    private readonly connectorClient: ConnectorClientService,
    private readonly scriptService: PageScriptService,
  ) {}

  formatContactNumber(raw?: string): string {
    const normalized = raw?.replace(/@.*$/, '');
    if (!normalized) {
      return 'Inconnu';
    }
    return normalized.startsWith('+') ? normalized : `+${normalized}`;
  }

  async resolveContactNumber(context?: {
    contactId?: string;
    chatId?: string;
  }): Promise<string> {
    const contactId = context?.contactId;
    const chatId = context?.chatId;

    if (contactId) {
      return this.formatContactNumber(contactId);
    }

    if (chatId && chatId.includes('@lid')) {
      try {
        const script = this.scriptService.getScript(
          'contact/getContactByChatId',
          {
            CHAT_ID: chatId,
          },
        );
        const response = await this.connectorClient.executeScript(script);
        const user = response?.result?.user;
        if (user) {
          return this.formatContactNumber(user);
        }
      } catch (error: any) {
        this.logger.warn(
          `Failed to resolve contact from chatId ${chatId}: ${error.message}`,
        );
      }
      return 'Inconnu';
    }

    return this.formatContactNumber(chatId);
  }
}
