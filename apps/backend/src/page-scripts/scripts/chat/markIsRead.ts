/**
 * Mark a chat as read
 * Variables: CHAT_ID
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  try {
    const chatId = '{{CHAT_ID}}'
    if (!chatId || chatId.includes('{{')) {
      throw new Error('CHAT_ID is required')
    }

    await window.WPP.chat.markIsRead(chatId)
    
    return { success: true, chatId }
  } catch (error) {
    console.error('Failed to mark chat as read:', error)
    throw error
  }
})()
