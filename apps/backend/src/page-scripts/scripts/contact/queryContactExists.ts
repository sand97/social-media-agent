/**
 * Check if a phone number exists on WhatsApp
 * Variables: PHONE_NUMBER
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  try {
    const phoneNumber = '{{PHONE_NUMBER}}';
    if (!phoneNumber || phoneNumber.includes('{{')) {
      throw new Error('PHONE_NUMBER is required');
    }

    // Remove any non-digit characters
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const contactId = `${cleanPhone}@c.us`;

    const result = await window.WPP.contact.queryExists(contactId);

    return {
      exists: result?.wid !== undefined,
      phoneNumber: cleanPhone,
      contactId: result?.wid?._serialized,
    };
  } catch (error) {
    console.error('Failed to query contact:', error);
    throw error;
  }
})();
