/**
 * Get messages from a chat
 * Variables: CHAT_ID, LIMIT (optional, default 20, max 50)
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  try {
    // Helper to check if placeholder was replaced
    const getParam = (value, defaultValue) => {
      if (!value || value.includes('{{')) return defaultValue
      return value
    }

    const chatId = '{{CHAT_ID}}'
    if (!chatId || chatId.includes('{{')) {
      throw new Error('CHAT_ID is required')
    }
    const limit = Math.min(parseInt(getParam('{{LIMIT}}', '20')) || 20, 50) // Max 50

    const messages = await window.WPP.chat.getMessages(chatId, { count: limit })

    return messages.map(msg => ({
      id: msg.id._serialized,
      body: msg.body || '',
      timestamp: msg.t ? new Date(msg.t * 1000).toISOString() : null,
      fromMe: msg.id.fromMe,
      from: msg.from?._serialized,
      to: msg.to?._serialized,
      type: msg.type,
    }))
  } catch (error) {
    console.error('Failed to get messages:', error)
    throw error
  }
})()
