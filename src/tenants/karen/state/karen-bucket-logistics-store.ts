import { create } from 'zustand';
import { karenBucketLogisticsApi } from '../api/karen-bucket-logistics-api';
import type {
  RawScheduleOrder,
  RawTransferScheduleData,
  RawTrip,
  RawTripActionResponse,
  RawTruckStatus,
} from '../api/karen-bucket-logistics-api';
import { mapAxiosError } from '@/src/core/api/client';

export type TripStatusPill = {
  key: 'awaiting' | 'loaded' | 'in_transit' | 'shelved';
  label: string;
  count: number;
};

export type TripStop = {
  farm: string;
  buckets: number;
  orders: { orderName: string; customer: string; varieties: string; buckets: number }[];
};

export type TripStatus = 'Draft' | 'Scheduled' | 'Dispatched' | 'Received';

export type Trip = {
  name: string;
  vehicle: string;
  status: TripStatus;
  capacityBuckets: number;
  totalBuckets: number;
  totalStems: number;
  /** total/capacity as a whole-number percent, clamped to [0, 100]; 0 when capacity is 0. */
  fillPct: number;
  stops: TripStop[];
  pills: TripStatusPill[];
  /** e.g. "Team A · #2 in queue" — from the matching order's team/schedule; '' if none match. */
  scheduleContext: string;
};

export type TripGroup = 'planned' | 'on_the_road' | 'back';

type ActionOutcome = { kind: 'success' | 'error'; message: string };

type State = {
  loading: boolean;
  error: string | null;
  actioning: Record<string, boolean>;
  groups: Record<TripGroup, Trip[]>;

  load: () => Promise<void>;
  dispatch: (name: string) => Promise<ActionOutcome>;
  receive: (name: string) => Promise<ActionOutcome>;
  reset: () => void;
};

const EMPTY_GROUPS: Record<TripGroup, Trip[]> = { planned: [], on_the_road: [], back: [] };

function groupForStatus(status: string): TripGroup {
  if (status === 'Dispatched') return 'on_the_road';
  if (status === 'Received') return 'back';
  return 'planned'; // Draft, Scheduled
}

