import { create } from 'zustand';
import { karenLoadingApi } from '../api/karen-loading-api';
import type {
  RawLoadingData,
  RawLoadingEntryResponse,
  RawLoadingResponse,
} from '../api/karen-loading-api';
import { mapAxiosError } from '@/src/core/api/client';
import { tomorrowISO } from '@/src/core/date';

// ---------------------------------------------------------------------
// Normalised view models (mirror of the Flutter KaitetLoadingData model)
// ---------------------------------------------------------------------
export type StagedBox = {
  boxNumber: number;
  /** Where in the dispatch coldstore this box was scanned staged. Empty for
   *  boxes staged before that was captured. */
  stagingLocation: string;
};

export type LoadingOrder = {
  salesOrder: string;
  /** The specific OPL these box counts describe -- a Sales Order can have
   *  more than one, each tracked separately (see sumOrderTotals below). */
  orderPickList: string;
  orderName: string;
  /** Variety for a straight box, or the mix/bouquet product name when
   *  `isMixed` -- same underlying field, different meaning. */
  variety: string;
  isMixed: boolean;
  truckDetails: string;
  consignee: string;
  shippingAgent: string;
  totalQty: number;
  boxesAllocated: number;
  boxesPacked: number;
  boxesStaged: number;
  boxesLoaded: number;
  /** Boxes staged but not yet loaded, with where to find each one. */
  stagedBoxes: StagedBox[];
};

export type LoadingPlanItem = {
  loadingPosition: number;
  customer: string;
  deliveryPoint: string;
  boxType: string;
  numberOfBoxes: number;
  orders: LoadingOrder[];
  boxesAllocated: number;
  boxesPacked: number;
  boxesStaged: number;
  boxesLoaded: number;
};

export type AvailablePlan = { name: string; vehicle: string };
export type VehicleInfo = { name: string; licensePlate: string };

export type LoadingTotals = {
  totalBoxesAllocated: number;
  totalBoxesPacked: number;
  totalBoxesStaged: number;
  totalBoxesLoaded: number;
  totalStops: number;
};

export type LoadingData = {
  deliveryDate: string;
  selectedVehicle: string;
  hasLoadingPlan: boolean;
  loadingPlanName: string | null;
  availablePlans: AvailablePlan[];
  planItems: LoadingPlanItem[];
  vehicles: VehicleInfo[];
  totals: LoadingTotals;
};

export type DeliveryPointSummary = {
  deliveryPoint: string;
  customerCount: number;
  totalBoxes: number;
  totalLoaded: number;
  totalAllocated: number;
  isFullyLoaded: boolean;
};

export type LoadOutcome =
  | { kind: 'success'; message?: string }
  | { kind: 'error'; message: string }
  | { kind: 'warning'; message: string };

// ---------------------------------------------------------------------
// Grouping helpers — delivery point -> customer -> box type
// ---------------------------------------------------------------------
/** Unique delivery points in loading-position (plan) order. */
export function deliveryPoints(data: LoadingData): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of data.planItems) {
    if (!seen.has(item.deliveryPoint)) {
      seen.add(item.deliveryPoint);
      result.push(item.deliveryPoint);
    }
  }
  return result;
}

/** Unique customers at a delivery point, in plan order. */
export function customersAtDeliveryPoint(data: LoadingData, deliveryPoint: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of data.planItems) {
    if (item.deliveryPoint === deliveryPoint && !seen.has(item.customer)) {
      seen.add(item.customer);
      result.push(item.customer);
    }
  }
  return result;
}

/** Plan items (one per box type) for a customer at a delivery point. */
export function itemsForCustomerAtDeliveryPoint(
  data: LoadingData,
  customer: string,
  deliveryPoint: string,
): LoadingPlanItem[] {
  return data.planItems.filter(
    (e) => e.customer === customer && e.deliveryPoint === deliveryPoint,
  );
}

/** Sum boxesAllocated/boxesLoaded across several plan items WITHOUT double
 *  counting an OPL that appears on more than one of them. A Loading Plan
 *  can have several rows for the same (customer, delivery_point) -- one
 *  per box type, or a delivery split across loading positions -- matched
 *  to that stop's OPLs one-per-row (server-side), except the LAST row of
 *  a stop, which absorbs any OPLs beyond the row count. Dedupe by
 *  `orderPickList` (not `salesOrder` -- a Sales Order can have more than
 *  one OPL, each tracked separately, e.g. one already loaded and one not
 *  yet packed) so that overflow case never double-counts. Falls back to
 *  the item's own totals only when it has no `orders` (the server's own
 *  fallback for a customer/SO name mismatch). */
