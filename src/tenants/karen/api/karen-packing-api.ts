import { api } from '@/src/core/api/client';

// =====================================================================
// fetchPicklists — list of order pick lists available for packing.
// Real shape: { message: { success, data: [{opl_name, order_name, item_group}], count } }
// =====================================================================
export type RawOplItem = {
  opl_name?: string;
  order_name?: string;
  item_group?: string;
  team?: string;
  customer?: string;
  varieties?: string[];
  stem_lengths?: string[];
  qty?: string | number;
};
export type RawPicklistsResponse = {
  message?: { success?: boolean; data?: RawOplItem[]; count?: number };
};

// =====================================================================
// get_pick_list_with_farm_pack_list — the order, what's already packed,
// and the packing guide. Payload lives at TOP-LEVEL `data` (the server
// script sets frappe.response["data"] directly). We tolerate the
// `message`-wrapped shape too for safety.
// =====================================================================
export type RawPickListItem = {
  item_code?: string;
  item_name?: string;
  qty?: number | string;
  stock_qty?: number | string;
  uom?: string;
  warehouse?: string;
  custom_box_id?: number;
  custom_stem_length?: string;
  custom_sale_order_item?: string;
  /** Specification (Sales Order Item `custom_line`), e.g. "DI05 CERISE 52CM". */
  custom_spec?: string;
  /** Stem length from the Sales Order Item (`custom_length`). */
  custom_so_length?: string;
  /** Item group of this variety (e.g. "Standard Roses" vs "Spray Roses"): the
   *  server attaches it per line so packing can pick scan vs manual entry. */
  item_group?: string;
};

export type RawPackListItem = {
  item_code?: string;
  bunch_uom?: string;
  bunch_qty?: number | string;
  custom_number_of_stems?: number | string;
  /** The real persisted stems figure (Farm Packlist Item's actual field --
   *  see farm_packlist_item.json; that doctype has no custom_number_of_stems
   *  field at all, so a returned row's stems always come back here). */
  stock_qty?: number | string;
  stem_length?: string;
  box_id?: string;
  bunch_id?: string;
};

export type RawFarmPackList = {
  custom_sales_order?: string;
  custom_farm?: string;
  pack_list_item?: RawPackListItem[];
};

export type RawPackingGuideItem = {
  item_code?: string;
  item_name?: string;
  length?: string;
  planned_stems?: number;
  packed_stems?: number | string;
  remaining_stems?: number;
  percentage_complete?: number;
  boxes_contribution?: number;
};

export type RawPackingGuide = {
  pick_list?: string;
  sales_order?: string;
  item_group?: string;
  customer?: string;
  delivery_date?: string;
  farm?: string;
  is_mixed?: boolean;
  box_type?: string;
  planned_boxes?: number | null;
  packrate_per_box?: number | string;
  planned_total_stems?: number;
  packed_total_stems?: number | string;
  remaining_stems?: number;
  overall_percentage?: number;
  items?: RawPackingGuideItem[];
  /** Mixed-bunch bouquet: recipe (per-bunch colour/variety/stems) + spec + guide image. */
  is_mixed_bunch?: boolean;
  bouquet_guide?: {
    colour?: string;
    variety?: string;
    variety_name?: string;
    stems_per_bunch?: number | string;
    length?: string;
  }[];
  spec?: string;
  /** File URL of the spec's guide image (may be a /private/files/… path). */
  spec_image?: string;
};

export type RawOrderPickList = {
  name?: string;
  docstatus?: number;
  sales_order?: string;
  customer?: string;
  custom_farm?: string;
  locations?: RawPickListItem[];
};

export type RawPickListWithFpl = {
  order_pick_list?: RawOrderPickList;
  farm_pack_lists?: RawFarmPackList[];
  packing_guide?: RawPackingGuide;
};

export type RawPickListWithFplResponse = {
  data?: RawPickListWithFpl;
  message?: RawPickListWithFpl | { data?: RawPickListWithFpl };
};

// =====================================================================
// fetchStockEntryByBunch — grade/stock details for a scanned bunch.
// Real shape: { message: {... , items:[{item_code, uom}], scanned_packing,
//               stock_entry_type, bunch_id, stem_length, bunch_size } }
// On failure the server returns { message: { error: true, message } }.
// =====================================================================
export type RawBunchEntry = {
  name?: string;
  scanned_packing?: number;
  stock_entry_type?: string;
  bunch_id?: string;
  stem_length?: string;
  bunch_size?: string;
  items?: { item_code?: string; uom?: string }[];
};
export type RawBunchResponse = {
  message?: RawBunchEntry | { error?: boolean; message?: string };
};

