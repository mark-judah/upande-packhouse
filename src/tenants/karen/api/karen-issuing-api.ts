import { api } from '@/src/core/api/client';

/** Raw line returned by `/api/method/upande_packhouse.mobile.api.getReadySaleOrderItemsData`. */
export type RawReadySaleOrderItem = {
  variety?: string;
  bucket?: string;
  stem_length?: string;
  shelf?: string;
  custom_sale_order_item?: string;
  mixed?: number;
  downgrade_to?: string | null;
  qty?: string | number;
  team?: string;
  is_issued?: boolean | number;
  opl_name?: string;
};

/** One ready-TO-ISSUE entry — one row PER ORDER PICK LIST (an OPL is the
 *  issuing unit; a Sales Order can have several, e.g. split by team, and
 *  they must stay separate rows, never merged into one "order"). The
 *  backend MAY still return a bare order-name string (legacy shape) or an
 *  enriched object; the UI degrades gracefully when a field is absent. */
export type RawReadyOrder = {
  opl_name?: string;
  name?: string;
  order?: string;
  sale_order?: string;
  custom_order_name?: string;
  customer?: string;
  varieties?: string[];
  stem_lengths?: string[];
  qty?: string | number;
  item_group?: string | string[];
  custom_item_group?: string | string[];
  team?: string | string[];
  custom_team?: string | string[];
};

/** The endpoint returns `orders` at the TOP LEVEL of the body alongside a
 *  string `message`. We accept the legacy nested shape too for safety, and
 *  each entry may be a bare name or an item-group-enriched object. */
export type RawReadyOrdersResponse = {
  message?:
    | string
    | { status?: string; message?: string; orders?: (string | RawReadyOrder)[] }
    | (string | RawReadyOrder)[];
  orders?: (string | RawReadyOrder)[];
};

/** Likewise, `packing_list` is at top level — `message` is just a string. */
export type RawPackingListResponse = {
  message?:
    | string
    | {
        status?: string;
        message?: string;
        packing_list?: RawReadySaleOrderItem[];
      }
    | RawReadySaleOrderItem[];
  packing_list?: RawReadySaleOrderItem[];
};

export type RawIssueResponse = {
  message?: { status?: string; message?: string } | string;
};

export const karenIssuingApi = {
  /** List sale orders ready to be issued for a day (YYYY-MM-DD; default today). */
  fetchReadyOrders(date: string): Promise<RawReadyOrdersResponse> {
    return api<RawReadyOrdersResponse>({
      method: 'GET',
      url: '/api/method/upande_packhouse.mobile.api.getReadySaleOrderItems',
      params: { date },
    });
  },

  /** For a given Order Pick List, get its packing-list rows (one row per
   *  bucket allocated to THAT OPL only — never other OPLs of the same
   *  sale order). */
  fetchPackingList(oplName: string): Promise<RawPackingListResponse> {
    return api<RawPackingListResponse>({
      method: 'POST',
      url: '/api/method/upande_packhouse.mobile.api.getReadySaleOrderItemsData',
      data: { opl_name: oplName },
    });
  },

  /** Issue one scanned bucket against a (sale_order_item, opl_name) pair. */
  issueBucket(payload: {
    bucket: string;
    sale_order_item: string;
    opl_name: string;
  }): Promise<RawIssueResponse> {
    return api<RawIssueResponse>({
      method: 'POST',
      url: '/api/method/upande_packhouse.mobile.api.issueBucketToSaleOrderItem',
      data: payload,
    });
  },
};
