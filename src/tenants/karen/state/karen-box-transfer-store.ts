import { create } from 'zustand';
import { mapAxiosError } from '@/src/core/api/client';
import { tomorrowISO } from '@/src/core/date';
import { storage } from '@/src/core/storage';
import { readUserStation } from '@/src/core/tenant/user-station';
import {
  karenBoxTransferApi,
  type RawTransferBox,
  type RawTransferReply,
  type RawTransferTrip,
} from '../api/karen-box-transfer-api';
import { extractBoxLabel } from './karen-staging-store';

export type TransferBox = {
  boxLabel: string;
  boxNumber: number;
  customer: string;
  orderName: string;
  variety: string;
  length: string;
  farm: string;
  status: string;
  staged: boolean;
  vehicle: string;
  loadedAt: string;
  sentAt: string;
  receivedAt: string;
};

export type TransferTrip = {
  key: string;
  vehicle: string;
  sentAt: string;
  from: string;
  to: string;
  /** Loading, On the way, Partly received, Received. */
  status: string;
  total: number;
  received: number;
  receivedAt: string;
  boxes: TransferBox[];
};

const mapTrip = (t: RawTransferTrip): TransferTrip => ({
  key: `${t.vehicle ?? ''}|${t.sent_at ?? ''}`,
  vehicle: String(t.vehicle ?? ''),
  sentAt: String(t.sent_at ?? ''),
  from: String(t.from ?? ''),
  to: String(t.to ?? ''),
  status: String(t.status ?? ''),
  total: Number(t.total ?? 0),
  received: Number(t.received ?? 0),
  receivedAt: String(t.received_at ?? ''),
  boxes: (t.boxes ?? []).map(mapBox),
});

export type TransferOutcome = { kind: 'success' | 'warning' | 'error'; message: string };

/** Where the station's chosen transfer truck is remembered. */
async function truckKey(): Promise<string> {
  const farm = (await readUserStation())?.userFarm ?? '';
  return `boxTransferTruck:${farm}`;
}

const mapBox = (b: RawTransferBox): TransferBox => ({
  boxLabel: String(b.box_label ?? ''),
  boxNumber: Number(b.box_number ?? 0),
  customer: String(b.customer ?? ''),
  orderName: String(b.order_name ?? ''),
  variety: String(b.variety ?? ''),
  length: String(b.length ?? ''),
  farm: String(b.farm ?? ''),
  status: String(b.status ?? ''),
  staged: !!Number(b.staged ?? 0),
  vehicle: String(b.vehicle ?? ''),
  loadedAt: String(b.loaded_at ?? ''),
  sentAt: String(b.sent_at ?? ''),
  receivedAt: String(b.received_at ?? ''),
});

/** The server's reply: success / duplicate / error with its message. */
function outcome(res: RawTransferReply, fallback: string): TransferOutcome {
  const m = res?.message ?? {};
  if (m.status === 'success') return { kind: 'success', message: m.message || fallback };
  if (m.status === 'duplicate') return { kind: 'warning', message: m.message || fallback };
  return { kind: 'error', message: m.message || 'Something went wrong.' };
}

type State = {
  date: string;
  loading: boolean;
  submitting: boolean;
  error: string | null;
  role: 'send' | 'receive' | 'none' | '';
  main: string;
  trucks: { name: string; label: string }[];
  vehicle: string;
  /** The station the truck was picked for. */
  vehicleFor: string;
  toLoad: TransferBox[];
  notStaged: TransferBox[];
  loaded: TransferBox[];
  inTransit: TransferBox[];
  received: TransferBox[];
  trips: TransferTrip[];
  setDate: (d: string) => void;
  setVehicle: (v: string) => void;
  load: () => Promise<void>;
  scan: (raw: string) => Promise<TransferOutcome>;
  send: () => Promise<TransferOutcome>;
  receiveTrip: (trip: TransferTrip, count: number) => Promise<TransferOutcome>;
  reset: () => void;
};

const EMPTY = {
  loading: false,
  submitting: false,
  error: null,
  role: '' as const,
  main: '',
  trucks: [],
  toLoad: [],
  notStaged: [],
  loaded: [],
  inTransit: [],
  received: [],
  trips: [],
};

