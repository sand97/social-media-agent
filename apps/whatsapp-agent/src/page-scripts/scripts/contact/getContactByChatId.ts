/**
 * Resolve contact user id from a chatId (e.g., 64845667926032@lid)
 * Variables: CHAT_ID (required)
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  try {
    const chatId = '{{CHAT_ID}}';

    if (!chatId || chatId.includes('{{')) {
      throw new Error('CHAT_ID is required');
    }

    const contact = await window.WPP.contact.get(chatId);

    if (!contact) {
      throw new Error(`Contact not found for ${chatId}`);
    }

    const user = contact?.attributes?.id?.user || contact?.id?.user || '';

    return {
      user,
    };
  } catch (error) {
    console.error('Failed to resolve contact from chatId:', error);
    throw error;
  }
})();
