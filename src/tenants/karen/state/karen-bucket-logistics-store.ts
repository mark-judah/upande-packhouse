import { create } from 'zustand';
import { karenBucketLogisticsApi } from '../api/karen-bucket-logistics-api';
import type {
  RawRoute,
  RawScheduleOrder,
  RawTransferScheduleData,
  RawTrip,
  RawTripActionResponse,
  RawVehicle,
} from '../api/karen-bucket-logistics-api';
import { mapAxiosError } from '@/src/core/api/client';
import { todayISO } from '@/src/core/date';

export type TripStatusPill = {
  key: 'awaiting' | 'loaded' | 'in_transit' | 'shelved';
  label: string;
  count: number;
};

/** Live bucket-stage breakdown, already deduped by (order_pick_list, farm). */
export type StageCounts = { awaiting: number; loaded: number; inTransit: number; shelved: number };

export type TripStop = {
  farm: string;
  buckets: number;
  orders: { orderName: string; customer: string; varieties: string; buckets: number }[];
  stage: StageCounts;
};

export type TripStatus = 'Draft' | 'Requested' | 'Scheduled' | 'Dispatched' | 'Received';

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
  /** Can still be edited: planned (not left the hub with a load), nothing on its truck. */
  editable: boolean;
  tripDate: string;
  notes: string;
  collectionOrder: string;
  /** Who requested the truck on the dashboard ('' if not yet), and when. */
  requestedBy: string;
  requestedAt: string;
  /** Buckets are already on its truck (loaded at a farm, not yet dispatched). */
  hasLoads: boolean;
  /** Requested, for today: the release can still be confirmed. */
  canRelease: boolean;
  /** Can leave for the packhouse now: loaded, or released. */
  canDispatch: boolean;
};

/** requests: planned and requested (the Trip Requests tab); started: released to the
 *  farm; on_the_road: loaded, heading to the packhouse; back: ended. */
export type TripGroup = 'requests' | 'started' | 'on_the_road' | 'back';

export type Route = {
  vehicle: string;
  /** The packhouse the route starts and ends at. */
  hub: string;
  /** The route's trips in driving order, each the farms it collects from; [] if no route set today. */
  runs: string[][];
  totalKm: number;
  hasRoute: boolean;
  trip: { name: string; status: TripStatus } | null;
};

type ActionOutcome = { kind: 'success' | 'error'; message: string };

type State = {
  /** First load only: nothing to show yet. */
  loading: boolean;
  /** A reload while data is already on screen. */
  refreshing: boolean;
  /** At least one load has succeeded since the last reset. */
  loaded: boolean;
  error: string | null;
  actioning: Record<string, boolean>;
  groups: Record<TripGroup, Trip[]>;
  routes: Route[];
  /** Transfer trucks, for moving a trip to another one. */
  vehicles: RawVehicle[];
  /** The feed's day (server), the default and latest selectable day. */
  today: string;
  /** The day being viewed; null = today. */
  date: string | null;

  load: () => Promise<void>;
  /** View another day's trips: clears what is shown, then loads that day. */
  setDate: (date: string) => Promise<void>;
  /** Put a planned trip on another truck; its buckets stay as planned. */
  saveEdit: (trip: Trip, vehicle: string) => Promise<ActionOutcome>;
  dispatch: (name: string) => Promise<ActionOutcome>;
  /** Confirm a requested truck has been released to the farm. */
  release: (name: string) => Promise<ActionOutcome>;
  /** Reject a truck request with a reason: back to the scheduler. */
  reject: (name: string, reason: string) => Promise<ActionOutcome>;
  receive: (name: string) => Promise<ActionOutcome>;
  reset: () => void;
};

const EMPTY_GROUPS: Record<TripGroup, Trip[]> = { requests: [], started: [], on_the_road: [], back: [] };

const ACTIVE_STATUSES: string[] = ['Draft', 'Requested', 'Scheduled'];

