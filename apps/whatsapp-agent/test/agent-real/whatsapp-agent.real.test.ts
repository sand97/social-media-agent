import { tool } from '@langchain/core/tools';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { BackendClientService } from '../../src/backend-client/backend-client.service';
import { ConnectorClientService } from '../../src/connector/connector-client.service';
import { SystemPromptService } from '../../src/langchain/system-prompt.service';
import { WhatsAppAgentService } from '../../src/langchain/whatsapp-agent.service';
import { PageScriptService } from '../../src/page-scripts/page-script.service';
import { RateLimitService } from '../../src/security/rate-limit.service';
import { SanitizationService } from '../../src/security/sanitization.service';
import { CatalogTools } from '../../src/tools/catalog/catalog.tools';
import { ChatTools } from '../../src/tools/chat/chat.tools';
import { CommunicationTools } from '../../src/tools/communication/communication.tools';
import { GroupTools } from '../../src/tools/group/group.tools';
import { IntentTools } from '../../src/tools/intent/intent.tools';
import { LabelsTools } from '../../src/tools/labels/labels.tools';
import { MemoryTools } from '../../src/tools/memory/memory.tools';
import { MessagesTools } from '../../src/tools/messages/messages.tools';

const state = vi.hoisted(() => ({
  toolCalls: [] as Array<Array<{ id: string; name: string; args: Record<string, any> }>>,
}));

vi.mock('@langchain/openai', async () => {
  const langchain = await vi.importActual<typeof import('langchain')>('langchain');

  class ChatOpenAI extends langchain.FakeToolCallingModel {
    constructor() {
      super({ toolCalls: state.toolCalls });
    }
  }

  return { ChatOpenAI };
});

vi.mock('@langchain/google-genai', async () => {
  const langchain = await vi.importActual<typeof import('langchain')>('langchain');

  class ChatGoogleGenerativeAI extends langchain.FakeToolCallingModel {
    constructor() {
      super({ toolCalls: [] });
    }
  }

  return { ChatGoogleGenerativeAI };
});

function buildIncomingMessage(body: string) {
  return [
    {
      id: { _serialized: 'wamid.real-e2e-1' },
      fromMe: false,
      from: '64845667926032@lid',
      body,
      contactId: '237675075643@c.us',
      messageHistory: {
        messages: [],
        hostMessageCount: 0,
        ourMessageCount: 0,
        totalFetched: 0,
        reachedLimit: true,
      },
    },
  ];
}

function createToolSet() {
  const replyHandler = vi
    .fn()
    .mockResolvedValue(JSON.stringify({ success: true, sent: true }));
  const searchHandler = vi.fn().mockResolvedValue(
    JSON.stringify({
      success: true,
      products: [],
      count: 0,
      method: 'vector_search',
    }),
  );
  const historyHandler = vi
    .fn()
    .mockResolvedValue(JSON.stringify({ success: true, messages: [], count: 0 }));

  const replyTool = tool(replyHandler, {
    name: 'reply_to_message',
    description: 'Reply to customer',
    schema: z.object({
      message: z.string(),
      quotedMessageId: z.string().optional(),
    }),
  });

  const searchTool = tool(searchHandler, {
    name: 'search_products',
    description: 'Search products',
    schema: z.object({ query: z.string(), limit: z.number().optional() }),
  });

  const historyTool = tool(historyHandler, {
    name: 'get_message_history',
    description: 'Get message history',
    schema: z.object({ maxTotal: z.number().optional() }),
  });

  return {
    handlers: { replyHandler, searchHandler, historyHandler },
    toolProviders: {
      communicationTools: [],
      catalogTools: [searchTool],
      chatTools: [replyTool],
      groupTools: [],
      labelsTools: [],
      memoryTools: [],
      messagesTools: [historyTool],
      intentTools: [],
    },
  };
}

