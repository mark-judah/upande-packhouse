import { api } from '@/src/core/api/client';
import { shiftISO, todayISO } from '@/src/core/date';

// =====================================================================
// Bucket logistics coordinator: today's transfer schedule (orders by
// farm/variety with packhouse-schedule priority, today's Bucket Request
// Trips with live per-farm bucket-stage counts) + trip dispatch/receive.
// Server methods: getTransferScheduleData, dispatchBucketTrip,
// receiveBucketTrip. Same backend as the desktop transfer-control page —
// see docs/superpowers/specs/2026-08-22-bucket-logistics-coordinator-design.md.
// =====================================================================

export type RawScheduleOrderVariety = {
  variety: string;
  buckets: number;
  stems: number;
};

export type RawScheduleOrderFarm = {
  farm: string;
  /** Open buckets: awaiting at the farm or on a trolley, not on the road yet. */
  buckets: number;
  stems: number;
  /** In transit to the packhouse. */
  on_road?: number;
  varieties: RawScheduleOrderVariety[];
};

/** One Order Pick List's transfer-plannable buckets, broken down by farm. */
export type RawScheduleOrder = {
  opl: string;
  order_name: string;
  customer: string;
  so: string;
  delivery_date: string;
  truck: string;
  mixed: number;
  /** Packhouse-schedule sequence number — lower = packed sooner. */
  schedule: number;
  team: string;
  total_buckets: number;
  total_stems: number;
  farms: RawScheduleOrderFarm[];
};

/**
 * One (order, farm) row on a Bucket Request Trip. `awaiting`/`loaded`/`in_transit`/
 * `shelved` are live, computed server-side from Pick List Item flags for this exact
 * (order_pick_list, farm) pair — NOT specific to this row. If the same
 * (order_pick_list, farm) pair appears on more than one row within a trip (it does,
 * in real data — see the store's buildStops), these four counts will be identical
 * across those duplicate rows: dedupe by (order_pick_list, farm) before summing, or
 * a multi-round-planned trip's stage totals will be inflated by however many
 * duplicate rows share that pair.
 */
export type RawTripOrder = {
  order_pick_list: string;
  order_name: string;
  customer: string;
  farm: string;
  varieties: string;
  buckets: number;
  stems: number;
  full_farm_buckets: number;
  is_partial: number;
  awaiting: number;
  loaded: number;
  in_transit: number;
  shelved: number;
  /** Of this row's buckets, already on its truck. */
  loaded_buckets?: number;
  /** Its buckets travelling under another order on the trip (shared buckets). */
  riding?: number;
};

/** This trip's own buckets by stage (server `_trip_bucket_status`): loaded = on its
 *  truck, not in transit yet; awaiting = planned, not loaded yet. */
export type RawTripBucketStatus = {
  awaiting: number;
  loaded: number;
  in_transit: number;
  shelved: number;
  total: number;
};

/** A trip's bucket numbers as every surface shows them (server trip_numbers). */
export type RawTripNumbers = {
  capacity?: number;
  planned?: number;
  /** Per order its counted buckets, else its plan: the trip's bucket count. */
  buckets?: number;
  load?: number;
  free?: number;
  total?: number;
  awaiting?: number;
  trolley?: number;
  /** On the truck at the farm, not on the road yet. */
  loaded?: number;
  transit?: number;
  /** Arrived at the packhouse. */
  shelved?: number;
  /** loaded + transit + shelved. */
  on_truck?: number;
  riding?: number;
};

export type RawTrip = {
  name: string;
  vehicle: string;
  trip_date: string;
  status: string;
  notes: string;
  collection_order: string;
  farm: string;
  total_buckets: number;
  total_stems: number;
  capacity_buckets: number;
  orders: RawTripOrder[];
  /** Buckets already on its truck (> 0 once a farm loaded it). */
  loaded_buckets?: number;
  /** 1 while buckets are on the truck before it has been dispatched. */
  loading?: number;
  /** 1 for a planned trip from an earlier day that never left. */
  stale?: number;
  /** Who asked (on the dashboard) for the truck to go to the farm, and when. */
  requested_by?: string;
  requested_at?: string | null;
  /** Which run of the truck's route this trip drives (0 = none), of how many. */
  run?: number;
  runs?: number;
  /** e.g. "Kapkolia → Chepsito → Kapkolia". */
  run_chain?: string;
  /** When the trip was planned (its creation). */
  scheduled_at?: string | null;
  /** When the requested truck was released to the farm. */
  released_at?: string | null;
  bucket_status?: RawTripBucketStatus;
  numbers?: RawTripNumbers;
  /** Set once the truck reached the packhouse. */
  arrived_at?: string | null;
  /** Buckets of this trip shelved at the packhouse. */
  shelved_buckets?: number;
  /** null / '' until dispatchBucketTrip is called. */
  dispatched_at: string | null;
  /** null / '' until receiveBucketTrip is called. */
  received_at: string | null;
};

export type RawRouteLeg = {
  leg: string;
  from_farm: string;
  to_farm: string;
  distance_km: number;
};

