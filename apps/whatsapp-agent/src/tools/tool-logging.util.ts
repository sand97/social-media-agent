import { Logger } from '@nestjs/common';

function preview(value: unknown, maxLength = 260): string {
  try {
    const raw =
      typeof value === 'string'
        ? value
        : JSON.stringify(value) || String(value);
    return raw.length > maxLength ? `${raw.slice(0, maxLength)}...` : raw;
  } catch {
    return '[unserializable]';
  }
}

/**
 * Wrap tool.invoke() to log start/end/error for every tool implementation.
 * This keeps per-tool visibility without duplicating logging code in each tool body.
 */
export function instrumentTools<T>(
  logger: Logger,
  source: string,
  tools: T[],
): T[] {
  for (const tool of tools) {
    const anyTool = tool as any;
    if (!anyTool || typeof anyTool.invoke !== 'function') {
      continue;
    }
    if (anyTool.__invokeLoggingWrapped) {
      continue;
    }

    const toolName = String(anyTool.name || 'unknown_tool');
    const originalInvoke = anyTool.invoke.bind(anyTool);
    anyTool.__invokeLoggingWrapped = true;

    anyTool.invoke = async (input: unknown, config?: any) => {
      const chatId = config?.context?.chatId || 'n/a';
      logger.log(
        `[${source}] TOOL_START name=${toolName} chatId=${chatId} input=${preview(input)}`,
      );

      try {
        const result = await originalInvoke(input, config);
        logger.debug(
          `[${source}] TOOL_END name=${toolName} chatId=${chatId} result=${preview(result)}`,
        );
        return result;
      } catch (error: any) {
        logger.error(
          `[${source}] TOOL_ERROR name=${toolName} chatId=${chatId} error=${error?.message || error}`,
        );
        throw error;
      }
    };
  }

  return tools;
}
