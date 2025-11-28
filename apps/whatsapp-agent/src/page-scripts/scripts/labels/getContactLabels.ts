/**
 * Get labels for a contact
 * Variables: CONTACT_ID (required)
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  const contactId = '{{CONTACT_ID}}';

  if (!contactId || contactId.includes('{{')) {
    throw new Error('CONTACT_ID is required');
  }

  const labels = await WPP.labels.getChatLabels(contactId);

  return labels.map((l) => ({
    id: l.id,
    name: l.name,
    hexColor: l.hexColor,
  }));
})();
