import { z, type ZodTypeAny } from 'zod';
import { describe, expect, it, vi } from 'vitest';

import { DbToolsService } from '../../src/onboarding/tools/db-tools.service';
import { WaJsToolsService } from '../../src/onboarding/tools/wajs-tools.service';

type AnyTool = {
  name: string;
  schema: ZodTypeAny;
  invoke: (input: unknown, config?: unknown) => Promise<unknown>;
};

function generateFromSchema(schema: ZodTypeAny, keyPath = ''): unknown {
  const def: any = (schema as any)._def;
  const typeName = def?.typeName;

  if (typeName === z.ZodFirstPartyTypeKind.ZodOptional) {
    return undefined;
  }

  if (typeName === z.ZodFirstPartyTypeKind.ZodDefault) {
    return generateFromSchema(def.innerType, keyPath);
  }

  if (typeName === z.ZodFirstPartyTypeKind.ZodNullable) {
    return generateFromSchema(def.innerType, keyPath);
  }

  if (typeName === z.ZodFirstPartyTypeKind.ZodEffects) {
    return generateFromSchema(def.schema, keyPath);
  }

  if (typeName === z.ZodFirstPartyTypeKind.ZodObject) {
    const shape = typeof def.shape === 'function' ? def.shape() : def.shape;
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(shape)) {
      const nestedPath = keyPath ? `${keyPath}.${key}` : key;
      const generated = generateFromSchema(value as ZodTypeAny, nestedPath);
      if (generated !== undefined) {
        result[key] = generated;
      }
    }

    return result;
  }

  if (typeName === z.ZodFirstPartyTypeKind.ZodArray) {
    return [generateFromSchema(def.type, keyPath)];
  }

  if (typeName === z.ZodFirstPartyTypeKind.ZodEnum) {
    return def.values?.[0] ?? 'enum';
  }

  if (typeName === z.ZodFirstPartyTypeKind.ZodUnion) {
    return generateFromSchema(def.options[0], keyPath);
  }

  if (typeName === z.ZodFirstPartyTypeKind.ZodLiteral) {
    return def.value;
  }

  if (typeName === z.ZodFirstPartyTypeKind.ZodNumber) {
    return 1;
  }

  if (typeName === z.ZodFirstPartyTypeKind.ZodBoolean) {
    return true;
  }

  if (typeName === z.ZodFirstPartyTypeKind.ZodString) {
    const lower = keyPath.toLowerCase();

    if (lower.includes('groupid')) {
      return 'group-test@g.us';
    }

    if (lower.includes('phone')) {
      return '237600000000';
    }

    if (lower.includes('chatid')) {
      return '64845667926032@lid';
    }

    return 'test-value';
  }

  if (typeName === z.ZodFirstPartyTypeKind.ZodAny) {
    return { value: 'test' };
  }

  return null;
}

function generateToolInput(
  toolName: string,
  schema: ZodTypeAny,
): Record<string, unknown> {
  const generated = generateFromSchema(schema);
  const payload = (
    generated && typeof generated === 'object' ? generated : {}
  ) as Record<string, unknown>;

  if (toolName === 'addAuthorizedGroup') {
    payload.whatsappGroupId = 'group-test@g.us';
    payload.name = 'Support';
    payload.usage = 'Support client';
  }

  if (
    toolName === 'updateAuthorizedGroup' ||
    toolName === 'deleteAuthorizedGroup'
  ) {
    payload.groupId = 'group-db-1';
  }

  if (toolName === 'addOrRemoveLabels') {
    payload.chatId = '64845667926032@lid';
    payload.labelIds = ['label-1'];
    payload.action = 'add';
  }

  if (toolName === 'createGroup') {
    payload.name = 'Nouveau groupe';
    payload.participants = ['237600000000'];
  }

  return payload;
}

describe('Onboarding tools coverage (all tools invoke at least once)', () => {
  it('invokes every DB + WaJs tool implementation', async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-1',
          phoneNumber: '237600000000',
          status: 'PENDING',
          createdAt: new Date(),
        }),
      },
      businessInfo: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      product: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      onboardingThread: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst: vi.fn().mockResolvedValue({ score: 55 }),
      },
      group: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'group-db-1', userId: 'user-1' })
          .mockResolvedValueOnce({ id: 'group-db-1', userId: 'user-1' }),
        create: vi.fn().mockResolvedValue({
          id: 'group-db-1',
          userId: 'user-1',
          whatsappGroupId: 'group-test@g.us',
          name: 'Support',
          usage: 'Support client',
        }),
        update: vi.fn().mockResolvedValue({ id: 'group-db-1' }),
        delete: vi.fn().mockResolvedValue({ id: 'group-db-1' }),
      },
      whatsAppAgent: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'agent-1',
          userId: 'user-1',
          ipAddress: '127.0.0.1',
          connectorPort: 3001,
          port: 3002,
        }),
      },
    };

    const pageScriptService = {
      getScript: vi.fn().mockReturnValue('// fake script'),
    };

    const connectorClientService = {
      executeScript: vi.fn().mockResolvedValue({ success: true, result: [] }),
    };

    const whatsappAgentService = {
      getConnectorUrl: vi.fn().mockResolvedValue('http://localhost:3001'),
    };

    const dbToolsService = new DbToolsService(prisma as any);
    const waJsToolsService = new WaJsToolsService(
      prisma as any,
      pageScriptService as any,
      connectorClientService as any,
      whatsappAgentService as any,
    );

    const runtimeConfig = {
      context: {
        userId: 'user-1',
        user: {
          id: 'user-1',
          phoneNumber: '237600000000',
          status: 'PENDING',
        },
      },
    };

    const allTools: AnyTool[] = [
      ...(dbToolsService.createTools() as unknown as AnyTool[]),
      ...(waJsToolsService.createTools() as unknown as AnyTool[]),
    ];

    expect(allTools.length).toBe(27);

    for (const currentTool of allTools) {
      const input = generateToolInput(currentTool.name, currentTool.schema);
      const output = await currentTool.invoke(input, runtimeConfig as any);

      expect(typeof output).toBe('string');
      expect(() => JSON.parse(String(output))).not.toThrow();
    }

    expect(prisma.onboardingThread.updateMany).toHaveBeenCalled();
    expect(prisma.product.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.group.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.group.create).toHaveBeenCalledTimes(1);
    expect(prisma.group.update).toHaveBeenCalledTimes(1);
    expect(prisma.group.delete).toHaveBeenCalledTimes(1);

    expect(pageScriptService.getScript).toHaveBeenCalled();
    expect(connectorClientService.executeScript).toHaveBeenCalled();
    expect(whatsappAgentService.getConnectorUrl).toHaveBeenCalled();
  });
});
