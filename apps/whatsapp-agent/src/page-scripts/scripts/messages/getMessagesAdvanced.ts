/**
 * Get messages from a chat with advanced options
 * Variables:
 * - CHAT_ID (required): Chat ID
 * - COUNT (optional, default: 20): Number of messages to retrieve
 * - DIRECTION (optional, default: 'before'): 'before' or 'after' a reference message
 * - MESSAGE_ID (optional): Reference message ID for directional fetching
 * - ONLY_UNREAD (optional, default: false): Only fetch unread messages
 *
 * Examples:
 * - Get 20 most recent messages: { CHAT_ID: '123@c.us', COUNT: 20 }
 * - Get 20 messages before a specific message: { CHAT_ID: '123@c.us', COUNT: 20, DIRECTION: 'before', MESSAGE_ID: 'false_123@c.us_3A...' }
 * - Get all unread messages: { CHAT_ID: '123@c.us', COUNT: -1, ONLY_UNREAD: true }
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  try {
    const chatId = '{{CHAT_ID}}';
    if (!chatId || chatId.includes('{{')) {
      throw new Error('CHAT_ID is required');
    }

    const count = parseInt('{{COUNT}}') || 20;
    const direction = '{{DIRECTION}}' || 'before';
    const messageId =
      '{{MESSAGE_ID}}' === '{{MESSAGE_ID}}' ? undefined : '{{MESSAGE_ID}}';
    const onlyUnread = '{{ONLY_UNREAD}}' === 'true';

    console.log('[GetMessagesAdvanced] Fetching messages with params:', {
      chatId,
      count,
      direction,
      messageId,
      onlyUnread,
    });

    // Build options for WPP.chat.getMessages
    const options = {
      count,
      onlyUnread,
    };

    // Add direction and message ID if specified
    if (messageId && direction) {
      options.direction = direction;
      options.id = messageId;
    }

    console.log('[GetMessagesAdvanced] WPP options:', options);

    // Fetch messages using WPP API
    const rawMessages = await window.WPP.chat.getMessages(chatId, options);

    console.log(
      '[GetMessagesAdvanced] Fetched',
      rawMessages.length,
      'messages',
    );

    // Map to simpler format
    const messages = rawMessages.map((m) => ({
      id: m.id?._serialized || m.id,
      body: m.body || '',
      from: m.from?._serialized || m.from,
      fromMe: m.fromMe,
      timestamp: m.timestamp || m.t,
      type: m.type,
      hasMedia: m.hasMedia || false,
      quotedMsg: m.quotedMsg
        ? {
            id: m.quotedMsg.id?._serialized || m.quotedMsg.id,
            body: m.quotedMsg.body,
          }
        : undefined,
    }));

    console.log('[GetMessagesAdvanced] Returning', messages.length, 'messages');

    return {
      success: true,
      messages,
      count: messages.length,
    };
  } catch (error) {
    console.error('[GetMessagesAdvanced] Error:', error);
    return {
      success: false,
      error: error.message,
    };
  }
})();
