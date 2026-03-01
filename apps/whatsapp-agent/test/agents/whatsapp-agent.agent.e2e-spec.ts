/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { tool } from 'langchain';
import { z } from 'zod';

import { BackendClientService } from '@app/backend-client/backend-client.service';
import { ConnectorClientService } from '@app/connector/connector-client.service';
import { SystemPromptService } from '@app/langchain/system-prompt.service';
import { PageScriptService } from '@app/page-scripts/page-script.service';
import { RateLimitService } from '@app/security/rate-limit.service';
import { SanitizationService } from '@app/security/sanitization.service';
import { CatalogTools } from '@app/tools/catalog/catalog.tools';
import { ChatTools } from '@app/tools/chat/chat.tools';
import { CommunicationTools } from '@app/tools/communication/communication.tools';
import { GroupTools } from '@app/tools/group/group.tools';
import { IntentTools } from '@app/tools/intent/intent.tools';
import { LabelsTools } from '@app/tools/labels/labels.tools';
import { MemoryTools } from '@app/tools/memory/memory.tools';
import { MessagesTools } from '@app/tools/messages/messages.tools';
import { WhatsAppAgentService } from '../../src/langchain/whatsapp-agent.service';

type FakeToolCall = {
  id: string;
  name: string;
  args: Record<string, any>;
};

const WA_MODEL_STATE: { toolCalls: FakeToolCall[][] } = {
  toolCalls: [],
};

(globalThis as any).__WA_MODEL_STATE__ = WA_MODEL_STATE;

jest.mock('@langchain/core/messages', () => ({
  ToolMessage: class ToolMessage {
    content: string;
    tool_call_id: string;
    name: string;
    status?: string;

    constructor(input: {
      content: string;
      tool_call_id: string;
      name: string;
      status?: string;
    }) {
      this.content = input.content;
      this.tool_call_id = input.tool_call_id;
      this.name = input.name;
      this.status = input.status;
    }
  },
}));

jest.mock('@langchain/core/tools', () => ({
  tool: (fn: any, metadata: any) => ({
    ...metadata,
    invoke: (args: any, config?: any) => fn(args, config),
  }),
}));

jest.mock('@langchain/core/callbacks/base', () => ({
  BaseCallbackHandler: class BaseCallbackHandler {},
}));

jest.mock('@app/backend-client/backend-client.service', () => ({
  BackendClientService: class BackendClientService {},
}));

jest.mock('@app/connector/connector-client.service', () => ({
  ConnectorClientService: class ConnectorClientService {},
}));

jest.mock('@app/page-scripts/page-script.service', () => ({
  PageScriptService: class PageScriptService {},
}));

jest.mock('@app/security/rate-limit.service', () => ({
  RateLimitService: class RateLimitService {},
}));

jest.mock('@app/security/sanitization.service', () => ({
  SanitizationService: class SanitizationService {},
}));

jest.mock('@app/langchain/system-prompt.service', () => ({
  SystemPromptService: class SystemPromptService {},
}));

jest.mock('@app/tools/communication/communication.tools', () => ({
  CommunicationTools: class CommunicationTools {
    createTools() {
      return [];
    }
  },
}));

jest.mock('@app/tools/catalog/catalog.tools', () => ({
  CatalogTools: class CatalogTools {
    createTools() {
      return [];
    }
  },
}));

jest.mock('@app/tools/chat/chat.tools', () => ({
  ChatTools: class ChatTools {
    createTools() {
      return [];
    }
  },
}));

jest.mock('@app/tools/group/group.tools', () => ({
  GroupTools: class GroupTools {
    createTools() {
      return [];
    }
  },
}));

jest.mock('@app/tools/labels/labels.tools', () => ({
  LabelsTools: class LabelsTools {
    createTools() {
      return [];
    }
  },
}));

jest.mock('@app/tools/memory/memory.tools', () => ({
  MemoryTools: class MemoryTools {
    createTools() {
      return [];
    }
  },
}));

jest.mock('@app/tools/messages/messages.tools', () => ({
  MessagesTools: class MessagesTools {
    createTools() {
      return [];
    }
  },
}));

jest.mock('@app/tools/intent/intent.tools', () => ({
  IntentTools: class IntentTools {
    createTools() {
      return [];
    }
  },
}));

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: class ChatOpenAI {
    toolCalls: FakeToolCall[][];

    constructor() {
      this.toolCalls = ((globalThis as any).__WA_MODEL_STATE__?.toolCalls || []) as FakeToolCall[][];
    }
  },
}));

