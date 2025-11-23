/**
 * Get contact information
 * Variables: CONTACT_ID
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  try {
    const contactId = '{{CONTACT_ID}}'
    if (!contactId || contactId.includes('{{')) {
      throw new Error('CONTACT_ID is required')
    }

    const contact = await window.WPP.contact.get(contactId)
    
    return {
      id: contact.id._serialized,
      name: contact.name || contact.pushname,
      formattedName: contact.formattedName,
      isMyContact: contact.isMyContact,
      isUser: contact.isUser,
      isWAContact: contact.isWAContact,
      profilePicThumbObj: contact.profilePicThumbObj,
    }
  } catch (error) {
    console.error('Failed to get contact:', error)
    throw error
  }
})()
