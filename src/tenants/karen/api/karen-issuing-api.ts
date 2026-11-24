import { api } from '@/src/core/api/client';
import { stationParams } from '@/src/core/tenant/user-station';

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
  /** Allocated at a remote farm and not transferred here yet. */
  waiting_transfer?: number;
  transfer_farm?: string | null;
  /** Marked not found at its farm: never coming -- replace it or complete short. */
  not_found?: number;
  /** Reported not found (at its farm or here), or the bucket replacing one: the report. */
  not_found_report?: {
    bucket?: string;
    replaced_by?: string;
    shelf?: string;
    photo?: string;
    by?: string;
    at?: string;
    farm?: string;
    reason?: string;
  } | null;
  /** Progressive Issuing: none of this bucket's boxes is complete yet (why), so it is not issued yet. */
  box_waiting?: string;
  /** Stems the bucket holds on its shelf (not issued yet): more than `qty`, only `qty` are taken. */
  bucket_stems?: number;
};

/** One ready-TO-ISSUE entry — one row PER ORDER PICK LIST (an OPL is the
 *  issuing unit; a Sales Order can have several, e.g. split by team, and
 *  they must stay separate rows, never merged into one "order"). The
 *  backend MAY still return a bare order-name string (legacy shape) or an
 *  enriched object; the UI degrades gracefully when a field is absent. */
export type RawReadyOrder = {
  opl_name?: string;
  /** A webstore (Quality B) order: Grade B flowers, replaced from Grade B buckets only. */
  quality_b?: number | boolean;
  /** Progressive Issuing: a draft issued box by box -- its complete boxes of all of them. */
  progressive?: { ready?: number; total?: number; start_from?: number; open?: boolean; waiting?: string } | null;
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
  /** Packhouse Schedule: its team's place for it (0 = not scheduled), that team,
   *  and whether it is the team's next order to issue. */
  schedule?: number;
  schedule_team?: string;
  is_next?: boolean;
  /** "Wham (50cm)" per variety with its own stem lengths. */
  variety_lengths?: string[];
  /** Buckets issued so far (not-found ones left out). */
  issued_buckets?: number;
  total_buckets?: number;
  issued_pct?: number;
  /** Stems issued of all its buckets' stems (not-found ones too): Pack While Waiting's basis. */
  issued_stem_pct?: number;
  issued_stems?: number;
  total_stems?: number;
  /** Unissued rows still coming by truck: Pack While Waiting waits for them. */
  moving_rows?: number;
  /** Production Settings: packing while waiting is offered from this issued %. */
  pack_waiting_pct?: number;
  /** The order can go to packing now with what is issued (pack_while_waiting_replacement's rules). */
  pack_waiting?: boolean;
  issue_done?: boolean;
  /** The team's earlier order still to issue first (0 = none). */
  waits_for?: number;
  /** A draft listed because a farm marked buckets not found (nothing else coming). */
  draft?: number;
  not_found?: number;
  short_stems?: number;
  short_pct?: number;
  short_accepted?: number;
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
  /** In a remote cold store (this farm): it comes on a truck, first in line. */
  remote?: boolean;
  farm?: string | null;
};

export type RawReplacementOptions = {
  found?: boolean;
  message?: string;
  needed_qty?: number;
  candidates?: RawReplacementCandidate[];
  /** Other pick lists that still have this bucket to issue. */
  also_on?: { opl: string; order_name?: string | null }[];
};

/** Replace reason "Issued offline": the OPLs the bucket was already issued on. */
export type RawIssuedOfflineInfo = {
  success?: boolean;
  message?: string;
  line?: string;
  same_line?: boolean;
  issued_to?: { opl: string; order_name?: string | null; team?: string; same_line?: boolean }[];
};

export type RawReplaceResult = {
  success?: boolean;
  message?: string;
  /** Replaced from a remote cold store: it comes on a truck. */
  remote?: boolean;
  new_bucket?: string;
  shelf?: string;
};

const OFFLINE_ISSUE = '/api/method/upande_packhouse.api.offline_issue';

/** `{ farm }` = this device's station, for calls that take it as `farm`. */
async function stationFarm(): Promise<{ farm?: string }> {
  const { station } = await stationParams();
  return station ? { farm: station } : {};
}

