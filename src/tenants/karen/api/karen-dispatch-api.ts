import { api } from '@/src/core/api/client';

// =====================================================================
// Dispatch is derived from LOADING: the day's loaded boxes (Loading Sheet)
// grouped by order. fetchDispatchLoadedOrders returns that list (by order
// name); rebuildDispatchForm recreates the day's Dispatch Form from it.
// =====================================================================
export type RawLoadedOrder = {
  sales_order?: string;
  order_name?: string;
  customer?: string;
  delivery_point?: string;
  farm?: string;
  consignee?: string;
  boxes_loaded?: number;
};

export type RawLoadedOrdersData = {
  delivery_date?: string;
  loading_sheet?: string | null;
  total_boxes?: number;
  total_orders?: number;
  orders?: RawLoadedOrder[];
};

export type RawLoadedOrdersResponse = {
  message?: { status?: string; message?: string; data?: RawLoadedOrdersData } | string;
};

export type RawRebuildForm = { name?: string; farm?: string; truck?: string; boxes?: number };
export type RawRebuildResponse = {
  message?:
    | { status?: string; message?: string; data?: { forms?: RawRebuildForm[]; total_boxes?: number } }
    | string;
};

export const karenDispatchApi = {
  /** Orders that have been loaded (from the day's Loading Sheet), by order name.
   *  `deliveryDate` optional — server defaults to tomorrow (matches loading). */
  fetchLoadedOrders(deliveryDate?: string): Promise<RawLoadedOrdersResponse> {
    return api<RawLoadedOrdersResponse>({
      method: 'GET',
      url: '/api/method/upande_packhouse.mobile.api.fetchDispatchLoadedOrders',
      params: deliveryDate ? { delivery_date: deliveryDate } : {},
    });
  },

  /** Create or update the day's Dispatch Form(s) from all loaded boxes.
   *  Reuses an existing draft form for the farm+date (updates its rows) or
   *  creates a new one — never deletes. */
  createOrUpdateDispatch(deliveryDate?: string): Promise<RawRebuildResponse> {
    return api<RawRebuildResponse>({
      method: 'POST',
      url: '/api/method/upande_packhouse.mobile.api.createOrUpdateDispatch',
      data: deliveryDate ? { delivery_date: deliveryDate } : {},
    });
  },
};
