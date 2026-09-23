import { create } from 'zustand';
import { karenDispatchApi } from '../api/karen-dispatch-api';
import type { RawLoadedOrdersResponse, RawMissingBox, RawRebuildResponse } from '../api/karen-dispatch-api';
import { mapAxiosError } from '@/src/core/api/client';
import { tomorrowISO } from '@/src/core/date';

export type LoadedOrder = {
  salesOrder: string;
  orderName: string;
  customer: string;
  deliveryPoint: string;
  farm: string;
  consignee: string;
  boxesRequired: number;
  boxesLoaded: number;
};

export type MissingBox = {
  boxLabel: string;
  boxNumber: number;
  orderPickList: string;
  customer: string;
  deliveryPoint: string;
  stagingLocation: string;
};

function mapMissingBoxes(rows: RawMissingBox[] | undefined): MissingBox[] {
  return (rows ?? []).map((b) => ({
    boxLabel: (b.box_label ?? '').toString(),
    boxNumber: Number(b.box_number ?? 0),
    orderPickList: (b.order_pick_list ?? '').toString(),
    customer: (b.customer ?? '').toString(),
    deliveryPoint: (b.delivery_point ?? '').toString(),
    stagingLocation: (b.staging_location ?? '').toString(),
  }));
}

export type DispatchOutcome =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

type State = {
  loading: boolean;
  saving: boolean;
  /** Delivery date being viewed (YYYY-MM-DD); defaults to tomorrow. */
  selectedDate: string;
  /** Date echoed by the server for the current data. */
  deliveryDate: string;
  orders: LoadedOrder[];
  totalBoxes: number;
  totalRequired: number;
  /** True once this date's dispatch has already been confirmed (Loading
   *  Sheet status = Departed) -- the confirm action locks after this. */
  dispatched: boolean;
  /** Seal number already recorded on the server, once dispatched. */
  savedSealNumber: string;
  /** The operator's in-progress seal-number entry, before confirming. */
  sealNumberInput: string;
  /** Boxes staged in the dispatch coldstore but never loaded -- dispatch is
   *  blocked server-side while any exist for this date. */
  missingBoxes: MissingBox[];
  lastOutcome: DispatchOutcome | null;

  loadOrders: () => Promise<void>;
  setSealNumberInput: (v: string) => void;
  /** Confirms dispatch for the day -- a one-time action once `dispatched`
   *  is true. */
  save: () => Promise<DispatchOutcome>;
  setDate: (date: string) => Promise<void>;
  reset: () => void;
};

function unwrap<T extends { status?: string; message?: string; data?: unknown }>(
  raw: { message?: T | string } | undefined,
): T | undefined {
  const m = raw?.message;
  if (!m) return undefined;
  if (typeof m === 'string') {
    try {
      return JSON.parse(m) as T;
    } catch {
      return undefined;
    }
  }
  return m;
}

export const useKarenDispatchStore = create<State>((set, get) => ({
  loading: false,
  saving: false,
  selectedDate: tomorrowISO(),
  deliveryDate: '',
  orders: [],
  totalBoxes: 0,
  totalRequired: 0,
  dispatched: false,
  savedSealNumber: '',
  sealNumberInput: '',
  missingBoxes: [],
  lastOutcome: null,

  setSealNumberInput: (v) => set({ sealNumberInput: v }),

  loadOrders: async () => {
    set({ loading: true });
    try {
      const raw: RawLoadedOrdersResponse = await karenDispatchApi.fetchLoadedOrders(get().selectedDate);
      const msg = unwrap(raw);
      const data = msg?.data ?? {};
      const orders: LoadedOrder[] = (data.orders ?? []).map((o) => ({
        salesOrder: (o.sales_order ?? '').toString(),
        orderName: (o.order_name ?? o.sales_order ?? '').toString(),
        customer: (o.customer ?? '').toString(),
        deliveryPoint: (o.delivery_point ?? '').toString(),
        farm: (o.farm ?? '').toString(),
        consignee: (o.consignee ?? '').toString(),
        boxesRequired: Number(o.boxes_required ?? 0),
        boxesLoaded: Number(o.boxes_loaded ?? 0),
      }));
      const savedSealNumber = (data.seal_number ?? '').toString();
      set({
        loading: false,
        orders,
        totalBoxes: Number(data.total_boxes ?? 0),
        totalRequired: orders.reduce((sum, o) => sum + o.boxesRequired, 0),
        deliveryDate: (data.delivery_date ?? '').toString(),
        dispatched: !!data.dispatched,
        savedSealNumber,
        missingBoxes: mapMissingBoxes(data.missing_boxes),
        // Don't clobber an in-progress entry with an empty server value on a
        // background refresh -- only seed it once there's nothing typed yet.
        sealNumberInput: get().sealNumberInput || savedSealNumber,
      });
    } catch (err) {
      set({
        loading: false,
        orders: [],
        totalBoxes: 0,
        totalRequired: 0,
        lastOutcome: { kind: 'error', message: mapAxiosError(err).message || 'Could not load orders.' },
      });
    }
  },

  save: async () => {
    set({ saving: true });
    try {
      const raw: RawRebuildResponse = await karenDispatchApi.createOrUpdateDispatch(
        get().selectedDate,
        get().sealNumberInput.trim(),
      );
      const msg = unwrap(raw);
      if (msg?.status === 'error') {
        const missingBoxes = mapMissingBoxes(msg.missing_boxes);
        const out: DispatchOutcome = { kind: 'error', message: msg.message || 'Could not confirm dispatch.' };
        set({ saving: false, lastOutcome: out, missingBoxes });
        return out;
      }
      const out: DispatchOutcome = {
        kind: 'success',
        message: msg?.message || 'Dispatch confirmed.',
      };
      set({ saving: false, lastOutcome: out, dispatched: true, missingBoxes: [] });
      return out;
    } catch (err) {
      const out: DispatchOutcome = {
        kind: 'error',
        message: mapAxiosError(err).message || 'Could not confirm dispatch.',
      };
      set({ saving: false, lastOutcome: out });
      return out;
    }
  },

  setDate: async (date) => {
    set({ selectedDate: date, orders: [], totalBoxes: 0, totalRequired: 0, sealNumberInput: '', savedSealNumber: '', dispatched: false, missingBoxes: [] });
    await get().loadOrders();
  },

  reset: () =>
    set({
      loading: false,
      saving: false,
      selectedDate: tomorrowISO(),
      deliveryDate: '',
      orders: [],
      totalBoxes: 0,
      totalRequired: 0,
      dispatched: false,
      savedSealNumber: '',
      sealNumberInput: '',
      missingBoxes: [],
      lastOutcome: null,
    }),
}));
