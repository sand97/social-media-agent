import { z, type ZodTypeAny } from 'zod';
import { describe, expect, it, vi } from 'vitest';

import { CatalogTools } from '../../src/tools/catalog/catalog.tools';
import { ChatTools } from '../../src/tools/chat/chat.tools';
import { CommunicationTools } from '../../src/tools/communication/communication.tools';
import { GroupTools } from '../../src/tools/group/group.tools';
import { IntentTools } from '../../src/tools/intent/intent.tools';
import { LabelsTools } from '../../src/tools/labels/labels.tools';
import { MemoryTools } from '../../src/tools/memory/memory.tools';
import { MessagesTools } from '../../src/tools/messages/messages.tools';

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
    if (keyPath.toLowerCase().includes('timestamp')) {
      return Date.now() + 60 * 60 * 1000;
    }
    return 1;
  }

  if (typeName === z.ZodFirstPartyTypeKind.ZodBoolean) {
    return true;
  }

  if (typeName === z.ZodFirstPartyTypeKind.ZodString) {
    const lower = keyPath.toLowerCase();

    if (lower.includes('scheduledfor')) {
      return new Date(Date.now() + 60 * 60 * 1000).toISOString();
    }

    if (lower.includes('groupid')) {
      return 'group-test@g.us';
    }

    if (lower.includes('chatid')) {
      return '64845667926032@lid';
    }

    if (lower.includes('contactid')) {
      return '237675075643@c.us';
    }

    if (lower.includes('messageid')) {
      return 'true_64845667926032@lid_ABC123';
    }

    if (lower.includes('metadata')) {
      return '{}';
    }

    if (lower.includes('phonenumber')) {
      return '237600000000';
    }

    return 'test-value';
  }

  if (typeName === z.ZodFirstPartyTypeKind.ZodAny) {
    return { value: 'test' };
  }

  if (typeName === z.ZodFirstPartyTypeKind.ZodRecord) {
    return {};
  }

  return null;
}

function generateToolInput(toolName: string, schema: ZodTypeAny): Record<string, unknown> {
  const generated = generateFromSchema(schema);
  const payload = (generated && typeof generated === 'object'
    ? generated
    : {}) as Record<string, unknown>;

  if (toolName === 'notify_authorized_group') {
    payload.groupId = 'group-test@g.us';
    payload.message = 'Message de test au groupe';
  }

  if (toolName === 'send_to_admin_group') {
    payload.message = 'Escalade test';
  }

  if (toolName === 'schedule_intention') {
    payload.scheduledFor = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    payload.reason = 'Follow-up test';
    payload.conditionToCheck = 'customer_replied';
    payload.actionIfFalse = 'send reminder';
    payload.metadata = '{}';
  }

  return payload;
}

describe('WhatsApp tools coverage (all tools invoke at least once)', () => {
  it('invokes every tool implementation with mocked dependencies', async () => {
    const connectorClient = {
      executeScript: vi.fn().mockResolvedValue({ success: true, result: [] }),
      sendMessage: vi.fn().mockResolvedValue({ success: true, messageId: 'msg1' }),
    };

    const scriptService = {
      getScript: vi.fn().mockReturnValue('// fake script'),
    };

    const productSendService = {
      sendProducts: vi.fn().mockResolvedValue({ success: true }),
      sendCollection: vi.fn().mockResolvedValue({ success: true }),
    };

    const contactResolver = {
      resolveContactNumber: vi.fn().mockResolvedValue('237600000000'),
    };

    const adminGroupMessagingService = {
      sendToManagementGroup: vi.fn().mockResolvedValue({ success: true }),
    };

    const catalogSearch = {
      searchProducts: vi.fn().mockResolvedValue({
        success: true,
        products: [],
      }),
    };

    const prisma = {
      conversationMemory: {
        create: vi.fn().mockResolvedValue({ id: 'memory-1' }),
      },
      getChatMemories: vi.fn().mockResolvedValue([]),
    };

    const queueService = {
      scheduleIntention: vi.fn().mockResolvedValue({ intentionId: 'intent-1' }),
      cancelIntention: vi.fn().mockResolvedValue({ success: true }),
      getPendingIntentions: vi.fn().mockResolvedValue([
        {
          id: 'intent-1',
          type: 'FOLLOW_UP',
          reason: 'test',
          scheduledFor: new Date(Date.now() + 60 * 60 * 1000),
          conditionToCheck: 'customer_replied',
        },
      ]),
    };

    const runtimeConfig = {
      context: {
        chatId: '64845667926032@lid',
        contactId: '237675075643@c.us',
        managementGroupId: '120363000000000000@g.us',
        authorizedGroups: [
          {
            whatsappGroupId: 'group-test@g.us',
            usage: 'Support',
            name: 'Support Team',
          },
        ],
      },
    };

    const services = [
      new CommunicationTools(
        connectorClient as any,
        scriptService as any,
        productSendService as any,
        contactResolver as any,
      ),
      new CatalogTools(
        connectorClient as any,
        catalogSearch as any,
        scriptService as any,
      ),
      new ChatTools(
        connectorClient as any,
        scriptService as any,
        contactResolver as any,
        adminGroupMessagingService as any,
      ),
      new GroupTools(connectorClient as any, scriptService as any),
      new LabelsTools(connectorClient as any, scriptService as any),
      new MemoryTools(prisma as any),
      new MessagesTools(connectorClient as any, queueService as any, scriptService as any),
      new IntentTools(),
    ];

    const allTools: AnyTool[] = services.flatMap((service) =>
      (service.createTools() as AnyTool[]) || [],
    );

    expect(allTools.length).toBe(31);

    for (const currentTool of allTools) {
      const input = generateToolInput(currentTool.name, currentTool.schema);
      const output = await currentTool.invoke(input, runtimeConfig as any);

      expect(typeof output).toBe('string');
      expect(() => JSON.parse(String(output))).not.toThrow();
    }

    expect(scriptService.getScript).toHaveBeenCalled();
    expect(connectorClient.executeScript).toHaveBeenCalled();
    expect(queueService.scheduleIntention).toHaveBeenCalledTimes(1);
    expect(queueService.cancelIntention).toHaveBeenCalledTimes(1);
    expect(queueService.getPendingIntentions).toHaveBeenCalledTimes(1);
    expect(prisma.conversationMemory.create).toHaveBeenCalledTimes(1);
    expect(prisma.getChatMemories).toHaveBeenCalledTimes(1);
    expect(catalogSearch.searchProducts).toHaveBeenCalledTimes(1);
    expect(adminGroupMessagingService.sendToManagementGroup).toHaveBeenCalledTimes(1);
  });
});
