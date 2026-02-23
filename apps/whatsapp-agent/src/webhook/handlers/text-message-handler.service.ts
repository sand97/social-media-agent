import { WhatsAppAgentService } from '@app/langchain/whatsapp-agent.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class TextMessageHandlerService {
  constructor(private readonly agentService: WhatsAppAgentService) {}

  async handle(messageData: any[], userId?: string) {
    await this.agentService.processIncomingMessage(messageData, userId);
  }
}
