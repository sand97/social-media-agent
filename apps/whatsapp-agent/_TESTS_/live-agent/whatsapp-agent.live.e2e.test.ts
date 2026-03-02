import { tool } from '@langchain/core/tools';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
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

type ToolCallEntry = {
  name: string;
  args: Record<string, unknown>;
};

type HistoryMessage = {
  id: string;
  body: string;
  from: string;
  fromMe: boolean;
  timestamp: number;
  type: string;
  hasMedia: boolean;
};

type Scenario = {
  name: string;
  message: string;
  agentContext: string;
  history: HistoryMessage[];
  mustInclude: string[];
  mustExclude: string[];
};

type LiveModelConfig = {
  canRun: boolean;
  reason?: string;
  values: Record<string, string | undefined>;
};

function resolveLiveModelConfig(): LiveModelConfig {
  if (process.env.OPENAI_API_KEY) {
    return {
      canRun: true,
      values: {
        PRIMARY_MODEL: 'openai',
        FALLBACK_MODEL: 'none',
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        AGENT_RECURSION_LIMIT: process.env.AGENT_RECURSION_LIMIT || '30',
        AGENT_ACTIVE_TOOLS:
          'reply_to_message,search_products,get_message_history',
      },
    };
  }

  if (process.env.GEMINI_API_KEY) {
    return {
      canRun: true,
      values: {
        PRIMARY_MODEL: 'gemini',
        FALLBACK_MODEL: 'none',
        GEMINI_API_KEY: process.env.GEMINI_API_KEY,
        GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
        AGENT_RECURSION_LIMIT: process.env.AGENT_RECURSION_LIMIT || '30',
        AGENT_ACTIVE_TOOLS:
          'reply_to_message,search_products,get_message_history',
      },
    };
  }

  if (process.env.XAI_API_KEY) {
    return {
      canRun: true,
      values: {
        PRIMARY_MODEL: 'grok',
        FALLBACK_MODEL: 'none',
        XAI_API_KEY: process.env.XAI_API_KEY,
        XAI_MODEL: process.env.XAI_MODEL || 'grok-beta',
        AGENT_RECURSION_LIMIT: process.env.AGENT_RECURSION_LIMIT || '30',
        AGENT_ACTIVE_TOOLS:
          'reply_to_message,search_products,get_message_history',
      },
    };
  }

  return {
    canRun: false,
    reason:
      'No model API key found (OPENAI_API_KEY, GEMINI_API_KEY, XAI_API_KEY).',
    values: {},
  };
}

function buildIncomingMessage(body: string, history: HistoryMessage[]) {
  const now = Date.now();
  return [
    {
      id: { _serialized: `wamid.live-${now}` },
      fromMe: false,
      from: '64845667926032@lid',
      body,
      contactId: '237675075643@c.us',
      messageHistory: {
        messages: history,
        hostMessageCount: history.filter((msg) => !msg.fromMe).length,
        ourMessageCount: history.filter((msg) => msg.fromMe).length,
        totalFetched: history.length,
        reachedLimit: true,
      },
    },
  ];
}