export function sumOrderTotals(items: LoadingPlanItem[]): { allocated: number; loaded: number } {
  const seen = new Map<string, LoadingOrder>();
  let fallbackAllocated = 0;
  let fallbackLoaded = 0;
  for (const item of items) {
    if (item.orders.length === 0) {
      fallbackAllocated += item.boxesAllocated;
      fallbackLoaded += item.boxesLoaded;
      continue;
    }
    for (const o of item.orders) {
      if (!seen.has(o.orderPickList)) seen.set(o.orderPickList, o);
    }
  }
  let allocated = fallbackAllocated;
  let loaded = fallbackLoaded;
  for (const o of seen.values()) {
    allocated += o.boxesAllocated;
    loaded += o.boxesLoaded;
  }
  return { allocated, loaded };
}

/** Aggregated stats for a delivery point. */
export function summaryForDeliveryPoint(
  data: LoadingData,
  deliveryPoint: string,
): DeliveryPointSummary {
  const items = data.planItems.filter((e) => e.deliveryPoint === deliveryPoint);
  let totalBoxes = 0;
  const customers = new Set<string>();
  for (const item of items) {
    totalBoxes += item.numberOfBoxes;
    customers.add(item.customer);
  }
  const { allocated: totalAllocated, loaded: totalLoaded } = sumOrderTotals(items);
  return {
    deliveryPoint,
    customerCount: customers.size,
    totalBoxes,
    totalLoaded,
    totalAllocated,
    isFullyLoaded: totalAllocated > 0 && totalLoaded >= totalAllocated,
  };
}

export function isItemFullyLoaded(item: LoadingPlanItem): boolean {
  return item.boxesAllocated > 0 && item.boxesLoaded >= item.boxesAllocated;
}

