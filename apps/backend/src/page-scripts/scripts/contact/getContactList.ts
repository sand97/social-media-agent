/**
 * Get list of contacts with filters and pagination
 * Variables:
 *   - ONLY_MY_CONTACTS (optional, "true" or "false", default "true")
 *   - WITH_LABELS (optional, JSON array of label names or IDs, e.g. ["Client", "VIP"])
 *   - NAME (optional, recherche par nom dans shortName, pushname et name)
 *   - LIMIT (optional, max 10, default 10)
 *   - OFFSET (optional, default 0, for pagination)
 *
 * IMPORTANT: Toujours limité à 10 résultats max pour éviter de surcharger le contexte
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  try {
    // Helper to check if placeholder was replaced
    const getParam = (value, defaultValue) => {
      if (!value || value.includes('{{')) return defaultValue;
      return value;
    };

    // Parse parameters
    const onlyMyContactsStr = getParam('{{ONLY_MY_CONTACTS}}', 'true');
    const onlyMyContacts = onlyMyContactsStr === 'true';
    const withLabelsStr = getParam('{{WITH_LABELS}}', '');
    let withLabels = null;
    if (withLabelsStr && withLabelsStr.trim() !== '') {
      try {
        withLabels = JSON.parse(withLabelsStr);
        if (!Array.isArray(withLabels)) {
          withLabels = null;
        }
      } catch (e) {
        // Invalid JSON, ignore filter
        withLabels = null;
      }
    }
    const nameFilter = getParam('{{NAME}}', '');
    const limit = Math.min(parseInt(getParam('{{LIMIT}}', '10')) || 10, 10); // Max 10
    const offset = parseInt(getParam('{{OFFSET}}', '0')) || 0;

    // Build options
    const options = {};
    if (onlyMyContacts) {
      options.onlyMyContacts = true;
    }
    if (withLabels && withLabels.length > 0) {
      options.withLabels = withLabels;
    }

    let contacts = await window.WPP.contact.list(options);

    // Helper to normalize string (remove accents and lowercase)
    const normalize = (str) =>
      str
        ?.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') || '';

    // Filtre par nom si spécifié (insensible aux accents)
    if (nameFilter) {
      const normalizedFilter = normalize(nameFilter);
      contacts = contacts.filter((contact) => {
        const shortName = normalize(contact.shortName);
        const pushname = normalize(contact.pushname);
        const name = normalize(contact.name);
        return (
          shortName.includes(normalizedFilter) ||
          pushname.includes(normalizedFilter) ||
          name.includes(normalizedFilter)
        );
      });
    }

    // Apply pagination
    const paginatedContacts = contacts.slice(offset, offset + limit);

    return {
      total: contacts.length,
      offset,
      limit,
      contacts: paginatedContacts.map((contact) => ({
        id: contact.id._serialized,
        name: contact.name || contact.pushname,
        formattedName: contact.formattedName,
        isMyContact: contact.isMyContact,
      })),
    };
  } catch (error) {
    console.error('Failed to get contact list:', error);
    throw error;
  }
})();