function createToolSet() {
  const callLog: ToolCallEntry[] = [];

  const replyHandler = vi
    .fn(async (args: { message: string; quotedMessageId?: string }) => {
      callLog.push({ name: 'reply_to_message', args });
      return JSON.stringify({
        success: true,
        sent: true,
        echo: args.message,
      });
    })
    .mockName('reply_to_message');

  const searchHandler = vi
    .fn(async (args: { query: string; limit?: number }) => {
      callLog.push({ name: 'search_products', args });
      return JSON.stringify({
        success: true,
        query: args.query,
        count: 1,
        method: 'vector_search',
        products: [
          {
            id: 'prod-barca-1',
            name: 'Maillot FC Barcelone 2025',
            price: '49.90',
            currency: 'EUR',
          },
        ],
      });
    })
    .mockName('search_products');

  const historyHandler = vi
    .fn(async (args: { maxTotal?: number }) => {
      callLog.push({ name: 'get_message_history', args });
      return JSON.stringify({
        success: true,
        count: 2,
        result: [
          { role: 'user', content: 'Je cherche un maillot du Barça' },
          { role: 'assistant', content: 'Je peux vous aider sur le modèle.' },
        ],
      });
    })
    .mockName('get_message_history');

  const replyTool = tool(replyHandler, {
    name: 'reply_to_message',
    description:
      'Send the final customer-facing message. Use this for every reply to the customer.',
    schema: z.object({
      message: z.string().describe('Message to send to the customer'),
      quotedMessageId: z.string().optional(),
    }),
  });

  const searchTool = tool(searchHandler, {
    name: 'search_products',
    description:
      'Search products in the catalog when the user asks about product availability, type, brand, team, or price.',
    schema: z.object({
      query: z.string().describe('Search query based on customer request'),
      limit: z.number().optional(),
    }),
  });

  const historyTool = tool(historyHandler, {
    name: 'get_message_history',
    description:
      'Load additional older conversation history when the currently provided context is not enough.',
    schema: z.object({
      maxTotal: z.number().optional(),
    }),
  });

  return {
    callLog,
    handlers: {
      replyHandler,
      searchHandler,
      historyHandler,
    },
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

function createConfigService(values: Record<string, string | undefined>) {
  return {
    get: vi.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

async function createService(scenario: Scenario, modelConfig: LiveModelConfig) {
  const { callLog, handlers, toolProviders } = createToolSet();

  const backendClient = {
    fetchMetadataList: vi.fn().mockResolvedValue({ success: true, data: {} }),
    canProcess: vi.fn().mockResolvedValue({
      allowed: true,
      reason: undefined,
      agentContext: scenario.agentContext,
      managementGroupId: '120363000000000000@g.us',
      agentId: 'agent-live-tests',
      authorizedGroups: [],
    }),
    logOperation: vi.fn().mockResolvedValue({
      success: true,
      operationId: 'op-live-1',
    }),
  };

  const service = new WhatsAppAgentService(
    createConfigService(modelConfig.values),
    {
      createTools: () => toolProviders.communicationTools,
    } as unknown as CommunicationTools,
    {
      createTools: () => toolProviders.catalogTools,
    } as unknown as CatalogTools,
    { createTools: () => toolProviders.chatTools } as unknown as ChatTools,
    { createTools: () => toolProviders.groupTools } as unknown as GroupTools,
    { createTools: () => toolProviders.labelsTools } as unknown as LabelsTools,
    { createTools: () => toolProviders.memoryTools } as unknown as MemoryTools,
    {
      createTools: () => toolProviders.messagesTools,
    } as unknown as MessagesTools,
    { createTools: () => toolProviders.intentTools } as unknown as IntentTools,
    {
      sanitizeUserInput: (value: string) => value,
      validateInput: () => ({ valid: true }),
      sanitizeAgentResponse: (value: string) => value,
    } as unknown as SanitizationService,
    {
      checkRateLimit: vi.fn().mockResolvedValue({ limited: false }),
    } as unknown as RateLimitService,
    backendClient as unknown as BackendClientService,
    {} as ConnectorClientService,
    {} as PageScriptService,
    new SystemPromptService(),
  );

  return { service, callLog, handlers, backendClient };
}

const scenarios: Scenario[] = [
  {
    name: 'greeting-only -> reply tool only',
    message: 'Bonjour',
    history: [],
    agentContext: [
      '## Test policy',
      '- Greeting-only message with no business request.',
      '- Call only reply_to_message.',
      '- Do not call search_products.',
      '- Do not call get_message_history.',
    ].join('\n'),
    mustInclude: ['reply_to_message'],
    mustExclude: ['search_products', 'get_message_history'],
  },
  {
    name: 'product availability -> search then reply',
    message: 'Vous avez un maillot du Barça ?',
    history: [],
    agentContext: [
      '## Test policy',
      '- For product availability questions, call search_products first.',
      '- Then call reply_to_message.',
      '- Do not call get_message_history when the request is explicit.',
    ].join('\n'),
    mustInclude: ['search_products', 'reply_to_message'],
    mustExclude: ['get_message_history'],
  },
  {
    name: 'missing context -> history lookup then reply',
    message: "Tu peux me rappeler ce qu'on disait avant ?",
    history: [],
    agentContext: [
      '## Test policy',
      '- If the user asks for previous context and provided history is empty, call get_message_history.',
      '- Then call reply_to_message.',
      '- Do not call search_products.',
    ].join('\n'),
    mustInclude: ['get_message_history', 'reply_to_message'],
    mustExclude: ['search_products'],
  },
  {
    name: 'history provided -> no extra history tool',
    message: 'Et en taille M ?',
    history: [
      {
        id: 'hist-user-1',
        body: 'Vous avez un maillot du Barça ?',
        from: '64845667926032@lid',
        fromMe: false,
        timestamp: Date.now() - 120000,
        type: 'chat',
        hasMedia: false,
      },
      {
        id: 'hist-agent-1',
        body: 'Oui, nous avons le maillot du FC Barcelone 2025.',
        from: '64845667926032@lid',
        fromMe: true,
        timestamp: Date.now() - 60000,
        type: 'chat',
        hasMedia: false,
      },
    ],
    agentContext: [
      '## Test policy',
      '- The relevant context is already present in provided history.',
      '- Do not call get_message_history in this scenario.',
      '- Call search_products to refine by size.',
      '- Then call reply_to_message.',
    ].join('\n'),
    mustInclude: ['search_products', 'reply_to_message'],
    mustExclude: ['get_message_history'],
  },
];

const modelConfig = resolveLiveModelConfig();
const liveEnabled = process.env.AGENT_LIVE_TESTS === 'true';
const runLiveSuite = liveEnabled && modelConfig.canRun;
const describeLive = runLiveSuite ? describe : describe.skip;

describeLive('WhatsApp agent live-model tool routing (_TESTS_)', () => {
  it.each(scenarios)('$name', async (scenario) => {
    const { service, callLog, handlers, backendClient } = await createService(
      scenario,
      modelConfig,
    );

    await service.processIncomingMessage(
      buildIncomingMessage(scenario.message, scenario.history) as any,
      '237675075643@c.us',
    );

    const calledTools = callLog.map((entry) => entry.name);

    for (const toolName of scenario.mustInclude) {
      expect(calledTools).toContain(toolName);
    }
    for (const toolName of scenario.mustExclude) {
      expect(calledTools).not.toContain(toolName);
    }

    expect(handlers.replyHandler).toHaveBeenCalledTimes(1);
    expect(backendClient.logOperation).toHaveBeenCalledTimes(1);

    const lastLogPayload = backendClient.logOperation.mock.calls.at(-1)?.[0];
    expect(lastLogPayload).toBeDefined();
    expect(Array.isArray(lastLogPayload.toolsUsed)).toBe(true);
  });
});

if (!runLiveSuite) {
  const why = !liveEnabled
    ? 'AGENT_LIVE_TESTS is not set to true.'
    : (modelConfig.reason ?? 'No compatible model config.');
  // eslint-disable-next-line no-console
  console.warn(`[live-tests][whatsapp-agent] skipped: ${why}`);
}
