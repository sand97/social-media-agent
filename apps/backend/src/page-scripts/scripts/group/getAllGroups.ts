/**
 * Get all WhatsApp groups with filters and pagination
 * Variables:
 *   - NAME (optional, search by formattedTitle)
 *   - LIMIT (optional, max 10, default 10)
 *   - OFFSET (optional, default 0, for pagination)
 *   - EXCLUDE_COMMUNITIES (optional, "true" or "false", default "true")
 *
 * IMPORTANT: Always limited to 10 results max to avoid overloading context
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

    // Parse parameters
    const nameFilter = getParam('{{NAME}}', '')
    const limit = Math.min(parseInt(getParam('{{LIMIT}}', '10')) || 10, 10) // Max 10
    const offset = parseInt(getParam('{{OFFSET}}', '0')) || 0
    const excludeCommunitiesStr = getParam('{{EXCLUDE_COMMUNITIES}}', 'true')
    const excludeCommunities = excludeCommunitiesStr !== 'false' // Default true

    // Get all groups using window.WPP.group.getAllGroups()
    let groups = await window.WPP.group.getAllGroups()

    // Filter out communities if requested
    if (excludeCommunities) {
      groups = groups.filter(group => group.attributes.groupType !== 'COMMUNITY')
    }

    // Helper to normalize string (remove accents and lowercase)
    const normalize = (str) => str?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') || ''

    // Filter by name if specified (accent-insensitive)
    if (nameFilter) {
      const normalizedFilter = normalize(nameFilter)
      groups = groups.filter(group => {
        const name = normalize(group.attributes.name)
        const formattedTitle = normalize(group.attributes.formattedTitle)
        return name.includes(normalizedFilter) || formattedTitle.includes(normalizedFilter)
      })
    }

    // Sort by most recent activity (t is timestamp of last message)
    groups.sort((a, b) => (b.attributes.t || 0) - (a.attributes.t || 0))

    // Apply pagination
    const paginatedGroups = groups.slice(offset, offset + limit)

    return {
      total: groups.length,
      offset,
      limit,
      groups: paginatedGroups.map(group => ({
        id: group.attributes.id._serialized,
        name: group.attributes.name || group.attributes.formattedTitle,
        formattedTitle: group.attributes.formattedTitle,
        groupType: group.attributes.groupType,
        participantsCount: group.attributes.participants?.length || 0,
        lastActivity: group.attributes.t ? new Date(group.attributes.t * 1000).toISOString() : null,
      })),
    }
  } catch (error) {
    console.error('Failed to get groups:', error)
    throw error
  }
})()
