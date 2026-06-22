import { create } from 'zustand';
import { stationRepository, type Farm } from './repository';
import { mapAxiosError } from '@/src/core/api/client';

type State = {
  farms: Farm[];
  greenhouses: string[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
};

export const useStationStore = create<State>((set) => ({
  farms: [],
  greenhouses: [],
  loading: false,
  error: null,
  load: async () => {
    set({ loading: true, error: null });
    try {
      const [farms, greenhouses] = await Promise.all([
        stationRepository.fetchFarms(),
        stationRepository.fetchGreenhouseWarehouses(),
      ]);
      set({ farms, greenhouses, loading: false });
    } catch (err) {
      set({ loading: false, error: mapAxiosError(err).message });
    }
  },
}));
