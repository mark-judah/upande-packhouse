import { create } from 'zustand';
import { onStationChange, readUserStation } from '@/src/core/tenant/user-station';
import { karenTeamsApi } from '../api/karen-teams-api';

/** Canonical Packing Teams list, fetched once and shared by every screen's
 *  team filter. Fetch-once-per-session pattern (mirrors loadUnderPackReasons
 *  / loadPackingBypassReasons in karen-packing-store) -- the list changes
 *  rarely enough that a single load per app session is enough. */
interface TeamsState {
  teams: string[];
  loading: boolean;
  loaded: boolean;
  /** The station the list was read for: another station reads its own teams again. */
  station: string;
  load: () => Promise<void>;
}

export const useKarenTeamsStore = create<TeamsState>((set, get) => ({
  teams: [],
  loading: false,
  loaded: false,
  station: '',

  load: async () => {
    // Read every time a screen opens: the station's own teams, never a list kept from before.
    const station = (await readUserStation())?.userFarm ?? '';
    if (get().loading && get().station === station) return;
    set({ loading: true, station });
    try {
      const raw = await karenTeamsApi.fetch();
      const m = raw?.message;
      const teams = m?.success && Array.isArray(m.teams) ? m.teams.filter((t): t is string => !!t) : [];
      // a newer read (another station) wins
      if (get().station !== station) return;
      set({ teams, loading: false, loaded: true });
    } catch {
      // Filter options are a convenience, not critical data -- fail quiet
      // and let screens fall back to whatever team strings they already
      // have loaded locally.
      set({ loading: false, loaded: true });
    }
  },
}));

// Another station picked: its own teams, at once, on every screen showing a team filter.
onStationChange(() => {
  useKarenTeamsStore.setState({ loaded: false, teams: [] });
  void useKarenTeamsStore.getState().load();
});
