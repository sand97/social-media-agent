/**
 * Send multiple product links to a chat (wa.me/p format)
 * Executed in WhatsApp Web context
 *
 * Variables:
 * - TO: Recipient chat ID (format: 123456789@c.us or 123456789@lid)
 * - PRODUCT_IDS: Comma-separated product IDs
 * - PRODUCT_LINK_OVERRIDES: JSON object keyed by product id with title/description overrides
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  try {
    const chatId = '{{TO}}';
    const rawProductIds = '{{PRODUCT_IDS}}';
    const rawProductLinkOverrides = '{{PRODUCT_LINK_OVERRIDES}}';

    if (!chatId || chatId.includes('{{')) {
      throw new Error('TO is required');
    }

    if (!rawProductIds || rawProductIds.includes('{{')) {
      throw new Error('PRODUCT_IDS is required');
    }

    const productIds = rawProductIds
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    if (productIds.length === 0) {
      throw new Error('PRODUCT_IDS must include at least one id');
    }

    const parseProductLinkOverrides = (rawValue) => {
      if (!rawValue || rawValue.includes('{{')) {
        return {};
      }

      try {
        const parsed = JSON.parse(rawValue);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed;
        }
      } catch (_error) {}

      return {};
    };

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const toSerialized = (widOrString) => {
      if (!widOrString) return null;
      if (typeof widOrString === 'string') return widOrString;
      if (widOrString._serialized) return widOrString._serialized;
      if (typeof widOrString.toString === 'function') return widOrString.toString();
      return String(widOrString);
    };

    const getCatalogOwnerNumber = () => {
      const me =
        window.WPP.conn?.getMyUserId()?._serialized ||
        toSerialized(window.WPP.whatsapp?.UserPrefs?.getMaybeMePnUser?.());

      if (!me) {
        throw new Error('Unable to resolve current user id');
      }

      const ownerNumber = String(me).split('@')[0];
      if (!ownerNumber) {
        throw new Error('Unable to resolve catalog owner number');
      }

      return {
        ownerNumber,
        meSerialized: String(me),
      };
    };

    const resolveWhatsAppProductId = async (inputProductId, ownerSerialized) => {
      try {
        const [catalog] = await window.WPP.whatsapp.CatalogStore.findQuery(
          ownerSerialized,
        );
        const storeProduct =
          catalog &&
          catalog.productCollection &&
          catalog.productCollection.get
            ? catalog.productCollection.get(inputProductId)
            : null;

        if (storeProduct && storeProduct.id) {
          return {
            resolvedProductId: String(storeProduct.id),
            source: 'catalog_store',
            product: storeProduct,
          };
        }
      } catch (_error) {}

      try {
        const product = await window.WPP.catalog.getProductById(
          ownerSerialized,
          inputProductId,
        );
        if (product && product.id) {
          return {
            resolvedProductId: String(product.id),
            source: 'catalog_api',
            product,
          };
        }
      } catch (_error) {}

      return {
        resolvedProductId: String(inputProductId),
        source: 'passthrough',
        product: null,
      };
    };

    const buildPreviewOverride = (candidateProductIds, previewOverrides) => {
      if (!previewOverrides || typeof previewOverrides !== 'object') {
        return null;
      }

      const candidateIds = Array.isArray(candidateProductIds)
        ? candidateProductIds
        : [candidateProductIds];
      const normalizedCandidates = candidateIds
        .map((candidateId) => String(candidateId || '').trim())
        .filter(Boolean);

      let rawOverride = null;
      for (const candidateId of normalizedCandidates) {
        const candidateOverride = previewOverrides[candidateId];
        if (candidateOverride && typeof candidateOverride === 'object') {
          rawOverride = candidateOverride;
          break;
        }
      }

      if (!rawOverride || typeof rawOverride !== 'object') {
        return null;
      }

      const title =
        typeof rawOverride.title === 'string' ? rawOverride.title.trim() : '';
      const description =
        typeof rawOverride.description === 'string'
          ? rawOverride.description.trim()
          : '';
      const thumbnail =
        typeof rawOverride.thumbnail === 'string'
          ? rawOverride.thumbnail
              .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
              .trim()
          : '';
      const thumbnailHQ =
        typeof rawOverride.thumbnailHQ === 'string'
          ? rawOverride.thumbnailHQ
              .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
              .trim()
          : '';
      const thumbnailWidth = Number(rawOverride.thumbnailWidth);
      const thumbnailHeight = Number(rawOverride.thumbnailHeight);

      if (!title && !description && !thumbnail && !thumbnailHQ) {
        return null;
      }

      return {
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        ...(thumbnail ? { thumbnail } : {}),
        ...(thumbnailHQ ? { thumbnailHQ } : {}),
        ...(Number.isFinite(thumbnailWidth) && thumbnailWidth > 0
          ? { thumbnailWidth }
          : {}),
        ...(Number.isFinite(thumbnailHeight) && thumbnailHeight > 0
          ? { thumbnailHeight }
          : {}),
      };
    };

    const waitForPreviewHydration = async (messageId, maxAttempts = 8, delayMs = 500) => {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const msg = await window.WPP.chat.getMessageById(messageId);
          if (
            msg &&
            (msg.title ||
              msg.description ||
              msg.thumbnail ||
              msg.thumbnailDirectPath ||
              msg.matchedText)
          ) {
            return {
              hydrated: true,
              attempt,
              title: msg.title || null,
              description: msg.description || null,
            };
          }
        } catch (_error) {}

        if (attempt < maxAttempts) {
          await sleep(delayMs);
        }
      }

      return {
        hydrated: false,
        attempt: maxAttempts,
        title: null,
        description: null,
      };
    };

    const sendSingleProductLink = async (
      toChatId,
      inputProductId,
      ownerCtx,
      previewOverrides,
    ) => {
      const productResolution = await resolveWhatsAppProductId(
        inputProductId,
        ownerCtx.meSerialized,
      );
      const waProductId = productResolution.resolvedProductId;
      const link = `https://wa.me/p/${waProductId}/${ownerCtx.ownerNumber}`;
      const previewOverride = buildPreviewOverride(
        [waProductId, inputProductId],
        previewOverrides,
      );
      const linkPreviewOption = previewOverride || true;

      console.log('[product-link] start', {
        toChatId,
        inputProductId,
        waProductId,
        ownerNumber: ownerCtx.ownerNumber,
        source: productResolution.source,
        link,
      });

      let sendMode = 'text_message';
      let sendResult;

      if (typeof window.WPP.chat.sendTextMessage === 'function') {
        sendResult = await window.WPP.chat.sendTextMessage(toChatId, link, {
          waitForAck: true,
          linkPreview: linkPreviewOption,
        });
      } else {
        sendMode = 'raw_message_fallback';
        sendResult = await window.WPP.chat.sendRawMessage(
          toChatId,
          {
            body: link,
            type: 'chat',
            ...(previewOverride || {}),
          },
          {
            waitForAck: true,
          },
        );
      }

      const messageId =
        sendResult && sendResult.id ? String(sendResult.id) : null;
      const previewHydration = messageId
        ? await waitForPreviewHydration(messageId)
        : { hydrated: false, attempt: 0, title: null, description: null };

      return {
        success: true,
        strategyUsed: 'product_link',
        to: toChatId,
        inputProductId: String(inputProductId),
        resolvedProductId: waProductId,
        productIdSource: productResolution.source,
        link,
        sendMode,
        messageId,
        ack: typeof sendResult?.ack === 'number' ? sendResult.ack : null,
        previewOverrideUsed: previewOverride,
        previewHydrated: previewHydration.hydrated,
        previewHydrationAttempt: previewHydration.attempt,
        previewTitle: previewHydration.title,
        previewDescription: previewHydration.description,
        previewWarning: previewHydration.hydrated
          ? null
          : 'Preview not hydrated immediately on Web client (can still appear on recipient clients).',
      };
    };

    const ownerCtx = getCatalogOwnerNumber();
    const productLinkOverrides = parseProductLinkOverrides(rawProductLinkOverrides);
    const results = [];

    for (const productId of productIds) {
      const result = await sendSingleProductLink(
        chatId,
        productId,
        ownerCtx,
        productLinkOverrides,
      );
      results.push(result);
    }

    return {
      success: true,
      strategyUsed: 'product_link',
      ownerNumber: ownerCtx.ownerNumber,
      overridesCount: Object.keys(productLinkOverrides).length,
      count: results.length,
      results,
    };
  } catch (error) {
    console.error('Failed to send product link message:', error);
    return {
      success: false,
      error: error.message,
    };
  }
})();
