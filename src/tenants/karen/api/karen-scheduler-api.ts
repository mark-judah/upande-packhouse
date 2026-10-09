import { api } from '@/src/core/api/client';
import { stationParams } from '@/src/core/tenant/user-station';

/** A pick-list line inside a scheduler OPL — carries the per-bucket status flags. */
export type RawSchedulerLocation = {
  item_code?: string;
  item_name?: string;
  stock_qty?: number | string;
  custom_ready_for_packing?: number;
  // v16 sends the transfer flags bare; the custom_* names are the v15 ones.
  bucket?: string;
  stem_length?: string;
  awaiting_transfer?: number;
  loaded_in_trolley?: number;
  in_transit?: number;
  shelved?: number;
  issued?: number;
  custom_bucket?: string;
  custom_stem_length?: string;
  custom_awaiting_transfer?: number;
  custom_loaded_in_trolley?: number;
  custom_in_transit?: number;
  custom_shelved?: number;
  custom_issued?: number;
};

/** A spec line on the OPL — from the Sales Order Item the pick-list lines reference. */
export type RawSchedulerSpec = {
  spec?: string; // custom_line, e.g. "AGT 926 PINK 62CM"
  variety?: string; // item_code
  length?: string; // e.g. "62cm"
  box_type?: string;
  boxes?: number;
};

export type RawSchedulerOpl = {
  name?: string;
  customer?: string;
  order_name?: string;
  team?: string;
  custom_order_name?: string;
  custom_farm?: string;
  custom_team?: string;
  custom_total_stems?: number | string;
  custom_issuing_percentage?: number | string;
  sales_order?: string;
  box_labels_count?: number;
  staged_boxes?: number;
  loaded_boxes?: number;
  locations?: RawSchedulerLocation[];
  specs?: RawSchedulerSpec[];
  planned_boxes?: number;
  packrate?: number; // stems per box (derived: total stems / boxes)
};

export type RawSchedulerDataResponse = {
  message?: { success?: boolean; data?: RawSchedulerOpl[]; date?: string; error?: string };
};

export type RawSchedulerMetaResponse = {
  message?: {
    success?: boolean;
    takt_minutes?: number;
    schedule?: Record<string, number>;
    /** Where each order's stock is: 'hub' (at Kapkolia), 'remote' (coming from a farm), 'issued'. */
    where?: Record<string, 'hub' | 'remote' | 'issued'>;
    created?: Record<string, string>;
    packed?: Record<string, number>;
    error?: string;
  };
};

export type RawSetOrderResponse = {
  message?: { success?: boolean; updated?: number; error?: string };
};

// The server scripts are safe_exec (no JSON parsing) — lists arrive as a
// "|~|"-joined string.
const JOIN = '|~|';

export const karenSchedulerApi = {
  /** OPLs for a delivery date (default today) with per-bucket status + box counts. */
  async fetchData(deliveryDate: string): Promise<RawSchedulerDataResponse> {
    return api<RawSchedulerDataResponse>({
      method: 'GET',
      url: '/api/method/upande_packhouse.mobile.api.getSchedulerData',
      params: { delivery_date: deliveryDate, ...(await stationParams()) },
    });
  },

  /** Takt + persisted schedule numbers + packed signal for the given OPLs. */
  fetchMeta(oplNames: string[]): Promise<RawSchedulerMetaResponse> {
    return api<RawSchedulerMetaResponse>({
      method: 'POST',
      url: '/api/method/upande_packhouse.mobile.api.getSchedulerMeta',
      data: { names: oplNames.join(JOIN) },
    });
  },

  /** Persist the queue order (top→bottom) as custom_schedule_number = 1..N. */
  setOrder(oplNames: string[]): Promise<RawSetOrderResponse> {
    return api<RawSetOrderResponse>({
      method: 'POST',
      url: '/api/method/upande_packhouse.mobile.api.setSchedulerOrder',
      data: { order: oplNames.join(JOIN) },
    });
  },
};
