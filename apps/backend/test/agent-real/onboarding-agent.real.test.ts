import { tool } from 'langchain';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { PrismaService } from '../../src/prisma/prisma.service';
import { PromptsService } from '../../src/prompts/prompts.service';
import { OnboardingGateway } from '../../src/onboarding/onboarding.gateway';
import { OnboardingService } from '../../src/onboarding/onboarding.service';
import { DbToolsService, WaJsToolsService } from '../../src/onboarding/tools';

const state = vi.hoisted(() => ({
  toolCalls: [] as Array<Array<{ id: string; name: string; args: Record<string, any> }>>,
}));

vi.mock('@langchain/xai', async () => {
  const langchain = await vi.importActual<typeof import('langchain')>('langchain');

  class ChatXAI extends langchain.FakeToolCallingModel {
    constructor() {
      super({ toolCalls: state.toolCalls });
    }
  }

  return { ChatXAI };
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

function createAgentTools() {
  const dbHandler = vi.fn().mockResolvedValue(JSON.stringify({ success: true }));
  const waHandler = vi.fn().mockResolvedValue(JSON.stringify({ success: true }));

  const dbTool = tool(dbHandler, {
    name: 'save_business_context',
    description: 'Save context',
    schema: z.object({ context: z.string() }),
  });

  const waTool = tool(waHandler, {
    name: 'send_whatsapp_message',
    description: 'Send WA message',
    schema: z.object({ message: z.string() }),
  });

  return {
    handlers: { dbHandler, waHandler },
    dbTools: [dbTool],
    waTools: [waTool],
  };
}

async function createService(
  toolCalls: Array<Array<{ id: string; name: string; args: Record<string, any> }>>,
) {
  state.toolCalls = toolCalls;

  const { handlers, dbTools, waTools } = createAgentTools();

  const prisma = {
    onboardingThread: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn().mockResolvedValue({ score: 55 }),
    },
    threadMessage: {
      count: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
    },
    user: {
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    businessInfo: { findUnique: vi.fn().mockResolvedValue(null) },
    collection: { findMany: vi.fn().mockResolvedValue([]) },
    group: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    product: { findMany: vi.fn().mockResolvedValue([]) },
  };

  const onboardingGateway = {
    emitToolExecuting: vi.fn(),
    emitThinking: vi.fn(),
    emitAIMessage: vi.fn(),
    emitThreadReady: vi.fn(),
    emitError: vi.fn(),
  };

  const configService = {
    get: vi.fn((key: string) => {
      const values: Record<string, string | undefined> = {
        'ai.xai.apiKey': 'test-key',
        'ai.xai.model': 'fake-grok',
        'ai.gemini.apiKey': undefined,
        'ai.gemini.model': undefined,
        PRIMARY_MODEL: 'grok',
        FALLBACK_MODEL: 'none',
      };
      return values[key];
    }),
  };

  const promptsService = {
    buildInitialEvaluationPrompt: vi.fn(),
    buildConversationPrompt: vi.fn(),
  };

  const dbToolsService = { createTools: vi.fn(() => dbTools) };
  const waJsToolsService = { createTools: vi.fn(() => waTools) };

  const service = new OnboardingService(
    prisma as unknown as PrismaService,
    configService as unknown as ConfigService,
    onboardingGateway as unknown as OnboardingGateway,
    promptsService as unknown as PromptsService,
    dbToolsService as unknown as DbToolsService,
    waJsToolsService as unknown as WaJsToolsService,
  );

  return {
    service,
    handlers,
    onboardingGateway,
  };
}

describe('Onboarding agent integration (real LangChain runtime)', () => {
  beforeEach(() => {
    state.toolCalls = [];
  });

  it('executes one tool', async () => {
    const { service, handlers, onboardingGateway } = await createService([
      [
        {
          id: 'db-1',
          name: 'save_business_context',
          args: { context: 'Livraison locale' },
        },
      ],
      [],
    ]);

    const result = await (service as any).executeToolsLoop('user-1', 'prompt', undefined, {
      id: 'user-1',
      phoneNumber: '237600000000',
      status: 'PENDING',
    });

    expect(typeof result).toBe('string');
    expect(handlers.dbHandler).toHaveBeenCalledTimes(1);
    expect(handlers.waHandler).toHaveBeenCalledTimes(0);
    expect(onboardingGateway.emitToolExecuting).toHaveBeenCalledWith('user-1', 'save_business_context');
  });

  it('executes multiple tools across turns', async () => {
    const { service, handlers, onboardingGateway } = await createService([
      [
        {
          id: 'db-1',
          name: 'save_business_context',
          args: { context: 'Paiement mobile money' },
        },
      ],
      [
        {
          id: 'wa-1',
          name: 'send_whatsapp_message',
          args: { message: 'Merci pour les infos' },
        },
      ],
      [],
    ]);

    await (service as any).executeToolsLoop('user-1', 'prompt', undefined, {
      id: 'user-1',
      phoneNumber: '237600000000',
      status: 'PENDING',
    });

    expect(handlers.dbHandler).toHaveBeenCalledTimes(1);
    expect(handlers.waHandler).toHaveBeenCalledTimes(1);
    expect(onboardingGateway.emitToolExecuting).toHaveBeenCalledTimes(2);
  });
});
