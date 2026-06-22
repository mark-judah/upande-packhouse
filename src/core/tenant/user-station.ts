import { useEffect } from 'react';
import { create } from 'zustand';
import { storage, StorageKeys } from '@/src/core/storage';

export type UserStation = {
  userFarm: string;
  /** May be an empty string for tenants that don't track greenhouse (e.g. Xflora). */
  userGreenhouse: string;
};

async function readFromStorage(): Promise<UserStation | null> {
  const raw = await storage.get(StorageKeys.userStation);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<UserStation>;
    if (!parsed.userFarm) return null;
    return {
      userFarm: parsed.userFarm,
      userGreenhouse: parsed.userGreenhouse ?? '',
    };
  } catch {
    return null;
  }
}

type State = {
  station: UserStation | null;
  loaded: boolean;
  hydrate: () => Promise<void>;
  setStation: (next: UserStation) => Promise<void>;
  clearStation: () => Promise<void>;
};

const useStationStoreInternal = create<State>((set) => ({
  station: null,
  loaded: false,
  hydrate: async () => {
    const station = await readFromStorage();
    set({ station, loaded: true });
  },
  setStation: async (next) => {
    await storage.set(StorageKeys.userStation, JSON.stringify(next));
    set({ station: next });
  },
  clearStation: async () => {
    await storage.remove(StorageKeys.userStation);
    set({ station: null });
  },
}));

/**
 * Read + write the device-wide farm + greenhouse configuration.
 *
 * The same configured value is the single source of truth for every page that
 * needs farm/greenhouse. Updating from one screen (e.g. via /configure-station)
 * propagates to every other subscribed screen instantly through the zustand
 * store — no remount required.
 */
export function useUserStation() {
  const station = useStationStoreInternal((s) => s.station);
  const loaded = useStationStoreInternal((s) => s.loaded);
  const setStation = useStationStoreInternal((s) => s.setStation);
  const clearStation = useStationStoreInternal((s) => s.clearStation);
  const hydrate = useStationStoreInternal((s) => s.hydrate);

  useEffect(() => {
    if (!loaded) hydrate();
  }, [loaded, hydrate]);

  return { station, loaded, setStation, clearStation };
}

// Imperative helpers for non-React code paths (rare, but kept for parity).
export const readUserStation = readFromStorage;
export async function writeUserStation(station: UserStation): Promise<void> {
  await useStationStoreInternal.getState().setStation(station);
}
export async function clearUserStation(): Promise<void> {
  await useStationStoreInternal.getState().clearStation();
}
