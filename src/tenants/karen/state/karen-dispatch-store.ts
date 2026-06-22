import { create } from 'zustand';
import { karenDispatchApi } from '../api/karen-dispatch-api';
import type {
  RawFetchDispatchTrucksResponse,
  RawCreateDispatchEntryResponse,
} from '../api/karen-dispatch-api';
import { mapAxiosError } from '@/src/core/api/client';

export type DispatchTruck = { licensePlate: string };

export type DispatchOutcome =
  | { kind: 'success'; boxLabel: string; truck: string; message?: string }
  | { kind: 'error'; message: string };

type State = {
  trucks: DispatchTruck[];
  trucksLoading: boolean;
  selectedTruck: string | null;
  submitting: boolean;
  lastOutcome: DispatchOutcome | null;

  loadTrucks: () => Promise<void>;
  setSelectedTruck: (plate: string | null) => void;
  submitBoxLabel: (boxLabel: string) => Promise<DispatchOutcome>;
  reset: () => void;
};

function extractTrucks(raw: RawFetchDispatchTrucksResponse): DispatchTruck[] {
  const msg = raw?.message;
  if (!msg) return [];
  // `frappe.response.message` may be the array directly OR { status, data }
  const list = Array.isArray(msg) ? msg : (msg.data ?? []);
  return list
    .map((t) => ({ licensePlate: (t.license_plate ?? '').trim() }))
    .filter((t) => t.licensePlate.length > 0);
}

function extractMessage(raw: RawCreateDispatchEntryResponse): string {
  const m = raw?.message;
  if (!m) return '';
  if (typeof m === 'string') return m;
  return m.message ?? '';
}

export const useKarenDispatchStore = create<State>((set, get) => ({
  trucks: [],
  trucksLoading: false,
  selectedTruck: null,
  submitting: false,
  lastOutcome: null,

  loadTrucks: async () => {
    set({ trucksLoading: true });
    try {
      const raw = await karenDispatchApi.fetchTrucks();
      const trucks = extractTrucks(raw);
      set({ trucks, trucksLoading: false });
    } catch (err) {
      const message = mapAxiosError(err).message;
      set({
        trucksLoading: false,
        trucks: [],
        lastOutcome: { kind: 'error', message: message || 'Could not load trucks.' },
      });
    }
  },

  setSelectedTruck: (plate) => set({ selectedTruck: plate }),

  submitBoxLabel: async (boxLabel) => {
    const truck = get().selectedTruck;
    if (!truck) {
      const outcome: DispatchOutcome = {
        kind: 'error',
        message: 'Select a truck before scanning a box.',
      };
      set({ lastOutcome: outcome });
      return outcome;
    }
    const cleaned = boxLabel.trim();
    if (!cleaned) {
      const outcome: DispatchOutcome = { kind: 'error', message: 'Empty box scan.' };
      set({ lastOutcome: outcome });
      return outcome;
    }

    set({ submitting: true });
    try {
      const raw = await karenDispatchApi.createEntry({ truck, box_label: cleaned });
      const outcome: DispatchOutcome = {
        kind: 'success',
        truck,
        boxLabel: cleaned,
        message: extractMessage(raw) || undefined,
      };
      set({ submitting: false, lastOutcome: outcome });
      return outcome;
    } catch (err) {
      const message = mapAxiosError(err).message || 'Could not submit dispatch entry.';
      const outcome: DispatchOutcome = { kind: 'error', message };
      set({ submitting: false, lastOutcome: outcome });
      return outcome;
    }
  },

  reset: () =>
    set({
      trucks: [],
      trucksLoading: false,
      selectedTruck: null,
      submitting: false,
      lastOutcome: null,
    }),
}));
