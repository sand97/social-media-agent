import { describe, expect, it, vi } from 'vitest';

import { ProductSendService } from '../../../src/tools/communication/product-send.service';

describe('ProductSendService', () => {
  it('resolves internal DB ids to WhatsApp ids before sending', async () => {
    const backendClient = {
      getProductByAnyId: vi.fn().mockResolvedValue({
        id: 'cmm6aiemj003ys02rifs8isp2',
        name: 'Barcelone Domicile',
        retailer_id: 'barcelone-domicile',
        whatsapp_product_id: '25095720553426064',
      }),
      getProductsByAnyIds: vi.fn().mockResolvedValue([
        {
          inputId: '25095720553426064',
          matchedBy: 'whatsapp_product_id',
          product: {
            id: 'cmm6aiemj003ys02rifs8isp2',
            name: 'Barcelone Domicile',
            description: 'Maillot domicile officiel. Coupe confortable.',
            price: 15000,
            currency: 'FCFA',
            retailer_id: 'barcelone-domicile',
            whatsapp_product_id: '25095720553426064',
            url: null,
            coverImageUrl: null,
          },
        },
      ]),
    };

    const connectorClient = {
      executeScript: vi.fn().mockResolvedValue({ success: true }),
    };

    const scriptService = {
      getScript: vi.fn().mockReturnValue('// send-products script'),
    };

    const service = new ProductSendService(
      backendClient as any,
      connectorClient as any,
      scriptService as any,
    );

    const result = await service.sendProducts('64845667926032@lid', [
      'cmm6aiemj003ys02rifs8isp2',
    ]);

    expect(backendClient.getProductByAnyId).toHaveBeenCalledWith(
      'cmm6aiemj003ys02rifs8isp2',
    );
    expect(backendClient.getProductsByAnyIds).toHaveBeenCalledWith([
      '25095720553426064',
    ]);
    expect(scriptService.getScript).toHaveBeenCalledTimes(1);
    expect(scriptService.getScript.mock.calls[0][0]).toBe(
      'chat/sendProductsMessage',
    );
    expect(scriptService.getScript.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        TO: '64845667926032@lid',
        PRODUCT_IDS: '25095720553426064',
      }),
    );
    const overridesRaw = scriptService.getScript.mock.calls[0][1]
      .PRODUCT_LINK_OVERRIDES;
    expect(typeof overridesRaw).toBe('string');
    const overrides = JSON.parse(overridesRaw);
    expect(overrides['25095720553426064']).toEqual(
      expect.objectContaining({
        title: expect.stringContaining('Barcelone Domicile'),
      }),
    );
    expect(overrides['25095720553426064'].title).toContain('•');
    expect(overrides['25095720553426064'].description).not.toContain('•');
    expect(connectorClient.executeScript).toHaveBeenCalledTimes(1);
    expect(result.resolvedProductIds).toEqual(['25095720553426064']);
    expect(result.resolution[0].source).toBe('backend_whatsapp_product_id');
  });

  it('keeps passthrough ids when backend has no mapping', async () => {
    const backendClient = {
      getProductByAnyId: vi.fn().mockResolvedValue(null),
      getProductsByAnyIds: vi.fn().mockResolvedValue([]),
    };

    const connectorClient = {
      executeScript: vi.fn().mockResolvedValue({ success: true }),
    };

    const scriptService = {
      getScript: vi.fn().mockReturnValue('// send-products script'),
    };

    const service = new ProductSendService(
      backendClient as any,
      connectorClient as any,
      scriptService as any,
    );

    const resolution = await service.resolveProductIdsForWhatsApp([
      '25095720553426064',
    ]);

    expect(resolution.resolvedIds).toEqual(['25095720553426064']);
    expect(resolution.mappings[0].source).toBe('passthrough');
  });
});
