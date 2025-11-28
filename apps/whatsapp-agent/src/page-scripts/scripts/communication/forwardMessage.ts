/**
 * Forward a message to the management group
 * Variables: TO (required), ORIGINAL_CHAT_ID (required), MESSAGE_ID (required)
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  const to = '{{TO}}';
  const originalChatId = '{{ORIGINAL_CHAT_ID}}';
  const messageId = '{{MESSAGE_ID}}';

  if (!to || to.includes('{{')) {
    throw new Error('TO is required');
  }

  if (!originalChatId || originalChatId.includes('{{')) {
    throw new Error('ORIGINAL_CHAT_ID is required');
  }

  if (!messageId || messageId.includes('{{')) {
    throw new Error('MESSAGE_ID is required');
  }

  const result = await WPP.chat.forwardMessage(to, originalChatId, [messageId]);
  return result;
})();
