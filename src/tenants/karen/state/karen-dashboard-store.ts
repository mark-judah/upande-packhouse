import { create } from 'zustand';
import { karenDashboardApi } from '../api/karen-dashboard-api';
import { mapAxiosError } from '@/src/core/api/client';
import { todayISO } from '@/src/core/date';

export type DashboardOrder = {
  salesOrder: string;
  orderName: string;
  customer: string;
  deliveryPoint: string;
  farm: string;
  team: string;
  boxesRequired: number;
  boxesPacked: number;
};

export type DashboardVariety = { itemCode: string; stems: number };

export type DashboardTeam = {
  team: string;
  boxesRequired: number;
  boxesPacked: number;
  stemsExpected: number;
  stemsPacked: number;
  ordersTotal: number;
  ordersDone: number;
};

export type DashboardPacker = {
  user: string;
  name: string;
  stems: number;
  bunches: number;
};

export type DashboardKpi = {
  boxesRequired: number;
  boxesPacked: number;
  stemsExpected: number;
  stemsPacked: number;
  ordersTotal: number;
  ordersDone: number;
  ordersPending: number;
  bypassIssues: number;
  underpackIssues: number;
  underpackPercentage: number;
  farms: number;
};

export type DashboardData = {
  deliveryDate: string;
  kpi: DashboardKpi;
  orders: DashboardOrder[];
  topVarieties: DashboardVariety[];
  teams: DashboardTeam[];
  topPackers: DashboardPacker[];
  bottomPackers: DashboardPacker[];
};

function n(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0;
}

interface DashboardState {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  /** Delivery date being viewed (YYYY-MM-DD). Defaults to TODAY -- real
   *  packing activity here is against today's own delivery date, not
   *  tomorrow's (confirmed live: every recent Farm Pack List's order has
   *  delivery_date = today), even though Packing Entry's own date picker
   *  defaults a day ahead. Showing "tomorrow" by default made every KPI
   *  read 0 despite real transactions existing for today. */
  selectedDate: string;
  load: () => Promise<void>;
  setDate: (date: string) => Promise<void>;
}

export const useKarenDashboardStore = create<DashboardState>((set, get) => ({
  data: null,
  loading: false,
  error: null,
  selectedDate: todayISO(),

  load: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const date = get().selectedDate;
      const raw = await karenDashboardApi.fetch(date);
      const m = raw?.message;
      // A malformed/auth-failure response (no `message`, or one with neither
      // an error nor a kpi object) must not silently render as an all-zero
      // dashboard -- that's indistinguishable from "genuinely nothing due
      // this day" otherwise, which is exactly the confusing symptom this
      // guard exists to catch.
      if (!m || typeof m !== 'object') {
        throw new Error('Unexpected response from server.');
      }
      if (m.error) throw new Error(m.error);
      if (!m.kpi || typeof m.kpi !== 'object') {
        throw new Error('Server response is missing dashboard data.');
      }
      const k = m.kpi;
      const ordersTotal = n(k.orders_total);
      const ordersDone = n(k.orders_done);
      const data: DashboardData = {
        deliveryDate: String(m.delivery_date ?? date),
        kpi: {
          boxesRequired: n(k.boxes_required),
          boxesPacked: n(k.boxes_packed),
          stemsExpected: n(k.stems_expected),
          stemsPacked: n(k.stems_packed),
          ordersTotal,
          ordersDone,
          ordersPending: Math.max(0, ordersTotal - ordersDone),
          bypassIssues: n(k.bypass_issues),
          underpackIssues: n(k.underpack_issues),
          underpackPercentage: n(k.underpack_percentage),
          farms: n(k.farms),
        },
        orders: (m.orders ?? []).map((o) => ({
          salesOrder: String(o.sales_order ?? ''),
          orderName: String(o.order_name ?? o.sales_order ?? ''),
          customer: String(o.customer ?? ''),
          deliveryPoint: String(o.delivery_point ?? ''),
          farm: String(o.farm ?? ''),
          team: String(o.team ?? ''),
          boxesRequired: n(o.boxes_required),
          boxesPacked: n(o.boxes_packed),
        })),
        topVarieties: (m.top_varieties ?? []).map((v) => ({
          itemCode: String(v.item_code ?? ''),
          stems: n(v.stems),
        })),
        teams: (m.teams ?? []).map((t) => ({
          team: String(t.team ?? 'Unassigned'),
          boxesRequired: n(t.boxes_required),
          boxesPacked: n(t.boxes_packed),
          stemsExpected: n(t.stems_expected),
          stemsPacked: n(t.stems_packed),
          ordersTotal: n(t.orders_total),
          ordersDone: n(t.orders_done),
        })),
        topPackers: (m.top_packers ?? []).map((p) => ({
          user: String(p.user ?? ''),
          name: String(p.name ?? p.user ?? ''),
          stems: n(p.stems),
          bunches: n(p.bunches),
        })),
        bottomPackers: (m.bottom_packers ?? []).map((p) => ({
          user: String(p.user ?? ''),
          name: String(p.name ?? p.user ?? ''),
          stems: n(p.stems),
          bunches: n(p.bunches),
        })),
      };
      set({ data, loading: false });
    } catch (err) {
      set({ error: mapAxiosError(err).message, loading: false });
    }
  },

  setDate: async (date) => {
    set({ selectedDate: date, data: null });
    await get().load();
  },
}));
