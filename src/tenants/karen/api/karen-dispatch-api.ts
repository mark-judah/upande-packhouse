import { api } from '@/src/core/api/client';

/** A truck eligible for dispatch — returned by `/api/method/fetchDispatchTrucks`. */
export type RawDispatchTruck = {
  license_plate?: string;
};

export type RawFetchDispatchTrucksResponse = {
  message?:
    | { status?: string; data?: RawDispatchTruck[]; message?: string }
    | RawDispatchTruck[];
};

export type RawCreateDispatchEntryResponse = {
  message?: { status?: string; message?: string } | string;
};

export const karenDispatchApi = {
  /** List trucks currently parked for dispatch. The Frappe server script
   *  wraps responses in `frappe.response.message`, which can be either an
   *  array directly or `{status, data: [...]}`. The repository layer
   *  normalises both shapes. */
  fetchTrucks(): Promise<RawFetchDispatchTrucksResponse> {
    return api<RawFetchDispatchTrucksResponse>({
      method: 'GET',
      url: '/api/method/fetchDispatchTrucks',
    });
  },

  /** Submit one scanned box label against a chosen truck.
   *  POST `/api/method/createDispatchEntry` with `{ truck, box_label }`. */
  createEntry(payload: {
    truck: string;
    box_label: string;
  }): Promise<RawCreateDispatchEntryResponse> {
    return api<RawCreateDispatchEntryResponse>({
      method: 'POST',
      url: '/api/method/createDispatchEntry',
      data: payload,
    });
  },
};
