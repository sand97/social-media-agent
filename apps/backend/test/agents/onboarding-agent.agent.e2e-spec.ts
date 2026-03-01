/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaService } from '@app/prisma/prisma.service';
import { PromptsService } from '@app/prompts/prompts.service';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { tool } from 'langchain';
import { z } from 'zod';

import { OnboardingGateway } from '../../src/onboarding/onboarding.gateway';
import { OnboardingService } from '../../src/onboarding/onboarding.service';
import { DbToolsService, WaJsToolsService } from '../../src/onboarding/tools';

type FakeToolCall = {
  id: string;
  name: string;
  args: Record<string, any>;
};

const ONBOARDING_MODEL_STATE: {
  toolCalls: FakeToolCall[][];
  finalResponse: string;
} = {
  toolCalls: [],
  finalResponse: JSON.stringify({
    score: 45,
    context: 'Contexte de test',
    needs: ['Livraison'],
    question: 'Pouvez-vous préciser vos zones de livraison ?',
  }),
};

(globalThis as any).__ONBOARDING_MODEL_STATE__ = ONBOARDING_MODEL_STATE;

jest.mock('@sentry/nestjs', () => ({
  captureException: jest.fn(),
}));

jest.mock('@app/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('@app/prompts/prompts.service', () => ({
  PromptsService: class PromptsService {},
}));

jest.mock('../../src/onboarding/onboarding.gateway', () => ({
  OnboardingGateway: class OnboardingGateway {},
}));

jest.mock('../../src/onboarding/tools', () => ({
  DbToolsService: class DbToolsService {
    createTools() {
      return [];
    }
  },
  WaJsToolsService: class WaJsToolsService {
    createTools() {
      return [];
    }
  },
}));

jest.mock('@langchain/xai', () => ({
  ChatXAI: class ChatXAI {
    toolCalls: FakeToolCall[][];
    finalResponse: string;

    constructor() {
      this.toolCalls = ((globalThis as any).__ONBOARDING_MODEL_STATE__?.toolCalls || []) as FakeToolCall[][];
      this.finalResponse =
        ((globalThis as any).__ONBOARDING_MODEL_STATE__?.finalResponse as
          | string
          | undefined) || '';
    }
  },
}));

jest.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: class ChatGoogleGenerativeAI {
    toolCalls: FakeToolCall[][];
    finalResponse: string;

    constructor() {
      this.toolCalls = [];
      this.finalResponse = '';
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
    const modelRunLimit = Number(modelLimitMiddleware?.runLimit || Infinity);

    const wrapToolMiddlewares = middleware.filter(
      (item: any) => typeof item?.wrapToolCall === 'function',
    );

    return {
      invoke: async (input: any, config?: any) => {
        const messages = Array.isArray(input?.messages) ? [...input.messages] : [];
        const runtimeContext = config?.context || {};
        const recursionLimit = Number(config?.recursionLimit || 25);

        let modelTurn = 0;
        const toolCallsPlan: FakeToolCall[][] = Array.isArray(model?.toolCalls)
          ? model.toolCalls
          : [];

        while (modelTurn < recursionLimit && modelTurn < modelRunLimit) {
          const plannedToolCalls = toolCallsPlan[modelTurn] || [];
          messages.push({
            role: 'assistant',
            content: '',
            tool_calls: plannedToolCalls,
          });
          modelTurn += 1;

          if (plannedToolCalls.length === 0) {
            break;
          }

          for (const plannedToolCall of plannedToolCalls) {
            const currentTool = toolsMap.get(plannedToolCall.name);
            if (!currentTool) {
              continue;
            }

            const request = {
              toolCall: {
                id: plannedToolCall.id,
                name: plannedToolCall.name,
                args: plannedToolCall.args || {},
              },
              runtime: {
                context: runtimeContext,
              },
            };

            let handler = async (currentRequest: any) =>
              currentTool.invoke(currentRequest.toolCall.args, {
                context: currentRequest.runtime.context,
              });

            for (const currentMiddleware of [...wrapToolMiddlewares].reverse()) {
              const previous = handler;
              handler = (currentRequest: any) =>
                currentMiddleware.wrapToolCall(currentRequest, previous);
            }

            const toolResult = await handler(request);
            messages.push({
              role: 'tool',
              name: plannedToolCall.name,
              tool_call_id: plannedToolCall.id,
              content:
                typeof toolResult === 'string'
                  ? toolResult
                  : JSON.stringify(toolResult),
            });
          }
        }

        if (modelTurn >= recursionLimit) {
          throw new Error(
            `Recursion limit of ${recursionLimit} reached without hitting a stop condition.`,
          );
        }

        const finalResponse =
          typeof model?.finalResponse === 'string' && model.finalResponse
            ? model.finalResponse
            : JSON.stringify({
                score: 30,
                context: '',
                needs: [],
                question: 'Pouvez-vous donner plus de détails sur votre activité ?',
              });

        messages.push({ role: 'assistant', content: finalResponse });

        return { messages };
      },
    };
  };

  return {
    tool,
    createAgent,
    createMiddleware,
    modelCallLimitMiddleware,
    modelFallbackMiddleware,
  };
});

