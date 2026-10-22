import { create } from 'zustand';
import { karenBucketLogisticsApi } from '../api/karen-bucket-logistics-api';
import type {
  RawBucketDetail,
  RawRoute,
  RawScheduleOrder,
  RawTransferScheduleData,
  RawTrip,
  RawTripActionMessage,
  RawTripActionResponse,
  RawTripNumbers,
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

/** Where a trip stands, from its buckets' flags (the dashboard's stage colours). */
export type TripState = { label: string; color: string };

/** Planned at a farm: what the trip carries from it. */
export type FarmLoad = { farm: string; buckets: number };

/** One (order, farm) pair on a trip: what getBucketLogisticsDetail is asked for. */
export type OrderFarm = { opl: string; orderName: string; farm: string; riding?: number };

export type Trip = {
  name: string;
  /** 1-based, global across all of today's trips, lowest packhouse-schedule number first. */
  sequence: number;
  vehicle: string;
  /** The truck's trip number that day: its route run, else its place among the truck's trips. */
  tripNo: number;
  /** "<truck> · Trip N". */
  title: string;
  /** e.g. "Kapkolia → Chepsito → Kapkolia", '' without a route run. */
  runChain: string;
  /** When the trip was planned, and when it became Scheduled ('' until then). */
  createdAt: string;
  scheduledAt: string;
  /** total/capacity as a whole-number percent, NOT clamped (over 100 = over capacity). */
  loadPct: number;
  /** capacity - total: negative when over capacity. */
  freeBuckets: number;
  loadedBuckets: number;
  arrivedBuckets: number;
  /** Buckets per farm, in collection order. */
  farmLoads: FarmLoad[];
  /** Where it stands from its buckets' flags. */
  state: TripState;
  /** Its (order, farm) pairs, deduped. */
  orderFarms: OrderFarm[];
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
  /** Per run (same order as `runs`): the trip driving it, null if none. */
  runTrips: ({ name: string; status: TripStatus } | null)[];
  /** The server said which trip drives each run. */
  runsKnown: boolean;
};

/** The truck is under its minimum load: the numbers the server sent back. */
export type BelowMinimum = { loaded: number; capacity: number; needed: number; pct: number; message: string };

export type ActionOutcome =
  | { kind: 'success' | 'error'; message: string }
  | { kind: 'below_minimum'; message: string; belowMinimum: BelowMinimum };

/** An order's buckets at a farm that no trip carries yet. */
export type NotScheduledOrder = { opl: string; orderName: string; farm: string; buckets: number };

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
  /** Orders with buckets at a farm on no trip yet (today only). */
  notScheduled: NotScheduledOrder[];
  /** The packhouse the trucks bring the buckets to. */
  hub: string;
  /** The feed's day (server), the default and latest selectable day. */
  today: string;
  /** The day being viewed; null = today. */
  date: string | null;

  load: () => Promise<void>;
  /** View another day's trips: clears what is shown, then loads that day. */
  setDate: (date: string) => Promise<void>;
  /** Put a planned trip on another truck; its buckets stay as planned. */
  saveEdit: (trip: Trip, vehicle: string) => Promise<ActionOutcome>;
  /** Send a planned trip out; `reason` sends it under its minimum load. */
  dispatch: (name: string, reason?: string) => Promise<ActionOutcome>;
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

/** The trip's server numbers (trip_numbers), null when the feed carries none. */
function tripNumbers(raw: RawTrip): RawTripNumbers | null {
  const n = raw.numbers;
  return n && Object.keys(n).length ? n : null;
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

export const DEFAULT_HUB = 'Kapkolia';

/** The dashboard's stage colours (bucket_logistics.html OV_FLAGS / the farm app). */
export const STAGE_COLOR = {
  awaiting: '#d97706',
  trolley: '#7c3aed',
  loading: '#2563eb',
  transit: '#1d4ed8',
  arrived: '#0e7490',
} as const;

/**
 * Where a trip stands, from its buckets' flags as the farm app reads them: on a trolley
 * (staging), loading to the truck, in transit, arrived at the hub. A planned or
 * requested trip nothing has moved on yet keeps its planning state.
 */
export function tripState(raw: RawTrip, stops: TripStop[], hub: string = DEFAULT_HUB): TripState {
  const status = raw.status || 'Draft';
  const bs = raw.bucket_status;
  const n = tripNumbers(raw);
  const total = (n ? n.total : bs?.total) || 0;
  const transit = (n ? n.transit : bs?.in_transit) || 0;
  const shelved = (n ? n.shelved : bs?.shelved ?? raw.shelved_buckets) || 0;
  const loaded = (n ? n.loaded : bs?.loaded) || 0;
  const arrived = { label: `Arrived at ${hub || DEFAULT_HUB}`, color: STAGE_COLOR.arrived };
  const inTransit = { label: 'In transit', color: STAGE_COLOR.transit };
  if (total > 0 && shelved >= total) return arrived;
  if (status === 'Received') {
    const onTruck = (n ? n.on_truck : raw.loaded_buckets) || 0;
    if (!raw.dispatched_at && onTruck + transit === 0) return { label: 'Closed — never left', color: '#737373' };
    // Still on the truck or on the road: not arrived yet, whatever arrived_at says.
    if (loaded + transit > 0) return { label: 'Arriving', color: STAGE_COLOR.transit };
    if (shelved > 0 || raw.arrived_at) return arrived;
    return { label: 'Ended', color: '#737373' };
  }
  if (transit + shelved > 0 && (transit + shelved >= total || status === 'Dispatched')) return inTransit;
  if (status === 'Dispatched') return inTransit;
  if (loaded > 0 || transit > 0 || rawHasLoads(raw)) return { label: 'Loading to truck', color: STAGE_COLOR.loading };
  if (stops.some((st) => st.stage.loaded > 0)) return { label: 'On trolley (Staging)', color: STAGE_COLOR.trolley };
  if (status === 'Draft') return { label: 'Planned', color: '#737373' };
  if (status === 'Requested') return { label: 'Truck requested', color: '#B45309' };
  return { label: 'Awaiting transfer', color: STAGE_COLOR.awaiting };
}

function orderFarms(raw: RawTrip): OrderFarm[] {
  const seen = new Set<string>();
  const out: OrderFarm[] = [];
  for (const o of raw.orders) {
    const key = `${o.order_pick_list}|${o.farm || ''}`;
    if (!o.order_pick_list) continue;
    if (seen.has(key)) {
      const prev = out.find((p) => p.opl === o.order_pick_list && p.farm === (o.farm || ''));
      if (prev && o.riding) prev.riding = Math.max(prev.riding || 0, o.riding);
      continue;
    }
    seen.add(key);
    out.push({
      opl: o.order_pick_list,
      orderName: o.order_name || o.order_pick_list,
      farm: o.farm || '',
      ...(o.riding ? { riding: o.riding } : {}),
    });
  }
  return out;
}

/** "15 Oct, 08:24" from "YYYY-MM-DD HH:MM[:SS]" (server local time, shown as is). */
export function dateTimeLabel(ts: string): string {
  const [d, t] = (ts || '').trim().split(' ');
  const [y, m, day] = (d || '').split('-').map(Number);
  if (!y || !m || !day) return ts;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${MONTHS[m - 1]}${t ? `, ${t.slice(0, 5)}` : ''}`;
}

export function buildTrip(
  raw: RawTrip,
  scheduleOrders: RawScheduleOrder[],
  sequence: number,
  today: string,
  hub: string = DEFAULT_HUB,
): Trip {
  const status = raw.status || 'Draft';
  const active = ACTIVE_STATUSES.includes(status);
  const hasLoads = rawHasLoads(raw);
  const earlier = !!raw.trip_date && raw.trip_date < today;
  const n = tripNumbers(raw);
  const cap = (n?.capacity ?? raw.capacity_buckets) || 0;
  const matches = scheduleMatches(raw, scheduleOrders);
  const stops = buildStops(raw);
  const vehicle = raw.vehicle || 'Unassigned';
  const tripNo = raw.run || 0;
  const total = n?.buckets ?? Math.max(raw.total_buckets || 0, stops.reduce((sum, st) => sum + st.buckets, 0));
  const fillPct = cap > 0 ? Math.max(0, Math.min(100, Math.round(((n?.buckets ?? raw.total_buckets) / cap) * 100))) : 0;
  return {
    name: raw.name,
    sequence,
    vehicle,
    tripNo,
    title: `${vehicle} · Trip ${tripNo || 1}`,
    runChain: raw.run_chain || '',
    createdAt: (raw.scheduled_at || '').slice(0, 19),
    scheduledAt:
      status === 'Draft' || status === 'Requested' ? '' : (raw.released_at || raw.dispatched_at || '').slice(0, 19),
    loadPct: cap > 0 ? Math.round((total / cap) * 100) : 0,
    freeBuckets: cap - total,
    loadedBuckets: (n?.on_truck ?? raw.loaded_buckets) || 0,
    arrivedBuckets: (n?.shelved ?? raw.bucket_status?.shelved ?? raw.shelved_buckets) || 0,
    farmLoads: stops.map((st) => ({ farm: st.farm, buckets: st.buckets })),
    state: tripState(raw, stops, hub),
    orderFarms: orderFarms(raw),
    status: status as TripStatus,
    capacityBuckets: cap,
    totalBuckets: (n?.buckets ?? raw.total_buckets) || 0,
    totalStems: raw.total_stems || 0,
    fillPct,
    stops,
    pills: buildPills(stops),
    scheduleContext: buildScheduleContext(matches),
    dispatchedAt: raw.dispatched_at || '',
    receivedAt: raw.received_at || '',
    turnaround: turnaroundLabel(raw.dispatched_at || '', raw.received_at || ''),
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

  const hub = data.packhouse || DEFAULT_HUB;
  const trips = ranked.map(({ raw }, i) => buildTrip(raw, data.orders, i + 1, today, hub));
  numberTrips(trips);
  trips.sort(byTruck);

  const groups: Record<TripGroup, Trip[]> = { requests: [], started: [], on_the_road: [], back: [] };
  for (const trip of trips) groups[groupForStatus(trip.status)].push(trip);
  return groups;
}

/** A truck's trips one after another: by truck, then day, then trip number. */
export function byTruck(a: Trip, b: Trip): number {
  return (
    a.vehicle.localeCompare(b.vehicle) ||
    a.tripDate.localeCompare(b.tripDate) ||
    (a.tripNo || 99) - (b.tripNo || 99) ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.name.localeCompare(b.name)
  );
}

/** A trip without a route run is numbered by its place among the truck's trips that day. */
function numberTrips(trips: Trip[]): void {
  const byDay = new Map<string, Trip[]>();
  for (const t of trips) {
    const key = `${t.vehicle}|${t.tripDate}`;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(t);
  }
  for (const list of byDay.values()) {
    if (list.every((t) => t.tripNo)) continue;
    const used = new Set(list.map((t) => t.tripNo).filter(Boolean));
    let next = 1;
    for (const t of [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name))) {
      if (t.tripNo) continue;
      while (used.has(next)) next += 1;
      t.tripNo = next;
      used.add(next);
      t.title = `${t.vehicle} · Trip ${next}`;
    }
  }
}

/**
 * Pure: each order's open buckets at a farm (awaiting there or on a trolley) that no
 * trip in the feed carries yet. A trip covers the buckets it plans or has loaded of
 * that (order, farm). Exported for testing.
 */
export function buildNotScheduled(data: RawTransferScheduleData): NotScheduledOrder[] {
  const covered = new Map<string, number>();
  for (const t of data.trips) {
    if (t.stale) continue;
    for (const o of t.orders) {
      const key = `${o.order_pick_list}|${o.farm || ''}`;
      covered.set(key, (covered.get(key) || 0) + Math.max(o.buckets || 0, o.loaded_buckets || 0));
    }
  }
  const out: NotScheduledOrder[] = [];
  for (const o of data.orders) {
    for (const f of o.farms || []) {
      const left = (f.buckets || 0) - (covered.get(`${o.opl}|${f.farm}`) || 0);
      if (left > 0) out.push({ opl: o.opl, orderName: o.order_name || o.opl, farm: f.farm, buckets: left });
    }
  }
  return out.sort((a, b) => a.farm.localeCompare(b.farm) || a.orderName.localeCompare(b.orderName));
}

/** A bucket's current stage: not found wins, else the furthest stage it reached. */
export type BucketStage =
  | 'awaiting' | 'trolley' | 'on_truck' | 'transit' | 'arrived_hub' | 'shelved' | 'ready' | 'issued' | 'issued_offline' | 'not_found';

const STAGE_ORDER: Exclude<BucketStage, 'not_found'>[] = [
  'awaiting', 'trolley', 'on_truck', 'transit', 'arrived_hub', 'shelved', 'ready', 'issued', 'issued_offline',
];

export function bucketStage(b: RawBucketDetail): BucketStage | null {
  if (Number(b.not_found)) return 'not_found';
  let cur: BucketStage | null = null;
  for (const k of STAGE_ORDER) if (Number(b[k])) cur = k;
  return cur;
}

/** The dashboard's stage labels and colours (OV_FLAGS). */
export function stageInfo(stage: BucketStage | null, hub: string = DEFAULT_HUB): { label: string; color: string } {
  switch (stage) {
    case 'awaiting': return { label: 'Awaiting Transfer', color: '#d97706' };
    case 'trolley': return { label: 'Loaded in Trolley', color: '#7c3aed' };
    case 'on_truck': return { label: 'Loaded on Truck', color: '#2563eb' };
    case 'transit': return { label: 'In Transit', color: '#2563eb' };
    case 'arrived_hub': return { label: `Arrived at ${hub || DEFAULT_HUB}`, color: '#0e7490' };
    case 'shelved': return { label: 'Shelved', color: '#16a34a' };
    case 'ready': return { label: 'Ready for Packing', color: '#0891b2' };
    case 'issued': return { label: 'Issued', color: '#dc2626' };
    case 'issued_offline': return { label: 'Issued Offline', color: '#7c3aed' };
    case 'not_found': return { label: 'Not found', color: '#c4302b' };
    default: return { label: '—', color: '#a3a3a3' };
  }
}

/** One bucket on a trip's list. */
export type TripBucket = {
  key: string;
  bucket: string;
  variety: string;
  varietyColor: string;
  length: string;
  stems: number;
  orderName: string;
  /** Other orders on the trip this shared bucket also serves. */
  ridingOrders: string[];
  farm: string;
  stage: BucketStage | null;
};

export type VarietySection = { variety: string; color: string; buckets: TripBucket[] };

/**
 * Pure: a trip's buckets out of its (order, farm) details. A bucket loaded on a trip
 * belongs to that trip; one not loaded yet belongs to a trip still collecting. If the
 * trip has no bucket of its own on record (older trips), every bucket of its pairs shows.
 */
export function tripBuckets(
  details: { pair: OrderFarm; buckets: RawBucketDetail[] }[],
  trip: { name: string; status: TripStatus } | null,
): TripBucket[] {
  const all = details.flatMap(({ pair, buckets }) =>
    buckets.map((b, i) => ({ pair, b, key: `${pair.opl}|${pair.farm}|${(b.bucket || '').toUpperCase()}|${b.variety}|${b.length}|${i}` })),
  );
  const collecting = !trip || ACTIVE_STATUSES.includes(trip.status);
  let mine = trip
    ? all.filter(({ b }) => b.trip === trip.name || (!b.trip && collecting && !Number(b.transit) && !Number(b.shelved)))
    : all.filter(({ b }) => !b.trip && !Number(b.transit) && !Number(b.shelved) && !Number(b.not_found));
  if (trip && !all.some(({ b }) => b.trip === trip.name) && !collecting) mine = all;
  // A bucket several orders share is listed once, on its lead order (the one not riding).
  const byId = new Map<string, (typeof mine)[number][]>();
  const order: string[] = [];
  mine.forEach((m, i) => {
    const id = (m.b.bucket || '').toUpperCase() || `#${i}`;
    if (!byId.has(id)) { byId.set(id, []); order.push(id); }
    byId.get(id)!.push(m);
  });
  return order.map((id) => {
    const hits = byId.get(id)!;
    const lead = hits.find((m) => !m.pair.riding) ?? hits[0];
    const { pair, b, key } = lead;
    const ridingOrders = [...new Set(hits.filter((m) => m !== lead).map((m) => m.pair.orderName))]
      .filter((o) => o !== pair.orderName);
    return {
      key,
      bucket: (b.bucket || '').toUpperCase() || '—',
      variety: b.variety || '',
      varietyColor: b.variety_color || '',
      length: b.length || '',
      stems: Math.round(Number(b.stems) || 0),
      orderName: pair.orderName,
      ridingOrders,
      farm: b.farm || pair.farm,
      stage: bucketStage(b),
    };
  });
}

