import { useEffect } from 'react';
import { create } from 'zustand';
import { instanceKey } from '@/src/core/auth/known-instances';
import { storage, StorageKeys } from '@/src/core/storage';

export type UserStation = {
  userFarm: string;
  /** May be an empty string for tenants that don't track greenhouse (e.g. Xflora). */
  userGreenhouse: string;
};

/** The server the app is on (signed in, or last signed in to). */
async function serverKey(): Promise<string> {
  const [url, backup] = await Promise.all([
    storage.get(StorageKeys.instanceUrl),
    storage.get(StorageKeys.instanceUrlBackup),
  ]);
  return instanceKey(url || backup);
}

async function readStations(): Promise<Record<string, UserStation>> {
  try {
    return JSON.parse((await storage.get(StorageKeys.stationsByServer)) || '{}') || {};
  } catch {
    return {};
  }
}

/** This server's station, kept per server: a logout or a visit to another server never loses it. */
async function rememberStation(station: UserStation | null): Promise<void> {
  const key = await serverKey();
  if (!key) return;
  const all = await readStations();
  if (station) all[key] = station;
  else delete all[key];
  await storage.set(StorageKeys.stationsByServer, JSON.stringify(all));
}

async function readFromStorage(): Promise<UserStation | null> {
  let raw = await storage.get(StorageKeys.userStation);
  if (!raw) {
    // signed out, or back from another server: this server's station as it was configured
    const kept = (await readStations())[await serverKey()];
    if (!kept?.userFarm) return null;
    await storage.set(StorageKeys.userStation, JSON.stringify(kept));
    raw = JSON.stringify(kept);
  }
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
    await rememberStation(next);
    set({ station: next });
  },
  clearStation: async () => {
    await storage.remove(StorageKeys.userStation);
    await rememberStation(null);
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
/** `{ station }` for a request scoped to this device's station (Karen and Ravine share
 *  packing teams, not orders); empty when no station is set. */
export async function stationParams(): Promise<{ station?: string }> {
  const station = await readFromStorage();
  return station?.userFarm ? { station: station.userFarm } : {};
}
export async function writeUserStation(station: UserStation): Promise<void> {
  await useStationStoreInternal.getState().setStation(station);
}
export async function clearUserStation(): Promise<void> {
  await useStationStoreInternal.getState().clearStation();
}
/** Call `fn` with the station's farm whenever the configured station changes; returns the unsubscribe. */
export function onStationChange(fn: (farm: string) => void): () => void {
  return useStationStoreInternal.subscribe((s, prev) => {
    const farm = s.station?.userFarm ?? '';
    if (farm !== (prev.station?.userFarm ?? '')) fn(farm);
  });
}

/** Read the station again (after signing in): this server's own, restored from what it was set to. */
export async function reloadUserStation(): Promise<void> {
  await useStationStoreInternal.getState().hydrate();
}