function createOnboardingTools() {
  const saveContextHandler = jest.fn().mockResolvedValue(
    JSON.stringify({
      success: true,
      stored: true,
    }),
  );

  const sendWajsHandler = jest.fn().mockResolvedValue(
    JSON.stringify({
      success: true,
      sent: true,
    }),
  );

  const saveBusinessContextTool = tool(saveContextHandler, {
    name: 'save_business_context',
    description: 'Save business context data',
    schema: z.object({
      context: z.string(),
    }),
  });

  const sendWajsMessageTool = tool(sendWajsHandler, {
    name: 'send_whatsapp_message',
    description: 'Send a WhatsApp message',
    schema: z.object({
      message: z.string(),
    }),
  });

  return {
    handlers: {
      saveContextHandler,
      sendWajsHandler,
    },
    dbTools: [saveBusinessContextTool],
    waTools: [sendWajsMessageTool],
  };
}

async function buildOnboardingServiceWithScenario(toolCalls: FakeToolCall[][]) {
  ONBOARDING_MODEL_STATE.toolCalls = toolCalls;
  ONBOARDING_MODEL_STATE.finalResponse = JSON.stringify({
    score: 70,
    context: 'Contexte enrichi',
    needs: ['Paiement', 'Livraison'],
    question: 'Quels moyens de paiement acceptez-vous ?',
  });

  const { handlers, dbTools, waTools } = createOnboardingTools();

  const prisma = {
    onboardingThread: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'thread-1',
        userId: 'user-1',
        score: 20,
        context: '',
        needs: [],
        messages: [
          {
            id: 'msg-assistant-1',
            role: 'assistant',
            content: 'Bonjour, parlez-moi de votre activité.',
            createdAt: new Date(),
          },
        ],
      }),
      update: jest.fn().mockResolvedValue({ success: true }),
    },
    threadMessage: {
      create: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'msg-user-1',
          role: 'user',
          content: 'Nous livrons dans 3 villes',
          createdAt: new Date(),
        })
        .mockResolvedValueOnce({
          id: 'msg-assistant-2',
          role: 'assistant',
          content: 'Quels moyens de paiement acceptez-vous ?',
          createdAt: new Date(),
        }),
    },
    businessInfo: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    collection: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const onboardingGateway = {
    emitToolExecuting: jest.fn(),
    emitThinking: jest.fn(),
    emitAIMessage: jest.fn(),
    emitThreadReady: jest.fn(),
    emitError: jest.fn(),
  };

  const promptsService = {
    buildConversationPrompt: jest.fn().mockReturnValue('conversation prompt'),
    buildInitialEvaluationPrompt: jest.fn().mockReturnValue('initial prompt'),
  };

  const configValues: Record<string, string | undefined> = {
    'ai.xai.apiKey': 'test-key',
    'ai.xai.model': 'grok-test-model',
    'ai.gemini.apiKey': undefined,
    'ai.gemini.model': undefined,
    PRIMARY_MODEL: 'grok',
    FALLBACK_MODEL: 'none',
  };

  const configService = {
    get: jest.fn((key: string) => configValues[key]),
  };

  const dbToolsService = {
    createTools: jest.fn(() => dbTools),
  };

  const waJsToolsService = {
    createTools: jest.fn(() => waTools),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      OnboardingService,
      { provide: PrismaService, useValue: prisma },
      { provide: ConfigService, useValue: configService },
      { provide: OnboardingGateway, useValue: onboardingGateway },
      { provide: PromptsService, useValue: promptsService },
      { provide: DbToolsService, useValue: dbToolsService },
      { provide: WaJsToolsService, useValue: waJsToolsService },
    ],
  }).compile();

  const service = module.get(OnboardingService);

  return {
    service,
    module,
    handlers,
    prisma,
    onboardingGateway,
    promptsService,
  };
}

