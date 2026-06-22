import { api } from '@/src/core/api/client';

// =====================================================================
// fetchLoadingData — the day's loading plan for a farm, optionally scoped
// to a vehicle. Multi-truck: with no vehicle the server returns the vehicle
// list + available plans for the delivery date; with a vehicle it returns
// that truck's full plan (drop-off points -> customers -> box types).
// Response: { message: { status, message, data: { ...RawLoadingData } } }
// =====================================================================
export type RawSalesOrderInfo = {
  sales_order?: string;
  order_name?: string;
  truck_details?: string;
  consignee?: string;
  shipping_agent?: string;
  total_qty?: number | string;
  boxes_allocated?: number;
  boxes_packed?: number;
  boxes_staged?: number;
  boxes_loaded?: number;
};

export type RawLoadingPlanItem = {
  loading_position?: number;
  customer?: string;
  delivery_point?: string;
  box_type?: string;
  number_of_boxes?: number;
  orders?: RawSalesOrderInfo[];
  boxes_allocated?: number;
  boxes_packed?: number;
  boxes_staged?: number;
  boxes_loaded?: number;
};

export type RawAvailablePlan = { name?: string; vehicle?: string };
export type RawVehicleInfo = { name?: string; license_plate?: string };

export type RawLoadingTotals = {
  total_boxes_allocated?: number;
  total_boxes_packed?: number;
  total_boxes_staged?: number;
  total_boxes_loaded?: number;
  total_stops?: number;
};

export type RawLoadedBox = {
  box_label?: string;
  box_id?: number;
  customer?: string;
  delivery_point?: string;
  position?: number;
  farm_pack_list?: string;
};

export type RawLoadingSheet = {
  name?: string | null;
  status?: string;
  total_boxes?: number;
  loaded_boxes?: RawLoadedBox[];
};

export type RawLoadingData = {
  delivery_date?: string;
  selected_vehicle?: string;
  has_loading_plan?: boolean;
  loading_plan_name?: string | null;
  available_plans?: RawAvailablePlan[];
  plan_items?: RawLoadingPlanItem[];
  vehicles?: RawVehicleInfo[];
  totals?: RawLoadingTotals;
  loading_sheet?: RawLoadingSheet;
};

export type RawLoadingResponse = {
  message?: { status?: string; message?: string; data?: RawLoadingData } | string;
};

// =====================================================================
// createLoadingEntry — scan a box label onto the day's Loading Sheet for
// the selected vehicle. Payload is wrapped under `data`.
// =====================================================================
export type LoadingEntryPayload = {
  box_label_name: string;
  vehicle: string;
  temperature: number;
  delivery_date: string;
};
export type RawLoadingEntryResponse = {
  message?: { status?: string; message?: string } | string;
};

export const karenLoadingApi = {
  /** The day's loading data for a farm; pass an empty `vehicle` for the
   *  vehicle list + available plans, or a license plate for its plan. */
  fetchLoadingData(farm: string, vehicle: string): Promise<RawLoadingResponse> {
    return api<RawLoadingResponse>({
      method: 'GET',
      url: '/api/method/fetchLoadingData',
      params: { farm, vehicle },
    });
  },

  /** Record one scanned box label onto the selected vehicle's Loading Sheet. */
  createLoadingEntry(payload: LoadingEntryPayload): Promise<RawLoadingEntryResponse> {
    return api<RawLoadingEntryResponse>({
      method: 'POST',
      url: '/api/method/createLoadingEntry',
      data: { data: payload },
    });
  },
};
