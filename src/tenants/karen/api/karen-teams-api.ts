import { api } from '@/src/core/api/client';

/**
 * Canonical Packing Teams list, backed by upande_packhouse.mobile.api.
 * getPackingTeams -- the real source of truth for every team filter in the
 * app (Scheduler, Packing, Issuing, Dashboard), instead of each screen
 * guessing its options from whatever team strings appear on already-loaded
 * orders.
 */
export type RawPackingTeamsResponse = {
  message?: { success?: boolean; teams?: string[]; error?: string };
};

export const karenTeamsApi = {
  fetch(): Promise<RawPackingTeamsResponse> {
    return api<RawPackingTeamsResponse>({
      method: 'GET',
      url: '/api/method/upande_packhouse.mobile.api.getPackingTeams',
    });
  },
};