async function createService(
  toolCalls: Array<Array<{ id: string; name: string; args: Record<string, any> }>>,
) {
  state.toolCalls = toolCalls;

  const { handlers, toolProviders } = createToolSet();

  const backendClient = {
    fetchMetadataList: vi.fn().mockResolvedValue({ success: true, data: {} }),
    canProcess: vi.fn().mockResolvedValue({
      allowed: true,
      agentContext: 'ctx',
      managementGroupId: '120363000000000000@g.us',
      agentId: 'agent-1',
      authorizedGroups: [],
    }),
    logOperation: vi.fn().mockResolvedValue({ success: true, operationId: 'op1' }),
  };

  const configService = {
    get: vi.fn((key: string) => {
      const values: Record<string, string | undefined> = {
        PRIMARY_MODEL: 'grok',
        FALLBACK_MODEL: 'none',
        XAI_API_KEY: 'test-key',
        XAI_MODEL: 'fake-grok',
        AGENT_RECURSION_LIMIT: '20',
      };
      return values[key];
    }),
  } as unknown as ConfigService;

  const service = new WhatsAppAgentService(
    configService,
    { createTools: vi.fn(() => toolProviders.communicationTools) } as unknown as CommunicationTools,
    { createTools: vi.fn(() => toolProviders.catalogTools) } as unknown as CatalogTools,
    { createTools: vi.fn(() => toolProviders.chatTools) } as unknown as ChatTools,
    { createTools: vi.fn(() => toolProviders.groupTools) } as unknown as GroupTools,
    { createTools: vi.fn(() => toolProviders.labelsTools) } as unknown as LabelsTools,
    { createTools: vi.fn(() => toolProviders.memoryTools) } as unknown as MemoryTools,
    { createTools: vi.fn(() => toolProviders.messagesTools) } as unknown as MessagesTools,
    { createTools: vi.fn(() => toolProviders.intentTools) } as unknown as IntentTools,
    {
      sanitizeUserInput: vi.fn((v: string) => v),
      validateInput: vi.fn(() => ({ valid: true })),
      sanitizeAgentResponse: vi.fn((v: string) => v),
    } as unknown as SanitizationService,
    { checkRateLimit: vi.fn().mockResolvedValue({ limited: false }) } as unknown as RateLimitService,
    backendClient as unknown as BackendClientService,
    {} as ConnectorClientService,
    {} as PageScriptService,
    { buildSystemPrompt: vi.fn().mockReturnValue('system prompt') } as unknown as SystemPromptService,
  );

  return {
    service,
    handlers,
    backendClient,
  };
}

describe('WhatsApp agent integration (real LangChain runtime)', () => {
  beforeEach(() => {
    state.toolCalls = [];
  });

  it('runs single-tool flow', async () => {
    const { service, handlers, backendClient } = await createService([
      [
        {
          id: 'reply-1',
          name: 'reply_to_message',
          args: { message: 'Bonjour, comment puis-je vous aider ?' },
        },
      ],
      [],
    ]);

    await service.processIncomingMessage(buildIncomingMessage('Bonjour') as any, '237675075643@c.us');

    expect(handlers.replyHandler).toHaveBeenCalledTimes(1);
    expect(handlers.searchHandler).toHaveBeenCalledTimes(0);
    expect(backendClient.logOperation).toHaveBeenCalledTimes(1);

  });

  it('runs multi-tool flow (search + reply)', async () => {
    const { service, handlers, backendClient } = await createService([
      [
        {
          id: 'search-1',
          name: 'search_products',
          args: { query: 'maillot barca', limit: 5 },
        },
        {
          id: 'reply-1',
          name: 'reply_to_message',
          args: { message: 'Je vérifie le catalogue et je te dis.' },
        },
      ],
      [],
    ]);

    await service.processIncomingMessage(
      buildIncomingMessage('Vous avez un maillot du Barça ?') as any,
      '237675075643@c.us',
    );

    expect(handlers.searchHandler).toHaveBeenCalledTimes(1);
    expect(handlers.replyHandler).toHaveBeenCalledTimes(1);
    expect(backendClient.logOperation).toHaveBeenCalledTimes(1);

  });

  it('guards duplicate side-effect tool call in one run', async () => {
    const { service, handlers } = await createService([
      [
        { id: 'reply-1', name: 'reply_to_message', args: { message: 'Première réponse' } },
      ],
      [
        { id: 'reply-2', name: 'reply_to_message', args: { message: 'Seconde réponse' } },
      ],
      [],
    ]);

    await service.processIncomingMessage(buildIncomingMessage('Bonjour') as any, '237675075643@c.us');

    expect(handlers.replyHandler).toHaveBeenCalledTimes(1);

  });
});