/** The server's day the feed was built on (generated_at), else the device's. */
export function feedToday(data: Pick<RawTransferScheduleData, 'generated_at'>): string {
  const day = (data.generated_at || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : todayISO();
}

function rawHasLoads(raw: RawTrip): boolean {
  return !!raw.loading || (raw.loaded_buckets || 0) > 0;
}

/** The feed also carries up to a week of earlier, never-received trips. Only the
 *  selected day's show; on today, also an earlier one whose truck is still on the road. */
function isShown(raw: RawTrip, today: string, day: string): boolean {
  if (!raw.trip_date) return day === today;
  if (raw.trip_date === day) return true;
  return day === today && raw.trip_date < today && raw.status === 'Dispatched';
}

function groupForStatus(status: string): TripGroup {
  if (status === 'Dispatched') return 'on_the_road';
  if (status === 'Received') return 'back';
  if (status === 'Scheduled') return 'started'; // released to the farm
  return 'requests'; // Draft, Requested
}

const ZERO_STAGE: StageCounts = { awaiting: 0, loaded: 0, inTransit: 0, shelved: 0 };

function addStage(a: StageCounts, b: StageCounts): StageCounts {
  return { awaiting: a.awaiting + b.awaiting, loaded: a.loaded + b.loaded, inTransit: a.inTransit + b.inTransit, shelved: a.shelved + b.shelved };
}

function buildStops(trip: RawTrip): TripStop[] {
  const sequence = (trip.collection_order || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const byFarm = new Map<string, TripStop>();
  // Stage counts are per (order_pick_list, farm) but the SAME pair can appear on
  // multiple order rows within one trip (real data: multi-round planning adds a new
  // row each time rather than merging into the existing one). Each duplicate row
  // reports the pair's full stage counts, so dedupe by opl before summing into the
  // stop total — summing every row would multiply the true count.
  const seenOplPerFarm = new Map<string, Set<string>>();

  for (const row of trip.orders) {
    const farm = row.farm || '?';
    if (!byFarm.has(farm)) byFarm.set(farm, { farm, buckets: 0, orders: [], stage: ZERO_STAGE });
    const stop = byFarm.get(farm)!;
    stop.buckets += row.buckets;
    stop.orders.push({
      orderName: row.order_name || row.order_pick_list,
      customer: row.customer,
      varieties: row.varieties,
      buckets: row.buckets,
    });

    const seenOpls = seenOplPerFarm.get(farm) ?? new Set<string>();
    seenOplPerFarm.set(farm, seenOpls);
    if (!seenOpls.has(row.order_pick_list)) {
      seenOpls.add(row.order_pick_list);
      stop.stage = addStage(stop.stage, {
        awaiting: row.awaiting || 0,
        loaded: row.loaded || 0,
        inTransit: row.in_transit || 0,
        shelved: row.shelved || 0,
      });
    }
  }

  const known = Array.from(byFarm.keys());
  const sequenced = sequence.filter((f) => byFarm.has(f));
  const rest = known.filter((f) => !sequenced.includes(f));
  return [...sequenced, ...rest].map((f) => byFarm.get(f)!);
}

const PILL_DEFS: { key: TripStatusPill['key']; label: string; stageKey: keyof StageCounts }[] = [
  { key: 'awaiting', label: 'Awaiting', stageKey: 'awaiting' },
  { key: 'loaded', label: 'Loading', stageKey: 'loaded' },
  { key: 'in_transit', label: 'In transit', stageKey: 'inTransit' },
  { key: 'shelved', label: 'Arrived', stageKey: 'shelved' },
];

/** Stage counts -> display pills, dropping zero counts. Exported for per-stop use in the UI. */
export function stageToPills(stage: StageCounts): TripStatusPill[] {
  return PILL_DEFS
    .map((d) => ({ key: d.key, label: d.label, count: stage[d.stageKey] }))
    .filter((p) => p.count > 0);
}

/** Trip-wide stage pills, summed across its (already-deduped) stops. */
function buildPills(stops: TripStop[]): TripStatusPill[] {
  return stageToPills(stops.reduce((acc, s) => addStage(acc, s.stage), ZERO_STAGE));
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

export function buildTrip(raw: RawTrip, scheduleOrders: RawScheduleOrder[], sequence: number, today: string): Trip {
  const status = raw.status || 'Draft';
  const active = ACTIVE_STATUSES.includes(status);
  const hasLoads = rawHasLoads(raw);
  const earlier = !!raw.trip_date && raw.trip_date < today;
  const cap = raw.capacity_buckets || 0;
  const fillPct = cap > 0 ? Math.max(0, Math.min(100, Math.round((raw.total_buckets / cap) * 100))) : 0;
  const matches = scheduleMatches(raw, scheduleOrders);
  const stops = buildStops(raw);
  return {
    name: raw.name,
    sequence,
    vehicle: raw.vehicle || 'Unassigned',
    status: status as TripStatus,
    capacityBuckets: cap,
    totalBuckets: raw.total_buckets || 0,
    totalStems: raw.total_stems || 0,
    fillPct,
    stops,
    pills: buildPills(stops),
    scheduleContext: buildScheduleContext(matches),
    dispatchedAt: raw.dispatched_at || '',
    receivedAt: raw.received_at || '',
    turnaround: turnaroundLabel(raw.dispatched_at, raw.received_at),
    editable: active && !earlier && !raw.stale && !hasLoads,
    tripDate: raw.trip_date || '',
    notes: raw.notes || '',
    collectionOrder: raw.collection_order || '',
    requestedBy: raw.requested_by || '',
    requestedAt: raw.requested_at || '',
    hasLoads,
    // The server refuses to release an earlier day's trip.
    canRelease: status === 'Requested' && !earlier,
    // dispatchBucketTrip takes any planned status (Draft / Requested / Scheduled).
    canDispatch: active && !earlier && (hasLoads || status === 'Scheduled'),
  };
}

/**
 * Pure: raw feed -> the selected day's trips (on today, plus any earlier one still on
 * the road) grouped by lifecycle stage, numbered Trip 1, Trip 2, ... globally in
 * ascending packhouse-schedule priority (Trip 1 = whichever truck's cargo is needed
 * soonest), independent of status. An earlier day's trips are view-only. Exported for
 * testing.
 */
export function groupTrips(
  data: RawTransferScheduleData,
  today: string = feedToday(data),
  day: string = today,
): Record<TripGroup, Trip[]> {
  const ranked = data.trips
    .filter((raw) => isShown(raw, today, day))
    .map((raw) => ({ raw, seq: bestScheduleSeq(scheduleMatches(raw, data.orders)) }))
    .sort((a, b) => a.seq - b.seq || a.raw.name.localeCompare(b.raw.name));

  const groups: Record<TripGroup, Trip[]> = { requests: [], started: [], on_the_road: [], back: [] };
  ranked.forEach(({ raw }, i) => {
    const trip = buildTrip(raw, data.orders, i + 1, today);
    groups[groupForStatus(trip.status)].push(trip);
  });
  return groups;
}

/** A route's trips, as the dashboard shows them: split where the legs come back to the
 *  packhouse, each trip the farms it collects from (Kapkolia → Chepsito → Kapkolia →
 *  Simotwo → Kapkolia is two trips). Same rule as the server's route_runs. */
function routeRuns(route: RawRoute): { hub: string; runs: string[][] } {
  const hub = route.legs[0]?.from_farm ?? '';
  const runs: string[][] = [];
  let cur: string[] | null = null;
  for (const leg of route.legs) {
    if (!cur) {
      cur = [];
      runs.push(cur);
    }
    if (leg.to_farm && leg.to_farm !== hub && !cur.includes(leg.to_farm)) cur.push(leg.to_farm);
    if (leg.to_farm === hub) cur = null;
  }
  return { hub, runs: runs.filter((r) => r.length) };
}

/**
 * Pure: today's planned routes per vehicle, cross-referenced with whether a trip
 * already exists for that vehicle — "what did the sales team plan" independent of
 * "has anyone dispatched it yet". Includes vehicles that have a trip but no route
 * (a data-quality signal worth surfacing, not hiding). Exported for testing.
 */
export function buildRoutes(
  data: RawTransferScheduleData,
  today: string = feedToday(data),
  day: string = today,
): Route[] {
  const trips = data.trips.filter((t) => isShown(t, today, day));
  // The feed's routes are always today's.
  const routes = day === today ? data.routes : [];
  const tripByVehicle = new Map<string, RawTrip>();
  for (const t of trips) {
    if (t.vehicle && !tripByVehicle.has(t.vehicle)) tripByVehicle.set(t.vehicle, t);
  }

  const vehicles = new Set<string>();
  routes.forEach((r) => { if (r.vehicle) vehicles.add(r.vehicle); });
  trips.forEach((t) => { if (t.vehicle) vehicles.add(t.vehicle); });

  return Array.from(vehicles)
    .sort()
    .map((vehicle) => {
      const raw = routes.find((r) => r.vehicle === vehicle) || null;
      const trip = tripByVehicle.get(vehicle) || null;
      const { hub, runs } = raw ? routeRuns(raw) : { hub: '', runs: [] };
      return {
        vehicle,
        hub,
        runs,
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

/** Optimistically move a trip (from whichever group holds it) to `to`, then run the
 *  action; a failure reloads to put it back. Exported for testing. */
export async function moveTrip(
  get: () => State,
  set: (partial: Partial<State>) => void,
  name: string,
  to: TripGroup,
  newStatus: TripStatus,
  action: (name: string) => Promise<RawTripActionResponse>,
  successMessage: string,
): Promise<ActionOutcome> {
  const { groups, actioning } = get();
  const from = (Object.keys(groups) as TripGroup[]).find((g) => groups[g].some((t) => t.name === name));
  const trip = from ? groups[from].find((t) => t.name === name) : undefined;
  if (!from || !trip) return { kind: 'error', message: 'Trip not found.' };

  const moved: Trip = {
    ...trip,
    status: newStatus,
    editable: false,
    canRelease: false,
    canDispatch: false,
  };
  const without = { ...groups, [from]: groups[from].filter((t) => t.name !== name) };
  set({
    groups: { ...without, [to]: [...without[to], moved] },
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

// One feed request at a time: a load asked for while one is in flight runs once more
// after it (its data may predate the action that asked), and every caller awaits that.
let inflight: Promise<void> | null = null;
let rerun = false;
// Bumped by reset(): a response that lands after it is dropped.
let generation = 0;

export const useKarenBucketLogisticsStore = create<State>((set, get) => {
  const fetchOnce = async () => {
    const gen = generation;
    const hasData = get().loaded;
    set(hasData ? { refreshing: true } : { loading: true, error: null });
    try {
      const date = get().date;
      const raw = await karenBucketLogisticsApi.fetch(date ?? undefined);
      if (gen !== generation) return;
      const today = feedToday(raw);
      const day = date ?? today;
      set({
        loading: false,
        refreshing: false,
        loaded: true,
        error: null,
        today,
        date: day === today ? null : date,
        groups: groupTrips(raw, today, day),
        routes: buildRoutes(raw, today, day),
        vehicles: raw.vehicles ?? [],
      });
    } catch (err) {
      if (gen !== generation) return;
      // Data on screen stays; only an empty screen shows the error.
      set(
        get().loaded
          ? { loading: false, refreshing: false }
          : { loading: false, refreshing: false, error: mapAxiosError(err).message || 'Could not load trips.' },
      );
    }
  };

  return {
  loading: false,
  refreshing: false,
  loaded: false,
  error: null,
  actioning: {},
  groups: EMPTY_GROUPS,
  routes: [],
  vehicles: [],
  today: todayISO(),
  date: null,

  load: () => {
    if (inflight) {
      rerun = true;
      return inflight;
    }
    const gen = generation;
    inflight = (async () => {
      try {
        do {
          rerun = false;
          await fetchOnce();
        } while (rerun && gen === generation);
      } finally {
        // After a reset() a newer load may own `inflight`.
        if (gen === generation) inflight = null;
      }
    })();
    return inflight;
  },

  setDate: (date) => {
    const next = date === get().today ? null : date;
    if (next === get().date) return get().load();
    // Drop the other day's trips and any load still fetching it.
    generation += 1;
    inflight = null;
    rerun = false;
    set({ date: next, loaded: false, refreshing: false, error: null, actioning: {}, groups: EMPTY_GROUPS, routes: [], vehicles: [] });
    return get().load();
  },

  dispatch: (name) =>
    moveTrip(get, set, name, 'on_the_road', 'Dispatched', karenBucketLogisticsApi.dispatch, 'Truck dispatched.'),

  release: async (name) => {
    set({ actioning: { ...get().actioning, [name]: true } });
    try {
      const res = unwrapAction(await karenBucketLogisticsApi.release(name));
      set({ actioning: { ...get().actioning, [name]: false } });
      await get().load();
      return res.status === 'success'
        ? { kind: 'success', message: 'Release confirmed.' }
        : { kind: 'error', message: res.message || 'Could not confirm the release.' };
    } catch (err) {
      set({ actioning: { ...get().actioning, [name]: false } });
      return { kind: 'error', message: mapAxiosError(err).message || 'Could not confirm the release.' };
    }
  },

  reject: async (name, reason) => {
    set({ actioning: { ...get().actioning, [name]: true } });
    try {
      const res = unwrapAction(await karenBucketLogisticsApi.reject(name, reason));
      set({ actioning: { ...get().actioning, [name]: false } });
      await get().load();
      return res.status === 'success'
        ? { kind: 'success', message: 'Request rejected — sent back to the scheduler.' }
        : { kind: 'error', message: res.message || 'Could not reject the request.' };
    } catch (err) {
      set({ actioning: { ...get().actioning, [name]: false } });
      return { kind: 'error', message: mapAxiosError(err).message || 'Could not reject the request.' };
    }
  },

  receive: (name) =>
    moveTrip(get, set, name, 'back', 'Received', karenBucketLogisticsApi.receive, 'Trip ended.'),

  saveEdit: async (trip, vehicle) => {
    const name = trip.name;
    set({ actioning: { ...get().actioning, [name]: true } });
    try {
      const res = unwrapAction(await karenBucketLogisticsApi.changeVehicle(name, vehicle));
      set({ actioning: { ...get().actioning, [name]: false } });
      await get().load();
      return res.status === 'success'
        ? { kind: 'success', message: `${name} moved to ${vehicle}.` }
        : { kind: 'error', message: res.message || 'Could not change the truck.' };
    } catch (err) {
      set({ actioning: { ...get().actioning, [name]: false } });
      return { kind: 'error', message: mapAxiosError(err).message || 'Could not change the truck.' };
    }
  },

  reset: () => {
    generation += 1;
    inflight = null;
    rerun = false;
    set({
      loading: false, refreshing: false, loaded: false, error: null, actioning: {},
      groups: EMPTY_GROUPS, routes: [], vehicles: [], today: todayISO(), date: null,
    });
  },
  };
});