jest.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: class ChatGoogleGenerativeAI {
    toolCalls: FakeToolCall[][];

    constructor() {
      this.toolCalls = [];
    }
  },
}));

jest.mock('langchain', () => {
  const tool = (fn: any, metadata: any) => ({
    ...metadata,
    invoke: (args: any, config?: any) => fn(args, config),
  });

  const createMiddleware = (config: any) => config;

  const modelCallLimitMiddleware = (config: any) => ({
    __type: 'modelCallLimit',
    ...config,
  });

  const toolCallLimitMiddleware = (config: any) => ({
    __type: 'toolCallLimit',
    ...config,
  });

  const modelFallbackMiddleware = (fallbackModel: any) => ({
    __type: 'modelFallback',
    fallbackModel,
  });

  const createAgent = ({ model, tools = [], middleware = [] }: any) => {
    const toolsMap = new Map<string, any>();
    for (const currentTool of tools) {
      toolsMap.set(currentTool.name, currentTool);
    }

    const modelLimitMiddleware = middleware.find(
      (item: any) => item?.__type === 'modelCallLimit',
    );
    const toolLimitMiddleware = middleware.find(
      (item: any) => item?.__type === 'toolCallLimit',
    );

    const modelRunLimit = Number(modelLimitMiddleware?.runLimit || Infinity);
    const toolRunLimit = Number(toolLimitMiddleware?.runLimit || Infinity);

    const customMiddlewares = middleware.filter(
      (item: any) => item?.afterModel?.hook || item?.afterAgent,
    );

    return {
      invoke: async (input: any, config?: any) => {
        const callbacks = Array.isArray(config?.callbacks)
          ? config.callbacks
          : [];
        const recursionLimit = Number(config?.recursionLimit || 25);

        const state: any = {
          messages: Array.isArray(input?.messages) ? [...input.messages] : [],
        };

        let modelTurn = 0;
        let totalToolCalls = 0;
        const toolCallsPlan: FakeToolCall[][] = Array.isArray(model?.toolCalls)
          ? model.toolCalls
          : [];

        const callCallbacks = async (callbackName: string, ...args: any[]) => {
          for (const callbackHandler of callbacks) {
            if (typeof callbackHandler?.[callbackName] === 'function') {
              await callbackHandler[callbackName](...args);
            }
          }
        };

        try {
          while (modelTurn < recursionLimit) {
            if (modelTurn >= modelRunLimit) {
              break;
            }

            const plannedToolCalls = toolCallsPlan[modelTurn] || [];

            await callCallbacks('handleLLMStart', { id: ['mock', 'model'] }, [], 'run-id');

            await callCallbacks(
              'handleLLMEnd',
              {
                llmOutput: {
                  tokenUsage: {
                    totalTokens: 1,
                    promptTokens: 1,
                    completionTokens: 0,
                  },
                },
              },
              'run-id',
            );

            const aiMessage = {
              role: 'assistant',
              content: '',
              tool_calls: plannedToolCalls,
            };

            state.messages.push(aiMessage);
            modelTurn += 1;

            let blockedToolCallIds = new Set<string>();

            for (const currentMiddleware of customMiddlewares) {
              const hook = currentMiddleware?.afterModel?.hook;
              if (typeof hook !== 'function') {
                continue;
              }

              const middlewareResult = await hook(state);
              if (!middlewareResult) {
                continue;
              }

              const extractedMessages = Array.isArray(middlewareResult.messages)
                ? middlewareResult.messages
                : middlewareResult.messages
                  ? [middlewareResult.messages]
                  : [];

              if (extractedMessages.length > 0) {
                state.messages.push(...extractedMessages);
                for (const currentMessage of extractedMessages) {
                  if (
                    currentMessage?.status === 'error' &&
                    typeof currentMessage?.tool_call_id === 'string'
                  ) {
                    blockedToolCallIds.add(currentMessage.tool_call_id);
                  }
                }
              }

              for (const [key, value] of Object.entries(middlewareResult)) {
                if (key === 'messages') {
                  continue;
                }
                (state as any)[key] = value;
              }
            }

            if (plannedToolCalls.length === 0) {
              break;
            }

            for (const plannedToolCall of plannedToolCalls) {
              if (blockedToolCallIds.has(plannedToolCall.id)) {
                continue;
              }

              if (totalToolCalls >= toolRunLimit) {
                if (toolLimitMiddleware?.exitBehavior === 'error') {
                  throw new Error('Tool call limit exceeded');
                }
                if (toolLimitMiddleware?.exitBehavior === 'continue') {
                  continue;
                }
                break;
              }

              const currentTool = toolsMap.get(plannedToolCall.name);
              if (!currentTool) {
                continue;
              }

              totalToolCalls += 1;

              await callCallbacks(
                'handleToolStart',
                { id: ['tools', plannedToolCall.name] },
                JSON.stringify(plannedToolCall.args || {}),
                'run-id',
              );

              try {
                const toolResult = await currentTool.invoke(
                  plannedToolCall.args || {},
                  {
                    context: config?.context,
                  },
                );

                const output =
                  typeof toolResult === 'string'
                    ? toolResult
                    : JSON.stringify(toolResult);

                state.messages.push({
                  role: 'tool',
                  name: plannedToolCall.name,
                  tool_call_id: plannedToolCall.id,
                  content: output,
                });

                await callCallbacks('handleToolEnd', output, 'run-id');
              } catch (error: any) {
                await callCallbacks('handleToolError', error, 'run-id');
                throw error;
              }
            }
          }

          if (modelTurn >= recursionLimit) {
            throw new Error(
              `Recursion limit of ${recursionLimit} reached without hitting a stop condition.`,
            );
          }

          const responseMessage = {
            role: 'assistant',
            content: 'done',
          };

          const finalOutput = {
            messages: [...state.messages, responseMessage],
          };

          await callCallbacks(
            'handleAgentEnd',
            {
              returnValues: finalOutput,
            },
            'run-id',
          );

          for (const currentMiddleware of customMiddlewares) {
            const afterAgent = currentMiddleware?.afterAgent;
            if (typeof afterAgent === 'function') {
              const result = await afterAgent(state);
              if (result && typeof result === 'object') {
                for (const [key, value] of Object.entries(result)) {
                  (state as any)[key] = value;
                }
              }
            }
          }

          return finalOutput;
        } catch (error: any) {
          await callCallbacks('handleChainError', error, 'run-id');
          throw error;
        }
      },
    };
  };

  return {
    tool,
    createAgent,
    createMiddleware,
    modelCallLimitMiddleware,
    modelFallbackMiddleware,
    toolCallLimitMiddleware,
  };
});