export const karenIssuingApi = {
  /** Buckets that can replace one on this OPL (same variety, same or longer
   *  length, enough stems, unallocated), best match first -- only from this
   *  device's station farm. */
  async fetchReplacementOptions(payload: {
    opl_name: string;
    bucket: string;
    sale_order_item?: string;
  }): Promise<RawReplacementOptions> {
    const res = await api<{ message?: RawReplacementOptions }>({
      method: 'GET',
      url: `${OFFLINE_ISSUE}.replacement_options`,
      params: { ...payload, ...(await stationFarm()) },
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
    /** Missing: the shelf the system put it on, scanned, and the uploaded photo of it. */
    scanned_shelf?: string;
    shelf_photo?: string;
  }): Promise<RawReplaceResult> {
    const res = await api<{ message?: RawReplaceResult }>({
      method: 'POST',
      url: `${OFFLINE_ISSUE}.replace_for_issuing`,
      // The replacement must be shelved at this station's farm.
      data: { ...payload, ...(await stationFarm()) },
      // A swap can wait on stock locks and retry server-side.
      timeout: 120000,
    });
    return res.message ?? {};
  },

  /** Not on its shelf and nothing to replace it: marked not found (the shelf scanned and its photo kept on a
   *  Bucket Replacement); the order is then completed short. */
  async markNotFound(payload: {
    opl_name: string;
    bucket: string;
    sale_order_item?: string;
    scanned_shelf: string;
    shelf_photo: string;
  }): Promise<RawReplaceResult> {
    const res = await api<{ message?: RawReplaceResult }>({
      method: 'POST',
      url: `${OFFLINE_ISSUE}.mark_not_found_for_issuing`,
      data: { ...payload, ...(await stationFarm()) },
    });
    return res.message ?? {};
  },

  /** Not-found report, step one: is the shelf scanned the one the system put the bucket on? */
  async checkNotFoundShelf(payload: {
    opl_name: string;
    bucket: string;
    sale_order_item?: string;
    scan: string;
  }): Promise<{ ok?: boolean; expected?: string; shelf?: string; message?: string }> {
    const res = await api<{ message?: { ok?: boolean; expected?: string; shelf?: string; message?: string } }>({
      method: 'POST',
      url: '/api/method/upande_packhouse.api.not_found_report.checkNotFoundShelf',
      data: payload,
    });
    return res.message ?? {};
  },

  /** Which line(s) the bucket was already issued to, and whether one is this OPL's own. */
  async fetchIssuedOfflineInfo(payload: {
    opl_name: string;
    bucket: string;
    sale_order_item?: string;
  }): Promise<RawIssuedOfflineInfo> {
    const res = await api<{ message?: RawIssuedOfflineInfo }>({
      method: 'GET',
      url: `${OFFLINE_ISSUE}.issued_offline_info`,
      params: payload,
    });
    return res.message ?? {};
  },

  /** Issued offline to this OPL's own line: mark it issued here, nothing replaced. */
  async markIssuedOffline(payload: {
    opl_name: string;
    bucket: string;
    sale_order_item?: string;
    /** The shelf the system put it on, scanned, and the uploaded photo of it. */
    scanned_shelf?: string;
    shelf_photo?: string;
  }): Promise<RawReplaceResult> {
    const res = await api<{ message?: RawReplaceResult }>({
      method: 'POST',
      url: `${OFFLINE_ISSUE}.mark_issued_offline`,
      data: payload,
      // Issuing posts stock entries; allow it time.
      timeout: 120000,
    });
    return res.message ?? {};
  },

  /** Orders with buckets here to issue for a day (YYYY-MM-DD; default today). */
  async fetchReadyOrders(date: string, station?: string): Promise<RawReadyOrdersResponse> {
    // Scoped by the server to the buckets at this station's farms (Karen vs Ravine).
    return api<RawReadyOrdersResponse>({
      method: 'GET',
      url: '/api/method/upande_packhouse.mobile.api.getReadySaleOrderItems',
      params: station ? { date, station } : { date },
    });
  },

  /** Complete an order without its not-found buckets: recorded short, then submitted
   *  so packing takes it. Refused while a bucket is still to issue or on a truck. */
  completeShort(oplName: string, reason?: string): Promise<{ message?: { success?: boolean; message?: string; short_pct?: number } }> {
    return api({
      method: 'POST',
      url: '/api/method/upande_packhouse.mobile.api.completeOplShort',
      data: { opl_name: oplName, ...(reason ? { reason } : {}) },
    });
  },

  /** Pack what was issued (at least the Production Settings %, 50 by default) while the
   *  not-found buckets wait for a replacement -- not recorded short; the team moves on.
   *  Server Script `pack_while_waiting_replacement`. */
  packWhileWaiting(oplName: string): Promise<{ message?: { success?: boolean; message?: string; issued_pct?: number } }> {
    return api({
      method: 'POST',
      url: '/api/method/pack_while_waiting_replacement',
      data: { opl_name: oplName },
    });
  },

  /** For a given Order Pick List, get its packing-list rows (one row per
   *  bucket allocated to THAT OPL only — never other OPLs of the same
   *  sale order). */
  async fetchPackingList(oplName: string): Promise<RawPackingListResponse> {
    return api<RawPackingListResponse>({
      method: 'POST',
      url: '/api/method/upande_packhouse.mobile.api.getReadySaleOrderItemsData',
      // The station decides which buckets are here to scan (Karen vs Kapkolia).
      data: { opl_name: oplName, ...(await stationParams()) },
    });
  },

  /** A scanned bucket that is not on the pick list: on a Quality B pick list the server may put it on a row of
   *  its variety (Production Settings > Issue Any Grade B Bucket of the Same Variety); otherwise it refuses. */
  takeScannedBucket(payload: { opl_name: string; bucket: string }): Promise<{ message?: { status?: string; new_bucket?: string } }> {
    return api({
      method: 'POST',
      url: '/api/method/upande_packhouse.quality_b.take_scanned_bucket',
      data: payload,
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
