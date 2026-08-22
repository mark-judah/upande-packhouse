import { api } from '@/src/core/api/client';

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
  buckets: number;
  stems: number;
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
  /** '' until dispatchBucketTrip is called. */
  dispatched_at: string;
  /** '' until receiveBucketTrip is called. */
  received_at: string;
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
export type RawTransferScheduleData = {
  orders: RawScheduleOrder[];
  trips: RawTrip[];
  routes: RawRoute[];
  packhouse: string;
  window: { from: string; to: string };
  generated_at: string;
};

export type RawTripActionResponse = {
  message?: { status?: string; message?: string; name?: string; trip_status?: string } | string;
};

export const karenBucketLogisticsApi = {
  /** Today's transfer schedule: orders-by-farm, today's trips with live bucket-stage counts. */
  fetch(): Promise<RawTransferScheduleData> {
    return api<RawTransferScheduleData>({
      method: 'GET',
      url: '/api/method/getTransferScheduleData',
    });
  },

  /** Mark a planned trip as sent out. */
  dispatch(name: string): Promise<RawTripActionResponse> {
    return api<RawTripActionResponse>({
      method: 'POST',
      url: '/api/method/dispatchBucketTrip',
      data: { name },
    });
  },

  /** Mark a dispatched trip as back / received. */
  receive(name: string): Promise<RawTripActionResponse> {
    return api<RawTripActionResponse>({
      method: 'POST',
      url: '/api/method/receiveBucketTrip',
      data: { name },
    });
  },
};
