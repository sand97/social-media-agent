/**
 * Create a new WhatsApp group
 * Variables: GROUP_NAME, PARTICIPANTS (JSON array of phone numbers, e.g. ["237612345678", "237698765432"])
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  try {
    const groupName = '{{GROUP_NAME}}';
    if (!groupName || groupName.includes('{{')) {
      throw new Error('GROUP_NAME is required');
    }
    const participantsStr = '{{PARTICIPANTS}}';
    if (!participantsStr || participantsStr.includes('{{')) {
      throw new Error(
        'PARTICIPANTS is required (JSON array like ["237612345678"])',
      );
    }

    // Parse participants with error handling
    let participants;
    try {
      participants = JSON.parse(participantsStr);
      if (!Array.isArray(participants)) {
        throw new Error('PARTICIPANTS must be a JSON array');
      }
    } catch (parseError) {
      throw new Error(
        `Invalid PARTICIPANTS format: ${parseError.message}. Expected JSON array like ["237612345678"]`,
      );
    }

    // Format participants to WhatsApp IDs
    const participantIds = participants.map((phone) => {
      // Remove any non-digit characters
      const cleanPhone = String(phone).replace(/\D/g, '');
      return `${cleanPhone}@c.us`;
    });

    // Create group
    const result = await window.WPP.group.create(groupName, participantIds);

    return {
      id: result.gid._serialized,
      name: groupName,
      participants: participantIds.length,
    };
  } catch (error) {
    console.error('Failed to create group:', error);
    throw error;
  }
})();
