/**
 * Ajoute ou retire des labels d'une conversation
 * Variables: CHAT_ID, LABEL_IDS (JSON array, e.g. ["6", "7"]), ACTION ('add' | 'remove')
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  try {
    const chatId = '{{CHAT_ID}}';
    if (!chatId || chatId.includes('{{')) {
      throw new Error('CHAT_ID is required')
    }
    const labelIdsStr = '{{LABEL_IDS}}';
    if (!labelIdsStr || labelIdsStr.includes('{{')) {
      throw new Error('LABEL_IDS is required (JSON array like ["6", "7"])')
    }
    const action = '{{ACTION}}';
    if (!action || action.includes('{{')) {
      throw new Error('ACTION is required ("add" or "remove")')
    }

    // Parse label IDs with error handling
    let labelIds
    try {
      labelIds = JSON.parse(labelIdsStr)
      if (!Array.isArray(labelIds)) {
        throw new Error('LABEL_IDS must be a JSON array')
      }
    } catch (parseError) {
      throw new Error(`Invalid LABEL_IDS format: ${parseError.message}. Expected JSON array like ["6", "7"]`)
    }

    // Validate action
    if (action !== 'add' && action !== 'remove') {
      throw new Error(`Invalid ACTION: "${action}". Must be "add" or "remove"`)
    }

    await window.WPP.labels.addOrRemoveLabels(labelIds, [chatId], action);

    return {
      success: true,
      chatId,
      labelIds,
      action,
    };
  } catch (error) {
    console.error('Failed to add/remove labels:', error);
    throw error;
  }
})();
