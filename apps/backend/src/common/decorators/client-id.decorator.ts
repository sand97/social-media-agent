import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorator pour extraire le clientId du token JWT
 * Le clientId doit être présent dans le payload du token
 */
export const ClientId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();

    // Le clientId sera injecté par le guard
    const clientId = request.clientId;

    if (!clientId) {
      throw new Error(
        'ClientId not found in request. Did you forget to apply the guard?',
      );
    }

    return clientId;
  },
);