/** Set of vehicle names that have an available plan. */
export function vehiclesWithPlans(data: LoadingData): Set<string> {
  return new Set(data.availablePlans.map((p) => p.vehicle));
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
function toNum(v: unknown, fallback = 0): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function unwrap(
  raw: RawLoadingResponse | RawLoadingEntryResponse,
): { status?: string; message?: string; data?: RawLoadingData } | undefined {
  const m = (raw as RawLoadingResponse)?.message;
  if (m && typeof m === 'object') return m;
  if (typeof m === 'string') {
    try {
      return JSON.parse(m);
    } catch {
      return { status: 'success', message: m };
    }
  }
  return undefined;
}

function normalise(d: RawLoadingData): LoadingData {
  const totals = d.totals ?? {};
  return {
    deliveryDate: (d.delivery_date ?? '').toString(),
    selectedVehicle: (d.selected_vehicle ?? '').toString(),
    hasLoadingPlan: d.has_loading_plan === true,
    loadingPlanName: d.loading_plan_name ?? null,
    availablePlans: (d.available_plans ?? []).map((p) => ({
      name: (p.name ?? '').toString(),
      vehicle: (p.vehicle ?? '').toString(),
    })),
    vehicles: (d.vehicles ?? []).map((v) => ({
      name: (v.name ?? '').toString(),
      licensePlate: (v.license_plate ?? '').toString(),
    })),
    planItems: (d.plan_items ?? []).map((i) => ({
      loadingPosition: toNum(i.loading_position),
      customer: (i.customer ?? '').toString(),
      deliveryPoint: (i.delivery_point ?? '').toString(),
      boxType: (i.box_type ?? '').toString(),
      numberOfBoxes: toNum(i.number_of_boxes),
      orders: (i.orders ?? []).map((o) => ({
        salesOrder: (o.sales_order ?? '').toString(),
        orderPickList: (o.order_pick_list ?? '').toString(),
        orderName: (o.order_name ?? '').toString(),
        variety: (o.variety ?? '').toString(),
        isMixed: o.is_mixed === true,
        truckDetails: (o.truck_details ?? '').toString(),
        consignee: (o.consignee ?? '').toString(),
        shippingAgent: (o.shipping_agent ?? '').toString(),
        totalQty: toNum(o.total_qty),
        boxesAllocated: toNum(o.boxes_allocated),
        boxesPacked: toNum(o.boxes_packed),
        boxesStaged: toNum(o.boxes_staged),
        boxesLoaded: toNum(o.boxes_loaded),
        stagedBoxes: (o.staged_boxes ?? []).map((b) => ({
          boxNumber: toNum(b.box_number),
          stagingLocation: (b.staging_location ?? '').toString(),
        })),
      })),
      boxesAllocated: toNum(i.boxes_allocated),
      boxesPacked: toNum(i.boxes_packed),
      boxesStaged: toNum(i.boxes_staged),
      boxesLoaded: toNum(i.boxes_loaded),
    })),
    totals: {
      totalBoxesAllocated: toNum(totals.total_boxes_allocated),
      totalBoxesPacked: toNum(totals.total_boxes_packed),
      totalBoxesStaged: toNum(totals.total_boxes_staged),
      totalBoxesLoaded: toNum(totals.total_boxes_loaded),
      totalStops: toNum(totals.total_stops),
    },
  };
}

/** Pull the box label from a scan: `{box_label:"…"}` or a bare string. */
function extractBoxLabel(raw: string): string {
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

// ---------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------
type State = {
  /** Initial / full-screen fetch (vehicle list + available plans). */
  loading: boolean;
  /** Fetching the plan for a just-selected vehicle (inline spinner). */
  vehicleLoading: boolean;
  loaded: boolean;
  data: LoadingData | null;

  /** The chosen loading plan (LP-…), or null before one is picked. This — not
   *  the vehicle — is the selection flag, since a plan may have no vehicle. */
  selectedPlan: string | null;
  /** The chosen plan's vehicle (from the response); may be blank/null. */
  selectedVehicle: string | null;
  expandedDeliveryPoint: string | null;
  /** Delivery date being viewed (YYYY-MM-DD); defaults to tomorrow. */
  selectedDate: string;

  submitting: boolean;
  lastOutcome: LoadOutcome | null;

  /** Initial load: vehicle list + available plans (no plan scope). */
  loadInitial: (farm: string) => Promise<void>;
  /** Pick a loading plan (by name) and fetch it. */
  selectPlan: (farm: string, planName: string) => Promise<void>;
  /** Re-fetch the current view (the chosen plan if one is selected, else list). */
  reload: (farm: string) => Promise<void>;
  /** Change the delivery date and reload the day's available plans. */
  setDate: (farm: string, date: string) => Promise<void>;
  /** Clear the chosen plan and return to the day's plan list. */
  deselectVehicle: (farm: string) => Promise<void>;
  toggleDeliveryPoint: (deliveryPoint: string) => void;
  submitScan: (farm: string, raw: string, temperature: number) => Promise<LoadOutcome>;
  reset: () => void;
};

/** Shared fetch.
 *  - 'full'    → first/whole-screen load (vehicle list + plans)
 *  - 'vehicle' → fetching a just-picked truck's plan (inline spinner)
 *  - 'silent'  → background refresh after a scan: updates counts in place
 *                WITHOUT a loader, so the plan stays visible and the scanner
 *                keeps focus. */
async function fetchData(
  farm: string,
  vehicle: string,
  mode: 'full' | 'vehicle' | 'silent',
  set: (partial: Partial<State> | ((s: State) => Partial<State>)) => void,
  deliveryDate?: string,
  plan?: string,
): Promise<void> {
  if (mode === 'full') set({ loading: true });
  else if (mode === 'vehicle') set({ vehicleLoading: true });
  try {
    const raw = await karenLoadingApi.fetchLoadingData(farm, vehicle, deliveryDate, plan);
    const result = unwrap(raw);
    if (!result || result.status !== 'success') {
      // A failed silent refresh leaves the existing plan untouched.
      if (mode === 'silent') return;
      set({
        loading: false,
        vehicleLoading: false,
        loaded: true,
        lastOutcome: { kind: 'error', message: result?.message ?? 'Failed to load loading data.' },
      });
      return;
    }
    const data = normalise(result.data ?? {});
    // Auto-expand the first drop-off so the operator sees the sequence.
    const dps = deliveryPoints(data);
    set((s) => ({
      loading: false,
      vehicleLoading: false,
      loaded: true,
      data,
      // Reflect the plan's own vehicle (may be blank) for display + loading entry.
      selectedVehicle: plan ? (data.selectedVehicle || null) : s.selectedVehicle,
      expandedDeliveryPoint:
        s.expandedDeliveryPoint ?? (dps.length > 0 ? dps[0] : null),
    }));
  } catch (err) {
    if (mode === 'silent') return;
    set({
      loading: false,
      vehicleLoading: false,
      loaded: true,
      lastOutcome: { kind: 'error', message: mapAxiosError(err).message || 'Failed to load loading data.' },
    });
  }
}

export const useKarenLoadingStore = create<State>((set, get) => ({
  loading: false,
  vehicleLoading: false,
  loaded: false,
  data: null,
  selectedPlan: null,
  selectedVehicle: null,
  expandedDeliveryPoint: null,
  selectedDate: tomorrowISO(),
  submitting: false,
  lastOutcome: null,

  loadInitial: async (farm) => {
    await fetchData(farm, '', 'full', set, get().selectedDate);
  },

  selectPlan: async (farm, planName) => {
    set({ selectedPlan: planName, selectedVehicle: null, expandedDeliveryPoint: null });
    await fetchData(farm, '', 'vehicle', set, get().selectedDate, planName);
  },

  reload: async (farm) => {
    const { selectedPlan, selectedDate } = get();
    if (selectedPlan) await fetchData(farm, '', 'vehicle', set, selectedDate, selectedPlan);
    else await fetchData(farm, '', 'full', set, selectedDate);
  },

  setDate: async (farm, date) => {
    // A new day has its own plans — drop the current selection.
    set({ selectedDate: date, selectedPlan: null, selectedVehicle: null, data: null, expandedDeliveryPoint: null });
    await fetchData(farm, '', 'full', set, date);
  },

  deselectVehicle: async (farm) => {
    set({ selectedPlan: null, selectedVehicle: null, expandedDeliveryPoint: null });
    await fetchData(farm, '', 'full', set, get().selectedDate);
  },

  toggleDeliveryPoint: (deliveryPoint) => {
    set((s) => ({
      expandedDeliveryPoint: s.expandedDeliveryPoint === deliveryPoint ? null : deliveryPoint,
    }));
  },

  submitScan: async (farm, raw, temperature) => {
    const state = get();
    const fail = (kind: 'error' | 'warning', message: string): LoadOutcome => {
      const out: LoadOutcome = { kind, message };
      set({ lastOutcome: out });
      return out;
    };

    if (!state.selectedPlan) return fail('warning', 'Please select a loading plan first.');

    const boxLabel = extractBoxLabel(raw);
    if (!boxLabel) return fail('warning', 'Please scan a valid box QR code.');

    set({ submitting: true });
    let result: { status?: string; message?: string } | undefined;
    try {
      const res = await karenLoadingApi.createLoadingEntry({
        box_label_name: boxLabel,
        vehicle: state.selectedVehicle ?? state.data?.selectedVehicle ?? '',
        temperature: Number.isFinite(temperature) ? temperature : 0,
        delivery_date: state.data?.deliveryDate ?? state.selectedDate ?? '',
      });
      result = unwrap(res as RawLoadingEntryResponse);
    } catch (err) {
      set({ submitting: false });
      return fail('error', mapAxiosError(err).message || 'Failed to record loading.');
    }

    set({ submitting: false });
    if (!result || result.status !== 'success') {
      return fail('error', result?.message ?? 'Failed to record loading.');
    }

    set({ lastOutcome: { kind: 'success', message: result.message } });
    // Silent refresh: update loaded counts in place without hiding the plan
    // or stealing focus from the scanner, so the operator keeps scanning.
    await fetchData(farm, '', 'silent', set, state.selectedDate, state.selectedPlan ?? undefined);
    return { kind: 'success', message: result.message };
  },

  reset: () =>
    set({
      loading: false,
      vehicleLoading: false,
      loaded: false,
      data: null,
      selectedPlan: null,
      selectedVehicle: null,
      expandedDeliveryPoint: null,
      selectedDate: tomorrowISO(),
      submitting: false,
      lastOutcome: null,
    }),
}));
