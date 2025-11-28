/**
 * Add a label to a contact
 * Variables: CONTACT_ID (required), LABEL_ID (required)
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  const contactId = '{{CONTACT_ID}}';
  const labelId = '{{LABEL_ID}}';

  if (!contactId || contactId.includes('{{')) {
    throw new Error('CONTACT_ID is required');
  }

  if (!labelId || labelId.includes('{{')) {
    throw new Error('LABEL_ID is required');
  }

  await WPP.labels.addOrRemoveLabels(contactId, [labelId], 'add');

  return { success: true };
})();