/** One vehicle's planned physical route for today (Bucket Logistics Route). */
export type RawRoute = {
  name: string;
  route_date?: string;
  vehicle: string;
  total_km: number;
  legs: RawRouteLeg[];
  farms: string[];
};

// The real getTransferScheduleData response also includes `vehicles`,
// `distances`, and `truck_status` — omitted here because this screen
// doesn't consume them. `truck_status` in particular is a vehicle-wide
// aggregate (can't tell trips on the same vehicle apart, never counted
// shelved buckets) — superseded for this screen by the bucket-accurate
// per-(order, farm) counts now on RawTripOrder above.
/** A transfer truck: what it holds and whether it is out on a trip right now. */
export type RawVehicle = {
  name: string;
  capacity_buckets: number;
  /** The trip it is out on, '' / null when at the hub. */
  on_road?: string | null;
  /** Its route's runs that day, each with the trip driving it (null if none). */
  runs?: RawVehicleRun[];
};

export type RawVehicleRun = {
  route: string;
  run: number;
  runs: number;
  stops: string[];
  trip: string | null;
  trip_status: string | null;
};

export type RawTransferScheduleData = {
  orders: RawScheduleOrder[];
  trips: RawTrip[];
  routes: RawRoute[];
  vehicles?: RawVehicle[];
  packhouse: string;
  window: { from: string; to: string };
  generated_at: string;
};

/** One bucket of an order at a farm (getBucketLogisticsDetail): each stage flag is 1
 *  once the bucket has passed it. */
export type RawBucketDetail = {
  bucket: string;
  variety: string;
  /** e.g. "43cm". */
  length: string;
  farm: string;
  stems: number;
  /** The trip that carried it, null until it is loaded on one. */
  trip: string | null;
  run?: number | null;
  awaiting: number;
  trolley: number;
  on_truck: number;
  transit: number;
  arrived_hub: number;
  shelved: number;
  ready: number;
  issued: number;
  issued_offline: number;
  not_found: number;
  /** The variety's Variety Tree colour hex, '' if none. */
  variety_color?: string;
};

export type RawTripActionResponse = {
  message?:
    | {
        status?: string;
        message?: string;
        name?: string;
        /** 1 when the trip was already past this step (e.g. "Already received."). */
        already?: number;
        trip_status?: string;
      }
    | string;
};

export const karenBucketLogisticsApi = {
  /** Today's transfer schedule: orders-by-farm, today's trips with live bucket-stage counts.
   *  `tripDate` (YYYY-MM-DD) also returns every trip of that day, and asks for its routes. */
  fetch(tripDate?: string): Promise<RawTransferScheduleData> {
    const today = todayISO();
    return api<RawTransferScheduleData>({
      method: 'GET',
      url: '/api/method/upande_packhouse.mobile.api.getTransferScheduleData',
      // Orders delivering today or tomorrow: the ones still to be collected.
      params: { from_date: today, to_date: shiftISO(today, 1), ...(tripDate ? { trip_date: tripDate, route_date: tripDate } : {}) },
    });
  },

  /** One order's buckets at one farm, with their stage flags. */
  detail(opl: string, farm: string): Promise<{ buckets?: RawBucketDetail[] }> {
    return api<{ buckets?: RawBucketDetail[] }>({
      method: 'GET',
      url: '/api/method/upande_packhouse.api.remote_transfer.bucket_logistics.getBucketLogisticsDetail',
      params: { opl, farm },
    });
  },

  /** Mark a planned trip as sent out. */
  dispatch(name: string): Promise<RawTripActionResponse> {
    return api<RawTripActionResponse>({
      method: 'POST',
      url: '/api/method/upande_packhouse.mobile.api.dispatchBucketTrip',
      data: { name },
    });
  },

  /** Put a planned trip on another truck (before anything is loaded). */
  changeVehicle(name: string, vehicle: string): Promise<RawTripActionResponse> {
    return api<RawTripActionResponse>({
      method: 'POST',
      url: '/api/method/upande_packhouse.api.transfer_control.changeTripVehicle',
      data: { name, vehicle },
    });
  },

  /** Confirm the requested truck has left the hub for the trip's farms. */
  release(name: string): Promise<RawTripActionResponse> {
    return api<RawTripActionResponse>({
      method: 'POST',
      url: '/api/method/upande_packhouse.api.transfer_control.releaseBucketTrip',
      data: { name },
    });
  },

  /** Turn down a truck request: the trip goes back to the scheduler with the reason. */
  reject(name: string, reason: string): Promise<RawTripActionResponse> {
    return api<RawTripActionResponse>({
      method: 'POST',
      url: '/api/method/upande_packhouse.api.transfer_control.rejectBucketTrip',
      data: { name, reason },
    });
  },

  /** Mark a dispatched trip as back / received. */
  receive(name: string): Promise<RawTripActionResponse> {
    return api<RawTripActionResponse>({
      method: 'POST',
      url: '/api/method/upande_packhouse.mobile.api.receiveBucketTrip',
      data: { name },
    });
  },
};
