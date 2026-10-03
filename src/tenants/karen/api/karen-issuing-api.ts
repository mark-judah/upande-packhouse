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

/** A bucket that can stand in for one that cannot be found at issuing. */
export type RawReplacementCandidate = {
  new_bucket: string;
  shelf?: string | null;
  variety?: string | null;
  stem_length?: string | null;
  available_qty?: number;
  harvest_date?: string | null;
};

export type RawReplacementOptions = {
  found?: boolean;
  message?: string;
  needed_qty?: number;
  candidates?: RawReplacementCandidate[];
};

export type RawReplaceResult = {
  success?: boolean;
  message?: string;
  new_bucket?: string;
  shelf?: string;
};

const OFFLINE_ISSUE = '/api/method/upande_packhouse.api.offline_issue';

export const karenIssuingApi = {
  /** Buckets that can replace one on this OPL -- the same rules remote
   *  transfers replace by (same variety, same or longer length, enough stems,
   *  unallocated, shelved at the same farm), best match first. */
  async fetchReplacementOptions(payload: {
    opl_name: string;
    bucket: string;
    sale_order_item?: string;
  }): Promise<RawReplacementOptions> {
    const res = await api<{ message?: RawReplacementOptions }>({
      method: 'GET',
      url: `${OFFLINE_ISSUE}.replacement_options`,
      params: payload,
    });
    return res.message ?? {};
  },

  /** Swap the bucket on this OPL for `new_bucket_id`; it is then issued by scanning it. */
  async replaceBucket(payload: {
    opl_name: string;
    bucket: string;
    new_bucket_id: string;
    reason: string;
    sale_order_item?: string;
  }): Promise<RawReplaceResult> {
    const res = await api<{ message?: RawReplaceResult }>({
      method: 'POST',
      url: `${OFFLINE_ISSUE}.replace_for_issuing`,
      data: payload,
      // A swap can wait on stock locks and retry server-side.
      timeout: 120000,
    });
    return res.message ?? {};
  },

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
