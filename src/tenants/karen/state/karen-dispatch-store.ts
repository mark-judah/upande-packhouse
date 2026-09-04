import { create } from 'zustand';
import { karenDispatchApi } from '../api/karen-dispatch-api';
import type { RawLoadedOrdersResponse, RawRebuildResponse } from '../api/karen-dispatch-api';
import { mapAxiosError } from '@/src/core/api/client';
import { tomorrowISO } from '@/src/core/date';

export type LoadedOrder = {
  salesOrder: string;
  orderName: string;
  customer: string;
  deliveryPoint: string;
  farm: string;
  consignee: string;
  boxesLoaded: number;
};

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
  lastOutcome: DispatchOutcome | null;

  loadOrders: () => Promise<void>;
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
  lastOutcome: null,

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
        boxesLoaded: Number(o.boxes_loaded ?? 0),
      }));
      set({
        loading: false,
        orders,
        totalBoxes: Number(data.total_boxes ?? 0),
        deliveryDate: (data.delivery_date ?? '').toString(),
      });
    } catch (err) {
      set({
        loading: false,
        orders: [],
        totalBoxes: 0,
        lastOutcome: { kind: 'error', message: mapAxiosError(err).message || 'Could not load orders.' },
      });
    }
  },

  save: async () => {
    set({ saving: true });
    try {
      const raw: RawRebuildResponse = await karenDispatchApi.createOrUpdateDispatch(get().selectedDate);
      const msg = unwrap(raw);
      if (msg?.status === 'error') {
        const out: DispatchOutcome = { kind: 'error', message: msg.message || 'Could not save dispatch.' };
        set({ saving: false, lastOutcome: out });
        return out;
      }
      const out: DispatchOutcome = {
        kind: 'success',
        message: msg?.message || 'Dispatch form saved from loaded boxes.',
      };
      set({ saving: false, lastOutcome: out });
      return out;
    } catch (err) {
      const out: DispatchOutcome = {
        kind: 'error',
        message: mapAxiosError(err).message || 'Could not save dispatch form.',
      };
      set({ saving: false, lastOutcome: out });
      return out;
    }
  },

  setDate: async (date) => {
    set({ selectedDate: date, orders: [], totalBoxes: 0 });
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
      lastOutcome: null,
    }),
}));
