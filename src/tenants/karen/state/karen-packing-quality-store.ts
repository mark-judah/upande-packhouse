import { create } from 'zustand';
import { mapAxiosError } from '@/src/core/api/client';
import { recordLocal } from '@/src/core/debug/debugLogStore';
import {
  karenPackingQualityApi,
  type RawQualityCandidate,
} from '../api/karen-packing-quality-api';

// ---------------------------------------------------------------------
// Report a quality issue while packing: pick the bucket on the line, the
// defect, whole bucket or some stems, then the replacement -- the sales
// farm's buckets first (best one recommended), else a remote farm's, which
// comes on the next truck as ASAP.
// ---------------------------------------------------------------------

export type DefectCategory = 'Wrong stem length' | 'Disease' | 'Pest' | 'Other';
export type QualityDefect = { defect: string; category: DefectCategory };
export type QualityScope = 'bucket' | 'stems';

export type QualityBucket = {
  bucket: string;
  stems: number;
  farm: string | null;
  saleOrderItem: string;
  itemCode: string;
  stemLength: string;
  uom: string;
};

export type QualityCandidate = {
  bucket: string;
  farm: string;
  shelf: string | null;
  stemLength: string | null;
  availableQty: number | null;
  harvestDate: string | null;
  recommended: boolean;
  remote: boolean;
};

export type QualityOptions = {
  loading: boolean;
  needed: number;
  salesFarm: string | null;
  salesFarmCandidates: QualityCandidate[];
  remoteCandidates: QualityCandidate[];
  message: string | null;
  warning: string | null;
};

type State = {
  open: boolean;
  oplName: string | null;
  loading: boolean;
  error: string | null;
  salesFarm: string | null;
  defects: QualityDefect[];
  buckets: QualityBucket[];
  options: QualityOptions | null;
  submitting: boolean;
  /** Opens for `oplName`; `itemCode` (the line on screen) lists its buckets first. */
  openFor: (oplName: string, itemCode?: string | null) => Promise<void>;
  close: () => void;
  loadOptions: (bucket: QualityBucket, stems: number) => Promise<void>;
  clearOptions: () => void;
  submit: (args: {
    bucket: QualityBucket;
    defect: string;
    scope: QualityScope;
    stems: number;
    replacement: QualityCandidate | null;
    notes?: string;
  }) => Promise<{ ok: boolean; message: string }>;
};

const CATEGORIES: DefectCategory[] = ['Wrong stem length', 'Disease', 'Pest', 'Other'];

function toCategory(value: string | undefined): DefectCategory {
  return (CATEGORIES as string[]).includes(value ?? '') ? (value as DefectCategory) : 'Other';
}

function toCandidate(c: RawQualityCandidate, remote: boolean): QualityCandidate {
  return {
    bucket: c.new_bucket,
    farm: c.farm,
    shelf: c.shelf ?? null,
    stemLength: c.stem_length ?? null,
    availableQty: typeof c.available_qty === 'number' ? c.available_qty : null,
    harvestDate: c.harvest_date ?? null,
    recommended: !!c.recommended,
    remote,
  };
}

const EMPTY = {
  open: false,
  oplName: null,
  loading: false,
  error: null,
  salesFarm: null,
  defects: [],
  buckets: [],
  options: null,
  submitting: false,
};

export const useKarenPackingQualityStore = create<State>((set, get) => ({
  ...EMPTY,

  openFor: async (oplName, itemCode) => {
    set({ ...EMPTY, open: true, oplName, loading: true });
    try {
      const res = await karenPackingQualityApi.fetchLines(oplName);
      if (get().oplName !== oplName) return; // closed or reopened meanwhile
      const buckets: QualityBucket[] = [];
      for (const line of res.lines ?? []) {
        for (const b of line.buckets ?? []) {
          buckets.push({
            bucket: b.bucket,
            stems: Number(b.stems) || 0,
            farm: b.farm ?? null,
            saleOrderItem: line.sales_order_item,
            itemCode: line.item_code,
            stemLength: line.stem_length ?? '',
            uom: line.uom ?? '',
          });
        }
      }
      // The line on screen first; otherwise keep the server's order.
      if (itemCode) {
        buckets.sort((a, b) => Number(b.itemCode === itemCode) - Number(a.itemCode === itemCode));
      }
      set({
        loading: false,
        salesFarm: res.sales_farm ?? null,
        defects: (res.defects ?? []).map((d) => ({ defect: d.defect, category: toCategory(d.category) })),
        buckets,
        error: buckets.length ? null : 'No bucket has been issued to this order yet.',
      });
    } catch (err) {
      if (get().oplName !== oplName) return;
      set({ loading: false, error: mapAxiosError(err).message });
    }
  },

  close: () => set({ ...EMPTY }),

  clearOptions: () => set({ options: null }),

  loadOptions: async (bucket, stems) => {
    const opl = get().oplName;
    if (!opl) return;
    set({
      options: {
        loading: true,
        needed: stems,
        salesFarm: get().salesFarm,
        salesFarmCandidates: [],
        remoteCandidates: [],
        message: null,
        warning: null,
      },
    });
    try {
      const res = await karenPackingQualityApi.fetchOptions({
        opl_name: opl,
        bucket: bucket.bucket,
        sale_order_item: bucket.saleOrderItem,
        stems,
      });
      const current = get().options;
      if (!current || current.needed !== stems || get().oplName !== opl) return; // superseded
      set({
        options: {
          loading: false,
          needed: typeof res.needed === 'number' ? res.needed : stems,
          salesFarm: res.sales_farm ?? get().salesFarm,
          salesFarmCandidates: (res.sales_farm_candidates ?? []).map((c) => toCandidate(c, false)),
          remoteCandidates: (res.remote_candidates ?? []).map((c) => toCandidate(c, true)),
          message: res.success === false ? res.message || 'Could not load replacements.' : res.message ?? null,
          warning: res.warning ?? null,
        },
      });
    } catch (err) {
      set({
        options: {
          loading: false,
          needed: stems,
          salesFarm: get().salesFarm,
          salesFarmCandidates: [],
          remoteCandidates: [],
          message: mapAxiosError(err).message,
          warning: null,
        },
      });
    }
  },

  submit: async ({ bucket, defect, scope, stems, replacement, notes }) => {
    const opl = get().oplName;
    if (!opl) return { ok: false, message: 'No order selected.' };
    set({ submitting: true });
    try {
      const res = await karenPackingQualityApi.report({
        opl_name: opl,
        bucket: bucket.bucket,
        sale_order_item: bucket.saleOrderItem,
        defect,
        scope,
        stems: scope === 'stems' ? stems : undefined,
        new_bucket_id: replacement?.bucket,
        notes: notes?.trim() || undefined,
      });
      set({ submitting: false });
      if (!res.success) {
        const message = res.message || 'Could not report the quality issue.';
        recordLocal({ status: 'error', title: message, context: { opl, bucket: bucket.bucket, defect } });
        return { ok: false, message };
      }
      return { ok: true, message: res.message || 'Quality issue reported.' };
    } catch (err) {
      set({ submitting: false });
      return { ok: false, message: mapAxiosError(err).message };
    }
  },
}));
