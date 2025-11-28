/**
 * Get older messages from a chat
 * Variables: CHAT_ID (required), LIMIT (optional, default 20)
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  const chatId = '{{CHAT_ID}}';
  if (!chatId || chatId.includes('{{')) {
    throw new Error('CHAT_ID is required');
  }

  const limit = parseInt('{{LIMIT}}') || 20;

  const messages = await WPP.chat.getMessages(chatId, limit);

  return messages.map((m) => ({
    id: m.id,
    body: m.body,
    from: m.from,
    fromMe: m.fromMe,
    timestamp: m.timestamp,
    type: m.type,
    hasMedia: m.hasMedia,
  }));
})();
