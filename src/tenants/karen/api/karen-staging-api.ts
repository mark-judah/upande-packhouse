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

export const karenStagingApi = {
  /** Stage one scanned box label at a dispatch-coldstore location. */
  createStagingEntry(boxLabel: string, location: string): Promise<RawStagingResponse> {
    return api<RawStagingResponse>({
      method: 'POST',
      url: '/api/method/upande_packhouse.mobile.api.createStagingEntry',
      data: { box_label: boxLabel, location },
    });
  },
};