export const useKarenBoxTransferStore = create<State>((set, get) => ({
  date: tomorrowISO(),
  vehicle: '',
  vehicleFor: '',
  ...EMPTY,

  setDate: (d) => {
    set({ date: d });
    void get().load();
  },
  // One truck for the transfers: chosen once, kept for every scan and remembered for the station.
  setVehicle: (v) => {
    set({ vehicle: v });
    void readUserStation().then((s) => set({ vehicleFor: s?.userFarm ?? '' }));
    void truckKey().then((k) => storage.set(k, v).catch(() => {}));
  },

  load: async () => {
    // another station: its own truck, not the one picked for the last
    const farm = (await readUserStation())?.userFarm ?? '';
    if (get().vehicleFor !== farm) set({ vehicle: '', vehicleFor: farm });
    set({ loading: true, error: null });
    try {
      const raw = (await karenBoxTransferApi.fetch(get().date))?.message ?? {};
      set({
        loading: false,
        role: raw.role ?? 'none',
        main: raw.main ?? '',
        trucks: (raw.trucks ?? []).map((t) => ({ name: t.name, label: t.label || t.name })),
        toLoad: (raw.to_load ?? []).map(mapBox),
        notStaged: (raw.not_staged ?? []).map(mapBox),
        loaded: (raw.loaded ?? []).map(mapBox),
        inTransit: (raw.in_transit ?? []).map(mapBox),
        received: (raw.received ?? []).map(mapBox),
        trips: (raw.trips ?? []).map(mapTrip),
      });
      // No truck picked yet: the one being loaded here, else the one this station used last.
      if (!get().vehicle && raw.role === 'send') {
        const names = new Set((raw.trucks ?? []).map((t) => t.name));
        const loading = (raw.loaded ?? []).map((b) => String(b.vehicle ?? '')).find((v) => names.has(v));
        const last = await storage.get(await truckKey()).catch(() => null);
        const pick = loading || (last && names.has(last) ? last : '');
        if (pick && !get().vehicle) set({ vehicle: pick });
      }
    } catch (err) {
      set({ loading: false, error: mapAxiosError(err).message || 'Could not load the boxes.' });
    }
  },

  // A box scanned: onto the chosen truck at a sending farm, received at the main sales farm.
  scan: async (raw) => {
    const box = extractBoxLabel(raw);
    if (!box) return { kind: 'warning', message: 'Please scan a valid box QR code.' };
    const { role, vehicle } = get();
    if (role === 'send' && !vehicle) return { kind: 'warning', message: 'Pick the transfer truck first.' };
    set({ submitting: true });
    try {
      const res =
        role === 'receive' ? await karenBoxTransferApi.receive(box) : await karenBoxTransferApi.load(box, vehicle);
      const out = outcome(res, role === 'receive' ? `Box ${box} received.` : `Box ${box} loaded.`);
      set({ submitting: false });
      void get().load();
      return out;
    } catch (err) {
      set({ submitting: false });
      return { kind: 'error', message: mapAxiosError(err).message || 'Scan failed.' };
    }
  },

  send: async () => {
    const { vehicle } = get();
    if (!vehicle) return { kind: 'warning', message: 'Pick the transfer truck first.' };
    set({ submitting: true });
    try {
      const out = outcome(await karenBoxTransferApi.send(vehicle), `${vehicle} sent.`);
      set({ submitting: false });
      void get().load();
      return out;
    } catch (err) {
      set({ submitting: false });
      return { kind: 'error', message: mapAxiosError(err).message || 'Could not send the truck.' };
    }
  },

  receiveTrip: async (trip, count) => {
    set({ submitting: true });
    try {
      const out = outcome(
        await karenBoxTransferApi.receiveTrip(trip.vehicle, trip.sentAt, count),
        `All boxes on ${trip.vehicle} received.`,
      );
      set({ submitting: false });
      void get().load();
      return out;
    } catch (err) {
      set({ submitting: false });
      return { kind: 'error', message: mapAxiosError(err).message || 'Could not receive the trip.' };
    }
  },

  // the truck stays: it is the station's transfer truck until another is picked
  reset: () => set({ ...EMPTY, date: tomorrowISO() }),
}));
