import { create } from 'zustand';
import { karenTeamsApi } from '../api/karen-teams-api';

/** Canonical Packing Teams list, fetched once and shared by every screen's
 *  team filter. Fetch-once-per-session pattern (mirrors loadUnderPackReasons
 *  / loadPackingBypassReasons in karen-packing-store) -- the list changes
 *  rarely enough that a single load per app session is enough. */
interface TeamsState {
  teams: string[];
  loading: boolean;
  loaded: boolean;
  load: () => Promise<void>;
}

export const useKarenTeamsStore = create<TeamsState>((set, get) => ({
  teams: [],
  loading: false,
  loaded: false,

  load: async () => {
    if (get().loading || get().loaded) return;
    set({ loading: true });
    try {
      const raw = await karenTeamsApi.fetch();
      const m = raw?.message;
      const teams = m?.success && Array.isArray(m.teams) ? m.teams.filter((t): t is string => !!t) : [];
      set({ teams, loading: false, loaded: true });
    } catch {
      // Filter options are a convenience, not critical data -- fail quiet
      // and let screens fall back to whatever team strings they already
      // have loaded locally.
      set({ loading: false, loaded: true });
    }
  },
}));
