/**
 * Forward a message to the management group
 * Variables: TO (required), ORIGINAL_CHAT_ID (required), MESSAGE_ID (required)
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  try {
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

    const result = await window.WPP.chat.forwardMessage(to, originalChatId, [
      messageId,
    ]);
    return result;
  } catch (error) {
    console.error('Failed to forward message:', error);
    throw error;
  }
})();
