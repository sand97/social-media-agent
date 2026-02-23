import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { AgentRequestContext } from '../guards/agent-internal.guard';

export const AgentContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AgentRequestContext => {
    const request = ctx.switchToHttp().getRequest<{
      agentContext?: AgentRequestContext;
    }>();

    if (!request.agentContext) {
      throw new Error(
        'Agent context not found in request. Did you forget AgentInternalGuard?',
      );
    }

    return request.agentContext;
  },
);
