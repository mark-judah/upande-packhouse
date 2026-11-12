import { api } from '@/src/core/api/client';
import { stationParams } from '@/src/core/tenant/user-station';

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
  /** The station's own teams: a sales farm's station lists only the teams assigned to that farm. */
  async fetch(): Promise<RawPackingTeamsResponse> {
    return api<RawPackingTeamsResponse>({
      method: 'GET',
      url: '/api/method/upande_packhouse.mobile.api.getPackingTeams',
      params: await stationParams(),
    });
  },
};