/** Per variety (alphabetical), each variety's buckets by stem length then order. */
export function varietySections(buckets: TripBucket[]): VarietySection[] {
  const map = new Map<string, TripBucket[]>();
  for (const b of buckets) {
    if (!map.has(b.variety)) map.set(b.variety, []);
    map.get(b.variety)!.push(b);
  }
  const stem = (b: TripBucket) => parseFloat(b.length) || 0;
  return [...map.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((variety) => {
      const list = map.get(variety)!.sort(
        (a, b) => stem(a) - stem(b) || a.orderName.localeCompare(b.orderName) || a.bucket.localeCompare(b.bucket),
      );
      return { variety, color: list.find((b) => b.varietyColor)?.varietyColor || '', buckets: list };
    });
}

/** Fetch the buckets of these (order, farm) pairs and keep the trip's own. */
export async function fetchTripBuckets(
  pairs: OrderFarm[],
  trip: { name: string; status: TripStatus } | null,
): Promise<TripBucket[]> {
  const details = await Promise.all(
    pairs.map(async (pair) => ({ pair, buckets: (await karenBucketLogisticsApi.detail(pair.opl, pair.farm)).buckets ?? [] })),
  );
  return tripBuckets(details, trip);
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
  // Routes dated for the day; undated ones are today's.
  const routes = (data.routes || []).filter((r) => (r.route_date ? r.route_date === day : day === today));
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
      // The server's runs of this route, each with the trip driving it.
      const vRuns = raw
        ? ((data.vehicles || []).find((v) => v.name === vehicle)?.runs || []).filter((r) => r.route === raw.name)
        : [];
      const runTrips = runs.map((_run, i) => {
        const r = vRuns.find((x) => x.run === i + 1);
        return r?.trip ? { name: r.trip, status: (r.trip_status || 'Draft') as TripStatus } : null;
      });
      return {
        vehicle,
        hub,
        runs,
        totalKm: raw ? raw.total_km : 0,
        hasRoute: !!raw,
        trip: trip ? { name: trip.name, status: (trip.status || 'Draft') as TripStatus } : null,
        runTrips,
        runsKnown: vRuns.length > 0,
      };
    });
}

