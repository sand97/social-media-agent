import { tool } from 'langchain';
import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { PrismaService } from '../../src/prisma/prisma.service';
import { PromptsService } from '../../src/prompts/prompts.service';
import { OnboardingGateway } from '../../src/onboarding/onboarding.gateway';
import { OnboardingService } from '../../src/onboarding/onboarding.service';
import { DbToolsService, WaJsToolsService } from '../../src/onboarding/tools';

type LiveModelConfig = {
  canRun: boolean;
  reason?: string;
  values: Record<string, string | undefined>;
};

type Scenario = {
  name: string;
  prompt: string;
  mustInclude: string[];
  mustExclude: string[];
};

function resolveLiveModelConfig(): LiveModelConfig {
  if (process.env.GEMINI_API_KEY) {
    return {
      canRun: true,
      values: {
        'ai.gemini.apiKey': process.env.GEMINI_API_KEY,
        'ai.gemini.model': process.env.GEMINI_MODEL || 'gemini-2.0-flash',
        'ai.xai.apiKey': process.env.XAI_API_KEY,
        'ai.xai.model': process.env.XAI_MODEL || 'grok-beta',
        PRIMARY_MODEL: 'gemini',
        FALLBACK_MODEL: 'none',
      },
    };
  }

  if (process.env.XAI_API_KEY) {
    return {
      canRun: true,
      values: {
        'ai.xai.apiKey': process.env.XAI_API_KEY,
        'ai.xai.model': process.env.XAI_MODEL || 'grok-beta',
        'ai.gemini.apiKey': process.env.GEMINI_API_KEY,
        'ai.gemini.model': process.env.GEMINI_MODEL || 'gemini-2.0-flash',
        PRIMARY_MODEL: 'grok',
        FALLBACK_MODEL: 'none',
      },
    };
  }

  return {
    canRun: false,
    reason: 'No GEMINI_API_KEY or XAI_API_KEY found.',
    values: {},
  };
}

function createConfigService(values: Record<string, string | undefined>) {
  return {
    get: vi.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

function createAgentTools() {
  const callLog: string[] = [];

  const saveBusinessContextHandler = vi
    .fn(async (args: { context: string }) => {
      callLog.push('save_business_context');
      return JSON.stringify({
        success: true,
        stored: true,
        context: args.context,
      });
    })
    .mockName('save_business_context');

  const sendWhatsappMessageHandler = vi
    .fn(async (args: { message: string }) => {
      callLog.push('send_whatsapp_message');
      return JSON.stringify({
        success: true,
        sent: true,
        message: args.message,
      });
    })
    .mockName('send_whatsapp_message');

  const dbTool = tool(saveBusinessContextHandler, {
    name: 'save_business_context',
    description:
      'Persist structured onboarding business context collected during conversation.',
    schema: z.object({ context: z.string() }),
  });

  const waTool = tool(sendWhatsappMessageHandler, {
    name: 'send_whatsapp_message',
    description:
      'Send a WhatsApp message to the onboarding user after processing.',
    schema: z.object({ message: z.string() }),
  });

  return {
    callLog,
    handlers: {
      saveBusinessContextHandler,
      sendWhatsappMessageHandler,
    },
    dbTools: [dbTool],
    waTools: [waTool],
  };
}

async function createService(modelConfig: LiveModelConfig) {
  const { callLog, handlers, dbTools, waTools } = createAgentTools();

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

  const promptsService = {
    buildInitialEvaluationPrompt: vi.fn(),
    buildConversationPrompt: vi.fn(),
  };

  const dbToolsService = { createTools: () => dbTools };
  const waJsToolsService = { createTools: () => waTools };

  const service = new OnboardingService(
    prisma as unknown as PrismaService,
    createConfigService(modelConfig.values),
    onboardingGateway as unknown as OnboardingGateway,
    promptsService as unknown as PromptsService,
    dbToolsService as unknown as DbToolsService,
    waJsToolsService as unknown as WaJsToolsService,
  );

  return {
    service,
    callLog,
    handlers,
    onboardingGateway,
  };
}

const scenarios: Scenario[] = [
  {
    name: 'single-tool run (save context only)',
    prompt: [
      'Mode test QA.',
      'Tu dois appeler exactement une seule fois le tool save_business_context.',
      "Ne dois pas appeler send_whatsapp_message dans ce scénario.",
      "Contexte à sauvegarder: 'Livraison locale, paiement mobile money'.",
      'Après le tool, termine la réponse.',
    ].join('\n'),
    mustInclude: ['save_business_context'],
    mustExclude: ['send_whatsapp_message'],
  },
  {
    name: 'multi-tool run (save context then send message)',
    prompt: [
      'Mode test QA.',
      'Tu dois appeler exactement une fois save_business_context.',
      "Ensuite tu dois appeler exactement une fois send_whatsapp_message.",
      "Contexte: 'Stock principal à Douala, livraison sous 48h'.",
      "Message WhatsApp: 'Merci, j’ai bien enregistré vos infos.'",
      'Après ces deux tools, termine la réponse.',
    ].join('\n'),
    mustInclude: ['save_business_context', 'send_whatsapp_message'],
    mustExclude: [],
  },
];

const modelConfig = resolveLiveModelConfig();
const liveEnabled = process.env.AGENT_LIVE_TESTS === 'true';
const runLiveSuite = liveEnabled && modelConfig.canRun;
const describeLive = runLiveSuite ? describe : describe.skip;

describeLive('Onboarding agent live-model tool routing (_TESTS_)', () => {
  it.each(scenarios)('$name', async (scenario) => {
    const { service, callLog, handlers, onboardingGateway } =
      await createService(modelConfig);

    const result = await (service as any).executeToolsLoop(
      'user-live-1',
      scenario.prompt,
      undefined,
      {
        id: 'user-live-1',
        phoneNumber: '237600000000',
        status: 'PENDING',
      },
    );

    expect(typeof result).toBe('string');

    for (const toolName of scenario.mustInclude) {
      expect(callLog).toContain(toolName);
    }
    for (const toolName of scenario.mustExclude) {
      expect(callLog).not.toContain(toolName);
    }

    expect(handlers.saveBusinessContextHandler).toHaveBeenCalledTimes(
      scenario.mustInclude.includes('save_business_context') ? 1 : 0,
    );
    expect(handlers.sendWhatsappMessageHandler).toHaveBeenCalledTimes(
      scenario.mustInclude.includes('send_whatsapp_message') ? 1 : 0,
    );

    expect(onboardingGateway.emitToolExecuting).toHaveBeenCalledTimes(
      scenario.mustInclude.length,
    );
  });
});

if (!runLiveSuite) {
  const why = !liveEnabled
    ? 'AGENT_LIVE_TESTS is not set to true.'
    : (modelConfig.reason ?? 'No compatible model config.');
  // eslint-disable-next-line no-console
  console.warn(`[live-tests][backend] skipped: ${why}`);
}
