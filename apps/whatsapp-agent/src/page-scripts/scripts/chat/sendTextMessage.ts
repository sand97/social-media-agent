/**
 * Send text message with natural typing simulation
 * Executed in WhatsApp Web context
 *
 * Variables:
 * - TO: Recipient phone number (international format) or chat ID
 * - MESSAGE: Text content to send
 * - USE_TYPING: Whether to simulate typing (default: true)
 *
 * Features:
 * - Verifies contact exists using queryExists
 * - Natural typing delay based on message length (80 WPM)
 * - Shows "typing..." indicator before sending
 * - Delay capped between 500ms and 5000ms
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  try {
    const to = '{{TO}}';
    const message = '{{MESSAGE}}';
    const useTyping = '{{USE_TYPING}}' !== 'false';

    if (!to || to.includes('{{')) {
      throw new Error('TO is required');
    }

    if (!message || message.includes('{{')) {
      throw new Error('MESSAGE is required');
    }

    console.log(`Sending text message to ${to}`);

    // Determine if TO is already a full contact ID or a phone number
    let chatId;
    if (to.includes('@')) {
      // Already a chat ID (e.g., "123456789@c.us")
      chatId = to;
    } else {
      // Phone number - verify it exists and get the proper WID
      console.log(`Verifying contact exists: ${to}`);
      const contact = await window.WPP.contact.get(to);

      if (!contact) {
        throw new Error(`Contact not found: ${to}`);
      }

      chatId = contact.id._serialized;
      console.log(`Contact verified: ${chatId}`);
    }

    // Simulate natural typing if enabled
    // ⚠️ This code generate error because
    // window.WPP.chat.markIsComposing; // create exception
    // if (useTyping) {
    //   // Calculate delay: 80 WPM = 75ms per character
    //   const baseDelay = message.length * 75;
    //   const delay = Math.max(500, Math.min(5000, baseDelay));
    //
    //   console.log(`Simulating typing for ${delay}ms...`);
    //
    //   // Show "typing..." indicator
    //   await window.WPP.chat.markIsComposing(chatId, delay);
    //
    //   // Wait for the calculated delay
    //   await new Promise((resolve) => setTimeout(resolve, delay));
    // }

    // Send the message
    const result = await window.WPP.chat.sendTextMessage(chatId, message);

    console.log('Message sent successfully');

    return {
      success: true,
      messageId: result.id ? String(result.id) : null,
      timestamp: result.t ? Number(result.t) : null,
      to: chatId,
    };
  } catch (error) {
    console.error('Failed to send text message:', error);
    return {
      success: false,
      error: error.message,
    };
  }
})();
