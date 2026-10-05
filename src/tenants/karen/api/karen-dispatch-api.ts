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
  boxes_required?: number;
  boxes_loaded?: number;
};

/** A box staged in the dispatch coldstore (staged=1) that never got scanned
 *  loaded onto the truck -- dispatch must not confirm while any exist. */
export type RawMissingBox = {
  box_label?: string;
  box_number?: number;
  order_pick_list?: string;
  customer?: string;
  delivery_point?: string;
  staging_location?: string;
};

export type RawLoadedOrdersData = {
  delivery_date?: string;
  /** The location the data is for, and the locations to choose from (Loading Plan). */
  location?: string;
  locations?: string[];
  loading_sheet?: string | null;
  loading_sheet_status?: string;
  /** True once this date's Loading Sheet has been confirmed Departed --
   *  dispatch is a one-time action, so the UI locks once this is true. */
  dispatched?: boolean;
  seal_number?: string;
  total_boxes?: number;
  total_orders?: number;
  orders?: RawLoadedOrder[];
  missing_boxes?: RawMissingBox[];
};

export type RawLoadedOrdersResponse = {
  message?: { status?: string; message?: string; data?: RawLoadedOrdersData } | string;
};

export type RawRebuildForm = { name?: string; farm?: string; truck?: string; boxes?: number };
export type RawRebuildData = {
  forms?: RawRebuildForm[];
  total_boxes?: number;
  seal_number?: string;
  dispatched?: boolean;
  /** Present when the server refused to confirm because staged boxes were
   *  never loaded (see createOrUpdateDispatch's missing_boxes check). */
  missing_boxes?: RawMissingBox[];
};
export type RawRebuildResponse = {
  message?: { status?: string; message?: string; data?: RawRebuildData; missing_boxes?: RawMissingBox[] } | string;
};

export const karenDispatchApi = {
  /** Orders that have been loaded (from the day's Loading Sheet), by order name.
   *  `deliveryDate` optional — server defaults to tomorrow (matches loading). */
  fetchLoadedOrders(deliveryDate?: string, location?: string): Promise<RawLoadedOrdersResponse> {
    return api<RawLoadedOrdersResponse>({
      method: 'GET',
      url: '/api/method/upande_packhouse.mobile.api.fetchDispatchLoadedOrders',
      params: {
        ...(deliveryDate ? { delivery_date: deliveryDate } : {}),
        // Only that location's orders (its Loading Plans) and its own departure.
        ...(location ? { location } : {}),
      },
    });
  },

  /** Confirm dispatch for the day: builds the Delivery Note(s) from all loaded
   *  boxes and records the truck's seal number. One-time — the server refuses
   *  a repeat call once the day's Loading Sheet is marked Departed. */
  createOrUpdateDispatch(
    deliveryDate: string | undefined,
    sealNumber: string,
    location?: string,
  ): Promise<RawRebuildResponse> {
    return api<RawRebuildResponse>({
      method: 'POST',
      url: '/api/method/upande_packhouse.mobile.api.createOrUpdateDispatch',
      data: {
        ...(deliveryDate ? { delivery_date: deliveryDate } : {}),
        seal_number: sealNumber,
        // Dispatches only this location's orders; the other location confirms its own.
        ...(location ? { location } : {}),
      },
    });
  },
};