type ActionResult = RawTripActionMessage;

function unwrapAction(raw: RawTripActionResponse | undefined): ActionResult {
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

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** A trip action's reply as an outcome: `below_minimum` carries the truck's numbers so
 *  the screen can ask for a reason and resend; every other refusal is the server's message. */
export function tripActionOutcome(
  result: RawTripActionMessage,
  successMessage: string,
  failMessage = 'Action failed.',
): ActionOutcome {
  if (result.status === 'success') return { kind: 'success', message: (result.already && result.message) || successMessage };
  if (result.reason === 'below_minimum') {
    const message = result.message || 'The truck is below its minimum load.';
    return {
      kind: 'below_minimum',
      message,
      belowMinimum: {
        loaded: num(result.loaded),
        capacity: num(result.capacity),
        needed: num(result.needed),
        pct: num(result.pct),
        message,
      },
    };
  }
  return { kind: 'error', message: result.message || failMessage };
}

/** The numbers line of the minimum-load dialog; the server's message when the numbers are missing. */
export function minimumLoadLine(info: BelowMinimum): string {
  return info.capacity > 0 && info.needed > 0
    ? `${info.loaded} of ${info.capacity} on the truck — it leaves at ${info.needed}`
    : info.message;
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
      return tripActionOutcome(result, successMessage);
    }
    if (result.already) {
      // The trip was already past this step: put it where the server says it is.
      const status = (result.trip_status || newStatus) as TripStatus;
      const g = get().groups;
      const cur = (Object.keys(g) as TripGroup[]).find((k) => g[k].some((t) => t.name === name));
      const t = cur ? g[cur].find((x) => x.name === name) : undefined;
      if (cur && t) {
        const rest = { ...g, [cur]: g[cur].filter((x) => x.name !== name) };
        const dest = groupForStatus(status);
        set({ groups: { ...rest, [dest]: [...rest[dest], { ...t, status }] } });
      }
    }
    set({ actioning: { ...get().actioning, [name]: false } });
    // The optimistic move above doesn't know the server-set dispatched_at/received_at
    // timestamp yet (needed for turnaround time) — refresh in the background to pick
    // it up. Not awaited: the success outcome shouldn't wait on this round-trip.
    get().load();
    return tripActionOutcome(result, successMessage);
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
        notScheduled: day === today ? buildNotScheduled(raw) : [],
        hub: raw.packhouse || DEFAULT_HUB,
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
  notScheduled: [],
  hub: DEFAULT_HUB,
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
    set({ date: next, loaded: false, refreshing: false, error: null, actioning: {}, groups: EMPTY_GROUPS, routes: [], vehicles: [], notScheduled: [] });
    return get().load();
  },

  dispatch: (name, reason) =>
    moveTrip(get, set, name, 'on_the_road', 'Dispatched', (n) => karenBucketLogisticsApi.dispatch(n, reason), 'Truck dispatched.'),

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
      groups: EMPTY_GROUPS, routes: [], vehicles: [], notScheduled: [], hub: DEFAULT_HUB, today: todayISO(), date: null,
    });
  },
  };
});
