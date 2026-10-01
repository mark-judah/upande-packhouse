import { create } from 'zustand';
import { karenStagingApi } from '../api/karen-staging-api';
import type { RawStagingResponse } from '../api/karen-staging-api';
import { mapAxiosError } from '@/src/core/api/client';

export type StageOutcome =
  | { kind: 'success'; message?: string }
  | { kind: 'error'; message: string }
  | { kind: 'warning'; message: string };

type State = {
  submitting: boolean;
  lastOutcome: StageOutcome | null;
  /** Current dispatch-coldstore location (from a scanned location QR). */
  location: string;
  /** Set the staging location from a scanned location QR. */
  setLocation: (raw: string) => void;
  /** Parse a scanned box QR, stage it at the current location, return the outcome. */
  submitScan: (raw: string) => Promise<StageOutcome>;
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