describe('OnboardingService Agent E2E (mocked langchain runtime)', () => {
  afterEach(() => {
    jest.clearAllMocks();
    ONBOARDING_MODEL_STATE.toolCalls = [];
  });

  it('executes a single onboarding tool call', async () => {
    const { service, module, handlers, onboardingGateway, prisma } =
      await buildOnboardingServiceWithScenario([
        [
          {
            id: 'tool-db-1',
            name: 'save_business_context',
            args: { context: 'Livraison locale' },
          },
        ],
        [],
      ]);

    await service.handleUserMessage(
      {
        id: 'user-1',
        phoneNumber: '237600000000',
        status: 'PENDING',
      },
      'Nous livrons dans 3 villes',
    );

    expect(handlers.saveContextHandler).toHaveBeenCalledTimes(1);
    expect(handlers.sendWajsHandler).not.toHaveBeenCalled();
    expect(onboardingGateway.emitToolExecuting).toHaveBeenCalledWith(
      'user-1',
      'save_business_context',
    );
    expect(onboardingGateway.emitAIMessage).toHaveBeenCalledTimes(1);
    expect(prisma.onboardingThread.update).toHaveBeenCalledTimes(1);

    await module.close();
  });

  it('executes multiple onboarding tools in one run', async () => {
    const { service, module, handlers, onboardingGateway } =
      await buildOnboardingServiceWithScenario([
        [
          {
            id: 'tool-db-1',
            name: 'save_business_context',
            args: { context: 'Paiement mobile money' },
          },
          {
            id: 'tool-wa-1',
            name: 'send_whatsapp_message',
            args: { message: 'Merci pour ces infos' },
          },
        ],
        [],
      ]);

    await service.handleUserMessage(
      {
        id: 'user-1',
        phoneNumber: '237600000000',
        status: 'PENDING',
      },
      'On accepte mobile money',
    );

    expect(handlers.saveContextHandler).toHaveBeenCalledTimes(1);
    expect(handlers.sendWajsHandler).toHaveBeenCalledTimes(1);
    expect(onboardingGateway.emitToolExecuting).toHaveBeenCalledTimes(2);
    expect(onboardingGateway.emitAIMessage).toHaveBeenCalledTimes(1);

    await module.close();
  });

  it('executes sequential onboarding tools across turns', async () => {
    const { service, module, handlers, onboardingGateway } =
      await buildOnboardingServiceWithScenario([
        [
          {
            id: 'tool-db-1',
            name: 'save_business_context',
            args: { context: 'Livraison + paiement' },
          },
        ],
        [
          {
            id: 'tool-wa-1',
            name: 'send_whatsapp_message',
            args: { message: 'Context updated' },
          },
        ],
        [],
      ]);

    await service.handleUserMessage(
      {
        id: 'user-1',
        phoneNumber: '237600000000',
        status: 'PENDING',
      },
      'Nous acceptons cash et mobile money',
    );

    expect(handlers.saveContextHandler).toHaveBeenCalledTimes(1);
    expect(handlers.sendWajsHandler).toHaveBeenCalledTimes(1);
    expect(onboardingGateway.emitToolExecuting).toHaveBeenCalledTimes(2);
    expect(onboardingGateway.emitAIMessage).toHaveBeenCalledTimes(1);

    await module.close();
  });
});
