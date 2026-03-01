/**
 * Send multiple catalog products to a chat
 * Executed in WhatsApp Web context
 *
 * Variables:
 * - TO: Recipient chat ID (format: 123456789@c.us)
 * - PRODUCT_IDS: Comma-separated product IDs
 */

// @ts-nocheck
/* eslint-disable */

(async () => {
  try {
    const chatId = '{{TO}}';
    const rawProductIds = '{{PRODUCT_IDS}}';

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

    const sendSingleProduct = async (chatId, productId) => {
      const opts = {};
      const cleanup = true;
      const uploadChatId = opts.uploadChatId || null;
      const userId = WPP.whatsapp.UserPrefs.getMaybeMePnUser()._serialized;

      console.log('[product] start', {
        chatId,
        productId,
        cleanup,
        uploadChatId,
      });

      // const [catalog] = await window.WPP.whatsapp.CatalogStore.findQuery(userId);
      // const product =
      //   catalog && catalog.productCollection && catalog.productCollection.get
      //     ? catalog.productCollection.get(productId)
      //     : null;
      const product = await WPP.catalog.getProductById(
        userId,
        productId,
      );

      console.log('[product] product', product);
      if (!product) throw new Error('product not found');

      const imageUrl =
        product.imageCdnUrl ||
        (product.attributes && product.attributes.imageCdnUrl);
      console.log('[product] imageUrl', imageUrl);
      if (!imageUrl) throw new Error('imageUrl missing');

      const download = await WPP.util.downloadImage(imageUrl);
      const dataUrl = download.data;
      console.log('[product] download', {
        hasData: !!dataUrl,
        length: dataUrl && dataUrl.length,
      });

      const me = WPP.whatsapp.UserPrefs.getMaybeMePnUser();
      const meId = me && me.toString ? me.toString() : null;
      const uploadTo = uploadChatId || meId;

      console.log('[product] uploadTo', uploadTo);

      const imgSend = await WPP.chat.sendFileMessage(uploadTo, dataUrl, {
        type: 'image',
        caption: ' ',
        waitForAck: true,
      });

      console.log('[product] image sent', imgSend);

      function extractMedia(msg) {
        const md = msg && msg.mediaData ? msg.mediaData : msg;
        return {
          directPath: (md && md.directPath) || msg.directPath,
          mediaKey: (md && md.mediaKey) || msg.mediaKey,
          encFilehash: (md && md.encFilehash) || msg.encFilehash,
          filehash: (md && md.filehash) || msg.filehash,
          size: (md && md.size) || msg.size,
          mimetype: (md && md.mimetype) || msg.mimetype,
          mediaKeyTimestamp:
            (md && md.mediaKeyTimestamp) || msg.mediaKeyTimestamp,
          width:
            (md && (md.fullWidth || md.width)) || msg.width || msg.fullWidth,
          height:
            (md && (md.fullHeight || md.height)) || msg.height || msg.fullHeight,
        };
      }

      async function waitForMediaFields(id) {
        for (let i = 0; i < 10; i++) {
          const msg = await WPP.chat.getMessageById(id);
          const fields = extractMedia(msg);
          if (
            fields.directPath &&
            fields.mediaKey &&
            fields.encFilehash &&
            fields.size
          ) {
            return { msg, fields };
          }
          await new Promise(function (r) {
            setTimeout(r, 500);
          });
        }
        throw new Error('media fields still missing after upload');
      }

      const media = await waitForMediaFields(imgSend.id);
      console.log('[product] media fields', media.fields);

      const owner = product.catalogWid || me;
      const businessOwnerJid =
        owner && owner.toJid
          ? owner.toJid()
          : owner
            ? owner.toString().replace('@c.us', '@s.whatsapp.net')
            : null;

      const body = dataUrl.split(',', 2)[1];

      const raw = {
        type: 'product',
        body: body,
        productId: product.id ? product.id.toString() : String(productId),
        businessOwnerJid: businessOwnerJid,
        title: product.name,
        description: product.description || '',
        currencyCode: product.currency || null,
        priceAmount1000: product.priceAmount1000 || null,
        salePriceAmount1000: product.salePriceAmount1000 || null,
        url: product.url || '',
        productImageCount: product.imageCount || 1,

        mimetype: media.fields.mimetype,
        filehash: media.fields.filehash,
        encFilehash: media.fields.encFilehash,
        size: media.fields.size,
        mediaKey: media.fields.mediaKey,
        mediaKeyTimestamp: media.fields.mediaKeyTimestamp,
        directPath: media.fields.directPath,
        width: media.fields.width,
        height: media.fields.height,
      };

      console.log('[product] rawMessage', raw);

      const result = await WPP.chat.sendRawMessage(chatId, raw);
      console.log('[product] send result', result);

      if (cleanup) {
        try {
          const del = await WPP.chat.deleteMessage(
            uploadTo,
            imgSend.id,
            true,
            false,
          );
          console.log('[product] cleanup', del);
        } catch (e) {
          console.log('[product] cleanup error', e);
        }
      }

      return {
        success: true,
        to: chatId,
        ...result,
      };
    };

    const results = [];

    for (const productId of productIds) {
      const result = await sendSingleProduct(chatId, productId);
      results.push(result);
    }

    return {
      success: true,
      count: results.length,
      results,
    };
  } catch (error) {
    console.error('Failed to send product message:', error);
    return {
      success: false,
      error: error.message,
    };
  }
})();
