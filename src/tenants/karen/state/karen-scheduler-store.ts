import { create } from 'zustand';
import {
  karenSchedulerApi,
  type RawSchedulerLocation,
  type RawSchedulerOpl,
} from '../api/karen-scheduler-api';
import { mapAxiosError } from '@/src/core/api/client';
import { tomorrowISO } from '@/src/core/date';

/** Bucket lifecycle, furthest-along first — mirrors the bucket-logistics dashboard.
 *  A bucket's status flags accumulate, so we classify by the furthest stage set. */
export const STAGES = [
  'Awaiting Transfer',
  'Loaded in Trolley',
  'In Transit',
  'Shelved',
  'Ready for Packing',
  'Issued',
] as const;

export type OrderSpec = {
  spec: string;
  variety: string;
  length: string;
  boxes: number;
};

export type SchedulerOrder = {
  oplName: string;
  orderName: string;
  /** Persisted custom_schedule_number (0 = not yet scheduled). */
  scheduleNumber: number;
  customer: string;
  team: string;
  issuingPct: number;
  packed: boolean;
  totalStems: number;
  buckets: number;
  /** Planned box count (sum of the OPL's spec lines). */
  boxes: number;
  /** Stems per box (total stems / boxes), 0 when unknown. */
  packrate: number;
  /** Spec lines: what to grade/pack — variety, length, box count. */
  specs: OrderSpec[];
  /** Count of buckets at each stage (current status, like the dashboard). */
  stages: Record<string, number>;
};

type State = {
  loading: boolean;
  error: string | null;
  date: string;
  taktMinutes: number;
  /** Orders sorted by their backend schedule number (visibility only). */
  orders: SchedulerOrder[];

  load: () => Promise<void>;
  setDate: (date: string) => Promise<void>;
  reset: () => void;
};

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}

function bucketStage(l: RawSchedulerLocation): string {
  if (l.custom_issued) return 'Issued';
  if (l.custom_ready_for_packing) return 'Ready for Packing';
  if (l.custom_shelved) return 'Shelved';
  if (l.custom_in_transit) return 'In Transit';
  if (l.custom_loaded_in_trolley) return 'Loaded in Trolley';
  return 'Awaiting Transfer';
}

function buildOrder(
  o: RawSchedulerOpl,
  packed: Record<string, number>,
  schedule: Record<string, number>,
): SchedulerOrder {
  const stages: Record<string, number> = {};
  for (const s of STAGES) stages[s] = 0;
  const locs = o.locations ?? [];
  for (const l of locs) stages[bucketStage(l)] += 1;
  // Issuing % = buckets with the issued checkbox ticked / total buckets.
  const issuedCount = locs.filter((l) => l.custom_issued).length;
  const issuingPct = locs.length ? Math.round((issuedCount / locs.length) * 100) : 0;
  const name = (o.name ?? '').toString();
  const specs: OrderSpec[] = (o.specs ?? []).map((sp) => ({
    spec: (sp.spec ?? '').toString(),
    variety: (sp.variety ?? '').toString(),
    length: (sp.length ?? '').toString(),
    boxes: Math.round(num(sp.boxes)),
  }));
  return {
    oplName: name,
    orderName: (o.custom_order_name || name).toString(),
    scheduleNumber: Math.round(num(schedule[name])),
    customer: (o.customer ?? '').toString(),
    team: (o.custom_team ?? '').toString(),
    issuingPct,
    packed: packed[name] === 1,
    totalStems: Math.round(num(o.custom_total_stems)),
    buckets: locs.length,
    boxes: Math.round(num(o.planned_boxes)),
    packrate: Math.round(num(o.packrate)),
    specs,
    stages,
  };
}

const initial = {
  loading: false,
  error: null as string | null,
  date: tomorrowISO(),
  taktMinutes: 0,
  orders: [] as SchedulerOrder[],
};

export const useKarenSchedulerStore = create<State>((set, get) => {
  return {
    ...initial,

    load: async () => {
      set({ loading: true, error: null });
      try {
        const dataRes = await karenSchedulerApi.fetchData(get().date);
        const m = dataRes?.message;
        if (!m?.success) {
          set({ loading: false, error: m?.error || 'Could not load schedule.', orders: [] });
          return;
        }
        const opls = m.data ?? [];
        const names = opls.map((o) => (o.name ?? '').toString()).filter(Boolean);

        let schedule: Record<string, number> = {};
        let packed: Record<string, number> = {};
        let takt = 0;
        if (names.length) {
          try {
            const metaRes = await karenSchedulerApi.fetchMeta(names);
            const mm = metaRes?.message;
            if (mm?.success) {
              schedule = mm.schedule ?? {};
              packed = mm.packed ?? {};
              takt = num(mm.takt_minutes);
            }
          } catch {
            // meta is best-effort; fall back to API order with no schedule numbers
          }
        }

        const built = opls.map((o) => buildOrder(o, packed, schedule));
        // Sort by persisted schedule number; unscheduled (0) sink to the bottom
        // keeping the server's customer/name order among themselves.
        built.sort((a, b) => {
          const sa = a.scheduleNumber;
          const sb = b.scheduleNumber;
          if (sa && sb) return sa - sb;
          if (sa) return -1;
          if (sb) return 1;
          return 0;
        });
        set({ loading: false, orders: built, taktMinutes: takt });
      } catch (err) {
        set({ loading: false, error: mapAxiosError(err).message, orders: [] });
      }
    },

    setDate: async (date) => {
      set({ date, orders: [] });
      await get().load();
    },

    reset: () => {
      set({ ...initial, date: tomorrowISO() });
    },
  };
});
