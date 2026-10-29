import { api } from '@/src/core/api/client';

// =====================================================================
// listBoxLabelOrders — orders that have Box Labels, for a delivery date.
// =====================================================================
export type RawBoxLabelOrder = {
  opl_name?: string;
  order_name?: string;
  customer?: string;
  boxes?: number;
  printed?: number;
};
export type RawBoxLabelOrdersResponse = {
  message?: { date?: string; orders?: RawBoxLabelOrder[] };
};

// =====================================================================
// generateBoxLabelsPdf — every Box Label on one OPL (or just the first, as a
// sample) rendered through a chosen Print Format into one base64 PDF.
// =====================================================================
export type RawBoxLabelsPdfResponse = {
  message?: { pdf_base64?: string; filename?: string; count?: number; print_format?: string };
};

export type RawBoxLabelPrintFormatsResponse = {
  message?: { formats?: string[]; default?: string | null };
};

export const karenBoxLabelsApi = {
  /** Orders with at least one Box Label for a Sales Order delivery date (YYYY-MM-DD). */
  listOrders(date: string): Promise<RawBoxLabelOrdersResponse> {
    return api<RawBoxLabelOrdersResponse>({
      method: 'GET',
      url: '/api/method/upande_packhouse.mobile.api.listBoxLabelOrders',
      params: { date },
    });
  },

  /** Print formats offered for box labels, and the default to preselect. */
  getPrintFormats(): Promise<RawBoxLabelPrintFormatsResponse> {
    return api<RawBoxLabelPrintFormatsResponse>({
      method: 'POST',
      url: '/api/method/upande_packhouse.mobile.api.getBoxLabelPrintFormats',
      data: {},
    });
  },

  /** The page size comes from the print format; print_format omitted -> the server default. */
  generatePdf(payload: {
    order_pick_list: string;
    print_format?: string;
    /** Render only the first box's label, as a sample. */
    preview?: boolean;
  }): Promise<RawBoxLabelsPdfResponse> {
    return api<RawBoxLabelsPdfResponse>({
      method: 'POST',
      url: '/api/method/upande_packhouse.mobile.api.generateBoxLabelsPdf',
      data: payload,
    });
  },
};
