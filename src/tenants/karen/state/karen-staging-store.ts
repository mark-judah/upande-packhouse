import { create } from 'zustand';
import { karenStagingApi } from '../api/karen-staging-api';
import type { RawColdstoreData, RawStagingResponse } from '../api/karen-staging-api';
import { mapAxiosError } from '@/src/core/api/client';

export type StageOutcome =
  | { kind: 'success'; message?: string }
  | { kind: 'error'; message: string }
  | { kind: 'warning'; message: string };

export type ColdstoreBox = {
  boxLabel: string;
  boxNumber: number;
  customer: string;
  salesOrder: string;
  spot: string;
  /** When it reached the spot, as epoch ms on the server's clock. */
  sinceMs: number;
};

export type ColdstoreGroup = { deliveryPoint: string; boxes: ColdstoreBox[] };

/** "2026-10-24 11:27:49.645940" (server local time) -> epoch ms, both sides read alike. */
function parseServerTime(v?: string): number {
  if (!v) return 0;
  const t = Date.parse(v.replace(' ', 'T').slice(0, 23));
  return Number.isNaN(t) ? 0 : t;
}

function mapColdstore(data: RawColdstoreData | undefined): { groups: ColdstoreGroup[]; skewMs: number } {
  const now = parseServerTime(data?.now);
  return {
    // Phone clock minus server clock, so "time there" ticks on the phone but measures on the server.
    skewMs: now ? Date.now() - now : 0,
    groups: (data?.delivery_points ?? []).map((g) => ({
      deliveryPoint: (g.delivery_point ?? '').toString(),
      boxes: (g.boxes ?? []).map((b) => ({
        boxLabel: (b.box_label ?? '').toString(),
        boxNumber: Number(b.box_number ?? 0),
        customer: (b.customer ?? '').toString(),
        salesOrder: (b.sales_order ?? '').toString(),
        spot: (b.staging_location ?? '').toString(),
        sinceMs: parseServerTime(b.since),
      })),
    })),
  };
}

type State = {
  submitting: boolean;
  lastOutcome: StageOutcome | null;
  /** Current dispatch-coldstore location (from a scanned location QR). */
  location: string;
  /** Set the staging location from a scanned location QR. */
  setLocation: (raw: string) => void;
  /** Parse a scanned box QR, stage it at the current location, return the outcome. */
  submitScan: (raw: string) => Promise<StageOutcome>;
  /** Boxes in the coldstore by drop-off point, with their spot and time there. */
  coldstore: ColdstoreGroup[];
  coldstoreSkewMs: number;
  coldstoreLoading: boolean;
  loadColdstore: (location?: string) => Promise<void>;
  reset: () => void;
};

/** Pull the box label from a scan: `{box_label:"…"}` or a bare string. */
export function extractBoxLabel(raw: string): string {
  const text = raw.replace(/[\r\n]+/g, '').trim();
  if (!text) return '';
  if (!text.startsWith('{')) return text;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const label = parsed.box_label;
    return typeof label === 'string' ? label.trim() : '';
  } catch {
    return '';
  }
}

/** Pull the location from a scan: `{location|name|place:"…"}` or a bare string. */
function extractLocation(raw: string): string {
  const text = raw.replace(/[\r\n]+/g, '').trim();
  if (!text) return '';
  if (!text.startsWith('{')) return text;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const v = parsed.location ?? parsed.name ?? parsed.place;
    return typeof v === 'string' ? v.trim() : '';
  } catch {
    return '';
  }
}

/** Read `status` + `message`, tolerating a top-level or `message`-wrapped shape. */
export function resolveStagingResponse(raw: RawStagingResponse): { status?: string; message?: string } {
  if (typeof raw?.status === 'string') {
    const m = raw.message;
    return { status: raw.status, message: typeof m === 'string' ? m : undefined };
  }
  const m = raw?.message;
  if (m && typeof m === 'object') return { status: m.status, message: m.message };
  if (typeof m === 'string') {
    try {
      const parsed = JSON.parse(m) as { status?: string; message?: string };
      return { status: parsed.status, message: parsed.message };
    } catch {
      return { message: m };
    }
  }
  return {};
}

export const useKarenStagingStore = create<State>((set, get) => ({
  submitting: false,
  lastOutcome: null,
  location: '',
  coldstore: [],
  coldstoreSkewMs: 0,
  coldstoreLoading: false,

  loadColdstore: async (location) => {
    set({ coldstoreLoading: true });
    try {
      const res = await karenStagingApi.fetchColdstoreBoxes(location);
      const { groups, skewMs } = mapColdstore(res?.message);
      set({ coldstore: groups, coldstoreSkewMs: skewMs, coldstoreLoading: false });
    } catch {
      set({ coldstoreLoading: false });
    }
  },

  setLocation: (raw) => {
    const loc = extractLocation(raw);
    if (loc) set({ location: loc, lastOutcome: { kind: 'success', message: `Staging location set: ${loc}` } });
    else set({ lastOutcome: { kind: 'warning', message: 'Could not read a valid location QR.' } });
  },

  submitScan: async (raw) => {
    const fail = (kind: 'error' | 'warning', message: string): StageOutcome => {
      const out: StageOutcome = { kind, message };
      set({ lastOutcome: out });
      return out;
    };

    const location = get().location;
    if (!location) return fail('warning', 'Scan a staging location first.');

    const boxLabel = extractBoxLabel(raw);
    if (!boxLabel) return fail('warning', 'Please scan a valid box QR code.');

    set({ submitting: true });
    let result: { status?: string; message?: string };
    try {
      const res = await karenStagingApi.createStagingEntry(boxLabel, location);
      result = resolveStagingResponse(res);
    } catch (err) {
      set({ submitting: false });
      return fail('error', mapAxiosError(err).message || 'Failed to create staging entry.');
    }

    set({ submitting: false });

    if (result.status === 'success') {
      const out: StageOutcome = { kind: 'success', message: result.message || 'Box staged successfully' };
      set({ lastOutcome: out });
      return out;
    }
    if (result.status === 'duplicate') {
      return fail('warning', result.message || 'This box has already been scanned.');
    }
    return fail('error', result.message || 'Failed to create staging entry.');
  },

  reset: () => set({ submitting: false, lastOutcome: null, location: '' }),
}));
