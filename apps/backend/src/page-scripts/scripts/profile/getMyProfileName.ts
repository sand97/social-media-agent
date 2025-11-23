/**
 * Get my profile name
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  try {
    const name = await window.WPP.profile.getMyProfileName()
    
    return { name }
  } catch (error) {
    console.error('Failed to get profile name:', error)
    throw error
  }
})()
