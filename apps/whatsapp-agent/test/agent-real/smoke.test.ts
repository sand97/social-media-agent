import { describe, expect, it } from 'vitest';

import { createAgent, FakeToolCallingModel, tool } from 'langchain';
import { z } from 'zod';

describe('langchain-real-smoke', () => {
  it('creates an agent with a tool', async () => {
    const echo = tool(async ({ message }: { message: string }) => message, {
      name: 'echo',
      description: 'echo',
      schema: z.object({ message: z.string() }),
    });

    const model = new FakeToolCallingModel({
      toolCalls: [[]],
    });

    const agent = createAgent({ model, tools: [echo] });

    const result = await agent.invoke({
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(result.messages.length).toBeGreaterThan(0);
  });
});
