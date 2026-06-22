import { create } from 'zustand';
import { karenBunchHandoverApi, type RawStaff } from '../api/karen-bunch-handover-api';
import { mapAxiosError } from '@/src/core/api/client';

export type StaffOption = { value: string; label: string };
export type HandoverOutcome = { kind: 'success' | 'error'; message: string };
/** A handover logged this session — shown back to the operator for confidence. */
export type RecentHandover = { grader: string; packer: string; bunches: number; at: string };

type State = {
  staffLoading: boolean;
  staffError: string | null;
  graders: StaffOption[];
  packers: StaffOption[];

  selectedGrader: string | null;
  selectedPacker: string | null;
  bunches: string;

  submitting: boolean;
  recent: RecentHandover[];

  loadStaff: () => Promise<void>;
  setGrader: (v: string) => void;
  setPacker: (v: string) => void;
  setBunches: (v: string) => void;
  submit: () => Promise<HandoverOutcome>;
  reset: () => void;
};

const initial = {
  staffLoading: false,
  staffError: null as string | null,
  graders: [] as StaffOption[],
  packers: [] as StaffOption[],
  selectedGrader: null as string | null,
  selectedPacker: null as string | null,
  bunches: '',
  submitting: false,
  recent: [] as RecentHandover[],
};

function toOptions(rows?: RawStaff[]): StaffOption[] {
  return (rows ?? [])
    .map((r) => ({
      value: (r.name ?? '').toString(),
      label: (r.employee_name || r.name || '').toString(),
    }))
    .filter((o) => o.value.length > 0);
}

export const useKarenBunchHandoverStore = create<State>((set, get) => ({
  ...initial,

  loadStaff: async () => {
    set({ staffLoading: true, staffError: null });
    try {
      const raw = await karenBunchHandoverApi.fetchStaff();
      const m = raw?.message;
      set({
        staffLoading: false,
        graders: toOptions(m?.graders),
        packers: toOptions(m?.packers),
      });
    } catch (err) {
      set({ staffLoading: false, staffError: mapAxiosError(err).message || 'Could not load staff.' });
    }
  },

  setGrader: (v) => set({ selectedGrader: v }),
  setPacker: (v) => set({ selectedPacker: v }),
  // Digits only — bunches is a whole count.
  setBunches: (v) => set({ bunches: v.replace(/[^0-9]/g, '') }),

  submit: async () => {
    const s = get();
    if (!s.selectedGrader) return { kind: 'error', message: 'Select a grader.' };
    if (!s.selectedPacker) return { kind: 'error', message: 'Select a packer.' };
    const n = parseInt(s.bunches, 10);
    if (!Number.isFinite(n) || n <= 0) {
      return { kind: 'error', message: 'Enter a bunches count greater than zero.' };
    }
    set({ submitting: true });
    try {
      const raw = await karenBunchHandoverApi.createHandover({
        grader: s.selectedGrader,
        packer: s.selectedPacker,
        bunches: n,
      });
      const m = raw?.message;
      const ok = typeof m === 'object' && m?.status === 'success';
      set({ submitting: false });
      if (!ok) {
        const msg = (typeof m === 'object' && m?.message) || 'Could not save handover.';
        return { kind: 'error', message: msg };
      }
      const graderLabel = s.graders.find((g) => g.value === s.selectedGrader)?.label ?? s.selectedGrader;
      const packerLabel = s.packers.find((p) => p.value === s.selectedPacker)?.label ?? s.selectedPacker;
      // Keep grader + packer selected for fast repeated entry; clear the count.
      set((cur) => ({
        bunches: '',
        recent: [
          { grader: graderLabel, packer: packerLabel, bunches: n, at: new Date().toLocaleTimeString() },
          ...cur.recent,
        ].slice(0, 20),
      }));
      return { kind: 'success', message: `Logged ${n} bunch${n === 1 ? '' : 'es'}.` };
    } catch (err) {
      set({ submitting: false });
      return { kind: 'error', message: mapAxiosError(err).message };
    }
  },

  reset: () => set({ ...initial }),
}));
