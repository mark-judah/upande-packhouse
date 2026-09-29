import { create } from 'zustand';

/**
 * In-app request/response log. console.log (see core/api/log.ts) only reaches
 * a terminal attached to Metro -- useless once a device is off the cable or
 * running a built binary. This keeps the same information (request payload,
 * response/error body, status, timing) inside the app itself, plus local
 * (client-side, no network) validation rejections that never produce a
 * request at all, so "why did this fail" is always answerable on-device.
 */

const MAX_ENTRIES = 300;

export type DebugLogEntry = {
  id: string;
  at: number;
  kind: 'network' | 'local';
  status: 'success' | 'error' | 'info';
  title: string;
  method?: string;
  url?: string;
  httpStatus?: number;
  durationMs?: number;
  payload?: unknown;
  response?: unknown;
  context?: unknown;
};

interface DebugLogState {
  entries: DebugLogEntry[];
  add: (entry: Omit<DebugLogEntry, 'id' | 'at'>) => void;
  clear: () => void;
}

let seq = 0;
function nextId(): string {
  seq += 1;
  return `${Date.now()}-${seq}`;
}

export const useDebugLogStore = create<DebugLogState>((set) => ({
  entries: [],
  add: (entry) =>
    set((s) => ({
      entries: [{ ...entry, id: nextId(), at: Date.now() }, ...s.entries].slice(0, MAX_ENTRIES),
    })),
  clear: () => set({ entries: [] }),
}));

/** Record a completed (or failed) network call. Called from the api client's
 *  interceptors -- one entry per call, carrying both request and response. */
export function recordNetwork(entry: {
  status: 'success' | 'error';
  method?: string;
  url?: string;
  httpStatus?: number;
  durationMs?: number;
  payload?: unknown;
  response?: unknown;
}): void {
  const method = (entry.method ?? 'GET').toUpperCase();
  useDebugLogStore.getState().add({
    kind: 'network',
    status: entry.status,
    title: `${method} ${entry.url ?? ''}`.trim(),
    method,
    url: entry.url,
    httpStatus: entry.httpStatus,
    durationMs: entry.durationMs,
    payload: entry.payload,
    response: entry.response,
  });
}

/** Record a local (client-side) validation outcome -- no network involved,
 *  e.g. a precondition rejected before a call was ever made. */
export function recordLocal(entry: {
  status: 'error' | 'info';
  title: string;
  context?: unknown;
}): void {
  useDebugLogStore.getState().add({
    kind: 'local',
    status: entry.status,
    title: entry.title,
    context: entry.context,
  });
}
