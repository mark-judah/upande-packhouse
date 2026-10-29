import { create } from 'zustand';
import { karenBoxLabelsApi } from '../api/karen-box-labels-api';
import { mapAxiosError } from '@/src/core/api/client';
import { tomorrowISO } from '@/src/core/date';

export type BoxLabelOrder = {
  oplName: string;
  orderName: string;
  customer: string;
  boxes: number;
  printed: number;
};

export type BoxLabelsOutcome =
  | { success: true; base64: string; filename: string; count: number }
  | { success: false; message: string };

interface State {
  selectedDate: string;
  orders: BoxLabelOrder[];
  ordersLoading: boolean;
  ordersError: string | null;

  /** Print formats offered for box labels + the server's default (null until loaded). */
  formats: string[];
  defaultFormat: string | null;
  formatsLoading: boolean;
  /** Why the format list couldn't load (null when it did, or hasn't been tried). */
  formatsError: string | null;

  generating: boolean;

  setDate: (date: string) => Promise<void>;
  loadOrders: () => Promise<void>;
  loadFormats: () => Promise<void>;
  /** printFormat omitted -> the server's default; preview -> just the first box's label. */
  generate: (
    oplName: string,
    opts?: { printFormat?: string; preview?: boolean },
  ) => Promise<BoxLabelsOutcome>;
  reset: () => void;
}

export const useKarenBoxLabelsStore = create<State>((set, get) => ({
  selectedDate: tomorrowISO(),
  orders: [],
  ordersLoading: false,
  ordersError: null,

  formats: [],
  defaultFormat: null,
  formatsLoading: false,
  formatsError: null,

  generating: false,

  setDate: async (date) => {
    set({ selectedDate: date });
    await get().loadOrders();
  },

  loadOrders: async () => {
    const date = get().selectedDate;
    set({ ordersLoading: true, ordersError: null });
    try {
      const raw = await karenBoxLabelsApi.listOrders(date);
      // A slow response for a date the user has since moved off mustn't overwrite the list.
      if (get().selectedDate !== date) return;
      const orders = (raw?.message?.orders ?? []).map<BoxLabelOrder>((o) => ({
        oplName: String(o.opl_name ?? ''),
        orderName: String(o.order_name ?? o.opl_name ?? ''),
        customer: String(o.customer ?? ''),
        boxes: Number(o.boxes ?? 0),
        printed: Number(o.printed ?? 0),
      }));
      set({ orders, ordersLoading: false });
    } catch (err) {
      if (get().selectedDate !== date) return;
      set({ ordersError: mapAxiosError(err).message || 'Could not load orders.', ordersLoading: false });
    }
  },

  loadFormats: async () => {
    if (get().formatsLoading) return;
    set({ formatsLoading: true, formatsError: null });
    try {
      const raw = await karenBoxLabelsApi.getPrintFormats();
      set({ formats: raw?.message?.formats ?? [], defaultFormat: raw?.message?.default ?? null });
    } catch (err) {
      // Not fatal: printing still works with the server's own default -- but say
      // why the picker is empty instead of silently hiding it.
      set({ formatsError: mapAxiosError(err).message || 'Could not load print formats.' });
    } finally {
      set({ formatsLoading: false });
    }
  },

  generate: async (oplName, { printFormat, preview } = {}) => {
    set({ generating: true });
    try {
      const raw = await karenBoxLabelsApi.generatePdf({
        order_pick_list: oplName,
        ...(printFormat ? { print_format: printFormat } : {}),
        ...(preview ? { preview: true } : {}),
      });
      const msg = raw?.message;
      if (!msg?.pdf_base64) return { success: false, message: 'The server did not return a PDF.' };
      return {
        success: true,
        base64: msg.pdf_base64,
        filename: msg.filename || `${oplName}-${preview ? 'box-label-preview' : 'box-labels'}.pdf`,
        count: msg.count ?? 0,
      };
    } catch (err) {
      return { success: false, message: mapAxiosError(err).message || 'Could not generate box labels.' };
    } finally {
      set({ generating: false });
    }
  },

  reset: () =>
    set({
      selectedDate: tomorrowISO(),
      orders: [],
      ordersLoading: false,
      ordersError: null,
      generating: false,
    }),
}));