function buildStops(trip: RawTrip): TripStop[] {
  const sequence = (trip.collection_order || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const byFarm = new Map<string, TripStop>();
  for (const row of trip.orders) {
    const farm = row.farm || '?';
    if (!byFarm.has(farm)) byFarm.set(farm, { farm, buckets: 0, orders: [] });
    const stop = byFarm.get(farm)!;
    stop.buckets += row.buckets;
    stop.orders.push({
      orderName: row.order_name || row.order_pick_list,
      customer: row.customer,
      varieties: row.varieties,
      buckets: row.buckets,
    });
  }

  const known = Array.from(byFarm.keys());
  const sequenced = sequence.filter((f) => byFarm.has(f));
  const rest = known.filter((f) => !sequenced.includes(f));
  return [...sequenced, ...rest].map((f) => byFarm.get(f)!);
}

const PILL_DEFS: { key: TripStatusPill['key']; label: string }[] = [
  { key: 'awaiting', label: 'Awaiting' },
  { key: 'loaded', label: 'Loading' },
  { key: 'in_transit', label: 'In transit' },
  { key: 'shelved', label: 'Arrived' },
];

function buildPills(vehicle: string, truckStatus: RawTruckStatus[]): TripStatusPill[] {
  const s = truckStatus.find((t) => t.truck === vehicle);
  if (!s || !s.total) return [];
  return PILL_DEFS
    .map((d) => ({ key: d.key, label: d.label, count: Number(s[d.key] ?? 0) }))
    .filter((p) => p.count > 0);
}

function buildScheduleContext(trip: RawTrip, scheduleOrders: RawScheduleOrder[]): string {
  const oplSet = new Set(trip.orders.map((o) => o.order_pick_list));
  const matches = scheduleOrders.filter((o) => oplSet.has(o.opl));
  if (!matches.length) return '';
  const best = matches.reduce((a, b) => (b.schedule < a.schedule ? b : a));
  return best.team ? `${best.team} · #${best.schedule} in queue` : `#${best.schedule} in queue`;
}

function buildTrip(raw: RawTrip, scheduleOrders: RawScheduleOrder[], truckStatus: RawTruckStatus[]): Trip {
  const cap = raw.capacity_buckets || 0;
  const fillPct = cap > 0 ? Math.max(0, Math.min(100, Math.round((raw.total_buckets / cap) * 100))) : 0;
  return {
    name: raw.name,
    vehicle: raw.vehicle || 'Unassigned',
    status: (raw.status || 'Draft') as TripStatus,
    capacityBuckets: cap,
    totalBuckets: raw.total_buckets || 0,
    totalStems: raw.total_stems || 0,
    fillPct,
    stops: buildStops(raw),
    pills: buildPills(raw.vehicle, truckStatus),
    scheduleContext: buildScheduleContext(raw, scheduleOrders),
  };
}

/** Pure: raw feed -> trips grouped by lifecycle stage. Exported for testing. */
export function groupTrips(data: RawTransferScheduleData): Record<TripGroup, Trip[]> {
  const groups: Record<TripGroup, Trip[]> = { planned: [], on_the_road: [], back: [] };
  for (const raw of data.trips) {
    const trip = buildTrip(raw, data.orders, data.truck_status);
    groups[groupForStatus(trip.status)].push(trip);
  }
  return groups;
}

function unwrapAction(raw: RawTripActionResponse | undefined): { status?: string; message?: string } {
  const m = raw?.message;
  if (!m) return {};
  if (typeof m === 'string') {
    try {
      return JSON.parse(m);
    } catch {
      return {};
    }
  }
  return m;
}

async function moveTrip(
  get: () => State,
  set: (partial: Partial<State>) => void,
  name: string,
  from: TripGroup,
  to: TripGroup,
  newStatus: TripStatus,
  action: (name: string) => Promise<RawTripActionResponse>,
  successMessage: string,
): Promise<ActionOutcome> {
  const { groups, actioning } = get();
  const trip = groups[from].find((t) => t.name === name);
  if (!trip) return { kind: 'error', message: 'Trip not found.' };

  set({
    groups: {
      ...groups,
      [from]: groups[from].filter((t) => t.name !== name),
      [to]: [...groups[to], { ...trip, status: newStatus }],
    },
    actioning: { ...actioning, [name]: true },
  });

  try {
    const raw = await action(name);
    const result = unwrapAction(raw);
    if (result.status !== 'success') {
      await get().load();
      set({ actioning: { ...get().actioning, [name]: false } });
      return { kind: 'error', message: result.message || 'Action failed.' };
    }
    set({ actioning: { ...get().actioning, [name]: false } });
    return { kind: 'success', message: successMessage };
  } catch (err) {
    await get().load();
    set({ actioning: { ...get().actioning, [name]: false } });
    return { kind: 'error', message: mapAxiosError(err).message || 'Action failed.' };
  }
}

export const useKarenBucketLogisticsStore = create<State>((set, get) => ({
  loading: false,
  error: null,
  actioning: {},
  groups: EMPTY_GROUPS,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const raw = await karenBucketLogisticsApi.fetch();
      set({ loading: false, groups: groupTrips(raw) });
    } catch (err) {
      set({ loading: false, error: mapAxiosError(err).message || 'Could not load trips.' });
    }
  },

  dispatch: (name) =>
    moveTrip(get, set, name, 'planned', 'on_the_road', 'Dispatched', karenBucketLogisticsApi.dispatch, 'Truck dispatched.'),

  receive: (name) =>
    moveTrip(get, set, name, 'on_the_road', 'back', 'Received', karenBucketLogisticsApi.receive, 'Truck received.'),

  reset: () => set({ loading: false, error: null, actioning: {}, groups: EMPTY_GROUPS }),
}));
