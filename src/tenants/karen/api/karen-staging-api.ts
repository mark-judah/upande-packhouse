import { api } from '@/src/core/api/client';

// =====================================================================
// createStagingEntry — stage one scanned box label. The server sets
// `status` + `message` at the TOP LEVEL of the response body:
//   status: 'success' | 'duplicate' | 'error'
// We also tolerate a `message`-wrapped shape for safety.
// =====================================================================
export type RawStagingResponse = {
  status?: string;
  message?: string | { status?: string; message?: string };
};

/** A box waiting in the dispatch coldstore: the spot it was scanned to and since when. */
export type RawColdstoreBox = {
  box_label?: string;
  box_number?: number;
  customer?: string;
  sales_order?: string;
  delivery_date?: string;
  staging_location?: string;
  since?: string;
};

export type RawColdstoreData = {
  location?: string;
  /** Server time, so durations don't depend on the phone's clock. */
  now?: string;
  total?: number;
  delivery_points?: { delivery_point?: string; boxes?: RawColdstoreBox[] }[];
};

export const karenStagingApi = {
  /** Boxes in the dispatch coldstore, not yet loaded, by drop-off point. */
  fetchColdstoreBoxes(location?: string): Promise<{ message?: RawColdstoreData }> {
    return api<{ message?: RawColdstoreData }>({
      method: 'GET',
      url: '/api/method/upande_packhouse.mobile.api.fetchColdstoreBoxes',
      params: location ? { location } : {},
    });
  },

  /** Stage one scanned box label at a dispatch-coldstore location. */
  createStagingEntry(boxLabel: string, location: string): Promise<RawStagingResponse> {
    return api<RawStagingResponse>({
      method: 'POST',
      url: '/api/method/upande_packhouse.mobile.api.createStagingEntry',
      data: { box_label: boxLabel, location },
    });
  },
};
