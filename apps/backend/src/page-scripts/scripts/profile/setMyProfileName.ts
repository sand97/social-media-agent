/**
 * Set my profile name
 * Variables: PROFILE_NAME
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  try {
    const profileName = '{{PROFILE_NAME}}'
    if (!profileName || profileName.includes('{{')) {
      throw new Error('PROFILE_NAME is required')
    }

    await window.WPP.profile.setMyProfileName(profileName)
    
    return {
      success: true,
      name: profileName,
    }
  } catch (error) {
    console.error('Failed to set profile name:', error)
    throw error
  }
})()
