/**
 * Send catalog link to a chat
 * Executed in WhatsApp Web context
 *
 * Variables:
 * - TO: Recipient chat ID (required)
 * - OWNER_ID: Catalog owner chat ID (optional, defaults to current session user)
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  try {
    const to = '{{TO}}';
    const ownerIdRaw = '{{OWNER_ID}}';

    if (!to || to.includes('{{')) {
      throw new Error('TO is required');
    }

    let ownerId = ownerIdRaw && !ownerIdRaw.includes('{{') ? ownerIdRaw : null;

    if (!ownerId) {
      const me = window.WPP.conn.getMyUserId();
      ownerId =
        (me && (me._serialized || (me.toString ? me.toString() : null))) ||
        null;
    }

    if (!ownerId) {
      throw new Error('OWNER_ID is required');
    }

    const result = await window.WPP.chat.sendCatalogMessage(to, ownerId);

    return {
      success: true,
      to,
      ownerId,
      result,
    };
  } catch (error) {
    console.error('Failed to send catalog link:', error);
    return {
      success: false,
      error: error.message,
    };
  }
})();