// =====================================================================
// createOrUpdateFarmPackList — record packed bunches into a box.
// =====================================================================
export type PackListItemPayload = {
  item_code: string;
  bunch_uom: string;
  bunch_qty: number;
  source_warehouse: string;
  sales_order_id: string;
  customer_id: string;
  custom_number_of_stems: number;
  custom_stem_length: string;
  box_id: string;
  bunch_id: string | null;
};
export type RawCreateFplResponse = {
  message?: { status?: string; message?: string } | string;
};

// =====================================================================
// getUnderPackReasons / setPackListBoxUnderPackReason — the Under Pack
// Reason master, and saving a chosen reason against a box.
// =====================================================================
export type RawUnderPackReason = { name?: string; reason?: string; description?: string };
export type RawUnderPackReasonsResponse = {
  data?: RawUnderPackReason[];
};

export type RawSetReasonResponse = {
  data?: { status?: string; message?: string };
  message?: { status?: string; message?: string } | string;
};

// =====================================================================
// getPackingBypassReasons / createPackingBypass — the Packing Bypass
// Reason master, and logging a bypassed (unscannable) bunch count.
// =====================================================================
export type RawPackingBypassReason = { name?: string; reason?: string; description?: string };
export type RawPackingBypassReasonsResponse = {
  data?: RawPackingBypassReason[];
};
export type RawPackingBypassResponse = {
  data?: { status?: string; message?: string; docname?: string };
};

export const karenPackingApi = {
  /** List order pick lists for a given day (YYYY-MM-DD; defaults to today). */
  fetchPicklists(date: string): Promise<RawPicklistsResponse> {
    return api<RawPicklistsResponse>({
      method: 'GET',
      url: '/api/method/upande_packhouse.mobile.api.fetchPicklists',
      params: { date },
    });
  },

  /** Order + already-packed + packing guide for one OPL. */
  fetchPickListWithFpl(oplId: string): Promise<RawPickListWithFplResponse> {
    return api<RawPickListWithFplResponse>({
      method: 'GET',
      url: '/api/method/upande_packhouse.mobile.api.get_pick_list_with_farm_pack_list',
      params: { pick_list_id: oplId },
    });
  },

  /** Grade/stock details for a scanned bunch (action = "packing"). */
  fetchBunchForPacking(bunchId: string): Promise<RawBunchResponse> {
    return api<RawBunchResponse>({
      method: 'POST',
      url: '/api/method/upande_packhouse.mobile.api.fetchStockEntryByBunch',
      data: { custom_bunch_id: bunchId, action: 'packing' },
    });
  },

  /** Record one or more packed bunches into a box on the farm pack list. */
  createOrUpdateFarmPackList(payload: {
    custom_farm: string;
    custom_customer: string;
    custom_sales_order: string;
    custom_order_pick_list: string;
    items: PackListItemPayload[];
  }): Promise<RawCreateFplResponse> {
    return api<RawCreateFplResponse>({
      method: 'POST',
      url: '/api/method/upande_packhouse.mobile.api.createOrUpdateFarmPackList',
      data: payload,
    });
  },

  /** List the Under Pack Reason master, for the reason picker. */
  fetchUnderPackReasons(): Promise<RawUnderPackReasonsResponse> {
    return api<RawUnderPackReasonsResponse>({
      method: 'GET',
      url: '/api/method/upande_packhouse.mobile.api.getUnderPackReasons',
    });
  },

  /** Save an Under Pack Reason against a box. Requires at least one item
   *  already packed into that box on this OPL. */
  setPackListBoxUnderPackReason(payload: {
    order_pick_list: string;
    box_id: string;
    reason: string;
  }): Promise<RawSetReasonResponse> {
    return api<RawSetReasonResponse>({
      method: 'POST',
      url: '/api/method/upande_packhouse.mobile.api.setPackListBoxUnderPackReason',
      data: payload,
    });
  },

  /** List the Packing Bypass Reason master, for the bypass picker. */
  fetchPackingBypassReasons(): Promise<RawPackingBypassReasonsResponse> {
    return api<RawPackingBypassReasonsResponse>({
      method: 'GET',
      url: '/api/method/upande_packhouse.mobile.api.getPackingBypassReasons',
    });
  },

  /** Log a packing bypass (unscannable bunches) against an OPL/box. Does
   *  NOT itself update the box tally -- pair with createOrUpdateFarmPackList
   *  for that, same as a manually-entered pack. Farm is derived server-side
   *  from the OPL's Sales Order, not sent from here. */
  createPackingBypass(payload: {
    order_pick_list: string;
    box_id: string;
    reason: string;
    bunches: number;
  }): Promise<RawPackingBypassResponse> {
    return api<RawPackingBypassResponse>({
      method: 'POST',
      url: '/api/method/upande_packhouse.mobile.api.createPackingBypass',
      data: payload,
    });
  },
};