function buildIncomingMessage(body: string) {
  return [
    {
      id: { _serialized: 'wamid.test-message-1' },
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

function createTestTools() {
  const replyHandler = jest
    .fn()
    .mockResolvedValue(JSON.stringify({ success: true, sent: true }));
  const searchProductsHandler = jest.fn().mockResolvedValue(
    JSON.stringify({
      success: true,
      products: [],
      query: 'maillot barca',
      count: 0,
      method: 'vector_search',
    }),
  );
  const getHistoryHandler = jest.fn().mockResolvedValue(
    JSON.stringify({
      success: true,
      messages: [],
      count: 0,
    }),
  );

  const replyTool = tool(replyHandler, {
    name: 'reply_to_message',
    description: 'Reply to the current user message',
    schema: z.object({
      message: z.string(),
      quotedMessageId: z.string().optional(),
    }),
  });

  const searchProductsTool = tool(searchProductsHandler, {
    name: 'search_products',
    description: 'Search products by query',
    schema: z.object({
      query: z.string(),
      maxResults: z.number().optional(),
    }),
  });

  const getMessageHistoryTool = tool(getHistoryHandler, {
    name: 'get_message_history',
    description: 'Get message history for the current chat',
    schema: z.object({
      limit: z.number().optional(),
      includeMedia: z.boolean().optional(),
    }),
  });

  return {
    handlers: {
      replyHandler,
      searchProductsHandler,
      getHistoryHandler,
    },
    toolsByService: {
      communicationTools: [] as any[],
      catalogTools: [searchProductsTool],
      chatTools: [replyTool],
      groupTools: [] as any[],
      labelsTools: [] as any[],
      memoryTools: [] as any[],
      messagesTools: [getMessageHistoryTool],
      intentTools: [] as any[],
    },
  };
}

async function buildServiceWithScenario(toolCalls: FakeToolCall[][]) {
  WA_MODEL_STATE.toolCalls = toolCalls;

  const { handlers, toolsByService } = createTestTools();

  const backendClient = {
    fetchMetadataList: jest.fn().mockResolvedValue({ success: true, data: {} }),
    canProcess: jest.fn().mockResolvedValue({
      allowed: true,
      agentContext: 'Test context',
      managementGroupId: '120363000000000000@g.us',
      agentId: 'agent-test-1',
      authorizedGroups: [],
    }),
    logOperation: jest.fn().mockResolvedValue({
      success: true,
      operationId: 'op_test_1',
    }),
  };

  const configValues: Record<string, string | undefined> = {
    PRIMARY_MODEL: 'grok',
    FALLBACK_MODEL: 'none',
    XAI_API_KEY: 'test-key',
    XAI_MODEL: 'grok-test-model',
    AGENT_RECURSION_LIMIT: '30',
    AGENT_EXPERIMENT_5_TOOLS: 'false',
  };

  const configService = {
    get: jest.fn((key: string) => configValues[key]),
  };

  const sanitizationService = {
    sanitizeUserInput: jest.fn((value: string) => value),
    validateInput: jest.fn(() => ({ valid: true })),
    sanitizeAgentResponse: jest.fn((value: string) => value),
  };

  const rateLimitService = {
    checkRateLimit: jest.fn().mockResolvedValue({ limited: false }),
  };

  const systemPromptService = {
    buildSystemPrompt: jest.fn().mockReturnValue('System prompt test'),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      WhatsAppAgentService,
      { provide: ConfigService, useValue: configService },
      {
        provide: CommunicationTools,
        useValue: { createTools: jest.fn(() => toolsByService.communicationTools) },
      },
      {
        provide: CatalogTools,
        useValue: { createTools: jest.fn(() => toolsByService.catalogTools) },
      },
      {
        provide: ChatTools,
        useValue: { createTools: jest.fn(() => toolsByService.chatTools) },
      },
      {
        provide: GroupTools,
        useValue: { createTools: jest.fn(() => toolsByService.groupTools) },
      },
      {
        provide: LabelsTools,
        useValue: { createTools: jest.fn(() => toolsByService.labelsTools) },
      },
      {
        provide: MemoryTools,
        useValue: { createTools: jest.fn(() => toolsByService.memoryTools) },
      },
      {
        provide: MessagesTools,
        useValue: { createTools: jest.fn(() => toolsByService.messagesTools) },
      },
      {
        provide: IntentTools,
        useValue: { createTools: jest.fn(() => toolsByService.intentTools) },
      },
      { provide: SanitizationService, useValue: sanitizationService },
      { provide: RateLimitService, useValue: rateLimitService },
      { provide: BackendClientService, useValue: backendClient },
      { provide: ConnectorClientService, useValue: {} },
      { provide: PageScriptService, useValue: {} },
      { provide: SystemPromptService, useValue: systemPromptService },
    ],
  }).compile();

  const service = module.get(WhatsAppAgentService);

  return {
    service,
    module,
    handlers,
    backendClient,
  };
}

describe('WhatsAppAgentService Agent E2E (mocked langchain runtime)', () => {
  afterEach(() => {
    jest.clearAllMocks();
    WA_MODEL_STATE.toolCalls = [];
  });

  it('executes a single tool call in a simple run', async () => {
    const { service, module, handlers, backendClient } =
      await buildServiceWithScenario([
        [
          {
            id: 'call-reply-1',
            name: 'reply_to_message',
            args: { message: 'Bonjour, je peux vous aider ?' },
          },
        ],
        [],
      ]);

    await service.processIncomingMessage(
      buildIncomingMessage('Bonjour') as any,
      '237675075643@c.us',
    );

    expect(handlers.replyHandler).toHaveBeenCalledTimes(1);
    expect(handlers.searchProductsHandler).not.toHaveBeenCalled();
    expect(backendClient.logOperation).toHaveBeenCalledTimes(1);

    const logPayload = backendClient.logOperation.mock.calls[0][0];
    expect(logPayload.status).toBe('success');
    expect(logPayload.toolsUsed.map((toolUsed: any) => toolUsed.name)).toEqual(
      expect.arrayContaining(['reply_to_message']),
    );

    await module.close();
  });

  it('executes multiple tools in the same model turn', async () => {
    const { service, module, handlers, backendClient } =
      await buildServiceWithScenario([
        [
          {
            id: 'call-search-1',
            name: 'search_products',
            args: { query: 'maillot barca', maxResults: 5 },
          },
          {
            id: 'call-reply-1',
            name: 'reply_to_message',
            args: {
              message:
                "Je vérifie le catalogue et je reviens vers vous immédiatement.",
            },
          },
        ],
        [],
      ]);

    await service.processIncomingMessage(
      buildIncomingMessage('Vous avez un maillot du Barça ?') as any,
      '237675075643@c.us',
    );

    expect(handlers.searchProductsHandler).toHaveBeenCalledTimes(1);
    expect(handlers.replyHandler).toHaveBeenCalledTimes(1);
    expect(backendClient.logOperation).toHaveBeenCalledTimes(1);

    const logPayload = backendClient.logOperation.mock.calls[0][0];
    expect(logPayload.status).toBe('success');
    expect(logPayload.toolsUsed.map((toolUsed: any) => toolUsed.name)).toEqual(
      expect.arrayContaining(['search_products', 'reply_to_message']),
    );

    await module.close();
  });

  it('executes sequential tool calls across multiple model turns', async () => {
    const { service, module, handlers, backendClient } =
      await buildServiceWithScenario([
        [
          {
            id: 'call-search-1',
            name: 'search_products',
            args: { query: 'maillot barca' },
          },
        ],
        [
          {
            id: 'call-history-1',
            name: 'get_message_history',
            args: { limit: 5 },
          },
        ],
        [
          {
            id: 'call-reply-1',
            name: 'reply_to_message',
            args: { message: 'Je vous propose des alternatives disponibles.' },
          },
        ],
        [],
      ]);

    await service.processIncomingMessage(
      buildIncomingMessage('Je cherche un maillot du Barça') as any,
      '237675075643@c.us',
    );

    expect(handlers.searchProductsHandler).toHaveBeenCalledTimes(1);
    expect(handlers.getHistoryHandler).toHaveBeenCalledTimes(1);
    expect(handlers.replyHandler).toHaveBeenCalledTimes(1);
    expect(backendClient.logOperation).toHaveBeenCalledTimes(1);

    const logPayload = backendClient.logOperation.mock.calls[0][0];
    expect(logPayload.toolsUsed.map((toolUsed: any) => toolUsed.name)).toEqual(
      expect.arrayContaining([
        'search_products',
        'get_message_history',
        'reply_to_message',
      ]),
    );

    await module.close();
  });

  it('blocks duplicate side-effect tool calls in the same run (anti-loop guard)', async () => {
    const { service, module, handlers, backendClient } =
      await buildServiceWithScenario([
        [
          {
            id: 'call-reply-1',
            name: 'reply_to_message',
            args: { message: 'Première réponse.' },
          },
        ],
        [
          {
            id: 'call-reply-2',
            name: 'reply_to_message',
            args: { message: 'Deuxième réponse non autorisée.' },
          },
        ],
        [],
      ]);

    await service.processIncomingMessage(
      buildIncomingMessage('Bonjour') as any,
      '237675075643@c.us',
    );

    expect(handlers.replyHandler).toHaveBeenCalledTimes(1);
    expect(backendClient.logOperation).toHaveBeenCalledTimes(1);

    const logPayload = backendClient.logOperation.mock.calls[0][0];
    expect(logPayload.status).toBe('success');

    await module.close();
  });

  it('handles search_products flow without branch routing crash regression', async () => {
    const { service, module, handlers, backendClient } =
      await buildServiceWithScenario([
        [
          {
            id: 'call-search-only-1',
            name: 'search_products',
            args: { query: 'maillot barca' },
          },
        ],
        [],
      ]);

    await service.processIncomingMessage(
      buildIncomingMessage('Vous avez un maillot du Barça ?') as any,
      '237675075643@c.us',
    );

    expect(handlers.searchProductsHandler).toHaveBeenCalledTimes(1);
    expect(backendClient.logOperation).toHaveBeenCalledTimes(1);

    const logPayload = backendClient.logOperation.mock.calls[0][0];
    expect(logPayload.status).toBe('success');

    await module.close();
  });
});
