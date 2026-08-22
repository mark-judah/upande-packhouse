import { create } from 'zustand';
import { karenBucketLogisticsApi } from '../api/karen-bucket-logistics-api';
import type {
  RawRoute,
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
  /** 1-based, global across all of today's trips, lowest packhouse-schedule number first. */
  sequence: number;
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
  /** Raw Frappe datetime strings, '' until set. */
  dispatchedAt: string;
  receivedAt: string;
  /** e.g. "1h 45m" once both timestamps are present; '' otherwise. */
  turnaround: string;
};

export type TripGroup = 'planned' | 'on_the_road' | 'back';

export type Route = {
  vehicle: string;
  /** Full drive chain including the packhouse at both ends; [] if no route set today. */
  stops: string[];
  totalKm: number;
  hasRoute: boolean;
  trip: { name: string; status: TripStatus } | null;
};

type ActionOutcome = { kind: 'success' | 'error'; message: string };

type State = {
  loading: boolean;
  error: string | null;
  actioning: Record<string, boolean>;
  groups: Record<TripGroup, Trip[]>;
  routes: Route[];

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

/** Every schedule-feed order whose OPL is on this trip. */
function scheduleMatches(trip: RawTrip, scheduleOrders: RawScheduleOrder[]): RawScheduleOrder[] {
  const oplSet = new Set(trip.orders.map((o) => o.order_pick_list));
  return scheduleOrders.filter((o) => oplSet.has(o.opl));
}

function buildScheduleContext(matches: RawScheduleOrder[]): string {
  if (!matches.length) return '';
  const best = matches.reduce((a, b) => (b.schedule < a.schedule ? b : a));
  return best.team ? `${best.team} · #${best.schedule} in queue` : `#${best.schedule} in queue`;
}

/** Lowest packhouse-schedule number among this trip's cargo; +Infinity if none match
 * (pushes trips with no schedule context to the back of the global sequence). */
function bestScheduleSeq(matches: RawScheduleOrder[]): number {
  if (!matches.length) return Number.POSITIVE_INFINITY;
  return matches.reduce((min, o) => Math.min(min, o.schedule), Number.POSITIVE_INFINITY);
}

function parseDt(s: string): Date | null {
  if (!s) return null;
  // Frappe datetimes come as "YYYY-MM-DD HH:MM:SS[.ffffff]".
  const d = new Date(s.trim().replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** e.g. "1h 45m" between dispatch and arrival; '' if either timestamp is missing/invalid. */
export function turnaroundLabel(dispatchedAt: string, receivedAt: string): string {
  const start = parseDt(dispatchedAt);
  const end = parseDt(receivedAt);
  if (!start || !end) return '';
  const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function buildTrip(
  raw: RawTrip,
  scheduleOrders: RawScheduleOrder[],
  truckStatus: RawTruckStatus[],
  sequence: number,
): Trip {
  const cap = raw.capacity_buckets || 0;
  const fillPct = cap > 0 ? Math.max(0, Math.min(100, Math.round((raw.total_buckets / cap) * 100))) : 0;
  const matches = scheduleMatches(raw, scheduleOrders);
  return {
    name: raw.name,
    sequence,
    vehicle: raw.vehicle || 'Unassigned',
    status: (raw.status || 'Draft') as TripStatus,
    capacityBuckets: cap,
    totalBuckets: raw.total_buckets || 0,
    totalStems: raw.total_stems || 0,
    fillPct,
    stops: buildStops(raw),
    pills: buildPills(raw.vehicle, truckStatus),
    scheduleContext: buildScheduleContext(matches),
    dispatchedAt: raw.dispatched_at || '',
    receivedAt: raw.received_at || '',
    turnaround: turnaroundLabel(raw.dispatched_at, raw.received_at),
  };
}

/**
 * Pure: raw feed -> trips grouped by lifecycle stage, numbered Trip 1, Trip 2, ...
 * globally in ascending packhouse-schedule priority (Trip 1 = whichever truck's
 * cargo is needed soonest), independent of status. Exported for testing.
 */
export function groupTrips(data: RawTransferScheduleData): Record<TripGroup, Trip[]> {
  const ranked = data.trips
    .map((raw) => ({ raw, seq: bestScheduleSeq(scheduleMatches(raw, data.orders)) }))
    .sort((a, b) => a.seq - b.seq || a.raw.name.localeCompare(b.raw.name));

  const groups: Record<TripGroup, Trip[]> = { planned: [], on_the_road: [], back: [] };
  ranked.forEach(({ raw }, i) => {
    const trip = buildTrip(raw, data.orders, data.truck_status, i + 1);
    groups[groupForStatus(trip.status)].push(trip);
  });
  return groups;
}

/** The full drive chain (packhouse at both ends) from a route's ordered legs. */
function routeStops(route: RawRoute): string[] {
  if (!route.legs.length) return [];
  return [route.legs[0].from_farm, ...route.legs.map((l) => l.to_farm)];
}

/**
 * Pure: today's planned routes per vehicle, cross-referenced with whether a trip
 * already exists for that vehicle — "what did the sales team plan" independent of
 * "has anyone dispatched it yet". Includes vehicles that have a trip but no route
 * (a data-quality signal worth surfacing, not hiding). Exported for testing.
 */
export function buildRoutes(data: RawTransferScheduleData): Route[] {
  const tripByVehicle = new Map<string, RawTrip>();
  for (const t of data.trips) {
    if (t.vehicle && !tripByVehicle.has(t.vehicle)) tripByVehicle.set(t.vehicle, t);
  }

  const vehicles = new Set<string>();
  data.routes.forEach((r) => { if (r.vehicle) vehicles.add(r.vehicle); });
  data.trips.forEach((t) => { if (t.vehicle) vehicles.add(t.vehicle); });

  return Array.from(vehicles)
    .sort()
    .map((vehicle) => {
      const raw = data.routes.find((r) => r.vehicle === vehicle) || null;
      const trip = tripByVehicle.get(vehicle) || null;
      return {
        vehicle,
        stops: raw ? routeStops(raw) : [],
        totalKm: raw ? raw.total_km : 0,
        hasRoute: !!raw,
        trip: trip ? { name: trip.name, status: (trip.status || 'Draft') as TripStatus } : null,
      };
    });
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
    // The optimistic move above doesn't know the server-set dispatched_at/received_at
    // timestamp yet (needed for turnaround time) — refresh in the background to pick
    // it up. Not awaited: the success outcome shouldn't wait on this round-trip.
    get().load();
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
  routes: [],

  load: async () => {
    set({ loading: true, error: null });
    try {
      const raw = await karenBucketLogisticsApi.fetch();
      set({ loading: false, groups: groupTrips(raw), routes: buildRoutes(raw) });
    } catch (err) {
      set({ loading: false, error: mapAxiosError(err).message || 'Could not load trips.' });
    }
  },

  dispatch: (name) =>
    moveTrip(get, set, name, 'planned', 'on_the_road', 'Dispatched', karenBucketLogisticsApi.dispatch, 'Truck dispatched.'),

  receive: (name) =>
    moveTrip(get, set, name, 'on_the_road', 'back', 'Received', karenBucketLogisticsApi.receive, 'Trip ended.'),

  reset: () => set({ loading: false, error: null, actioning: {}, groups: EMPTY_GROUPS, routes: [] }),
}));
