import { buildRoutes, groupTrips, stageToPills, turnaroundLabel } from '@/src/tenants/karen/state/karen-bucket-logistics-store';
import type {
  RawScheduleOrder,
  RawTransferScheduleData,
  RawTrip,
  RawTripOrder,
} from '@/src/tenants/karen/api/karen-bucket-logistics-api';

function fixture(overrides: Partial<RawTransferScheduleData> = {}): RawTransferScheduleData {
  return {
    orders: [],
    trips: [],
    routes: [],
    packhouse: 'Kapkolia',
    window: { from: '2026-08-22', to: '2026-08-22' },
    generated_at: '2026-08-22 06:00:00',
    ...overrides,
  };
}

function rawTrip(overrides: Partial<RawTrip> & Pick<RawTrip, 'name' | 'vehicle' | 'status'>): RawTrip {
  return {
    trip_date: '2026-08-22',
    notes: '',
    collection_order: '',
    farm: '',
    total_buckets: 0,
    total_stems: 0,
    capacity_buckets: 100,
    orders: [],
    dispatched_at: '',
    received_at: '',
    ...overrides,
  };
}

function orderRow(overrides: Partial<RawTripOrder> & Pick<RawTripOrder, 'order_pick_list' | 'farm' | 'buckets'>): RawTripOrder {
  return {
    order_name: overrides.order_pick_list,
    customer: '',
    varieties: '',
    stems: 0,
    full_farm_buckets: overrides.buckets,
    is_partial: 0,
    awaiting: 0,
    loaded: 0,
    in_transit: 0,
    shelved: 0,
    ...overrides,
  };
}

function scheduleOrder(overrides: Partial<RawScheduleOrder> & Pick<RawScheduleOrder, 'opl' | 'schedule'>): RawScheduleOrder {
  return {
    order_name: overrides.opl,
    customer: '',
    so: '',
    delivery_date: '2026-08-23',
    truck: '',
    mixed: 0,
    team: '',
    total_buckets: 0,
    total_stems: 0,
    farms: [],
    ...overrides,
  };
}

describe('groupTrips', () => {
  it('buckets trips into planned/on_the_road/back by status', () => {
    const data = fixture({
      trips: [
        rawTrip({ name: 'TRIP-1', vehicle: 'KAA 001A', status: 'Draft' }),
        rawTrip({ name: 'TRIP-2', vehicle: 'KAA 002B', status: 'Scheduled' }),
        rawTrip({ name: 'TRIP-3', vehicle: 'KAA 003C', status: 'Dispatched' }),
        rawTrip({ name: 'TRIP-4', vehicle: 'KAA 004D', status: 'Received' }),
      ],
    });
    const groups = groupTrips(data);
    expect(groups.planned.map((t) => t.name)).toEqual(['TRIP-1', 'TRIP-2']);
    expect(groups.on_the_road.map((t) => t.name)).toEqual(['TRIP-3']);
    expect(groups.back.map((t) => t.name)).toEqual(['TRIP-4']);
  });

  it('computes fillPct clamped to 100, and 0 with no capacity', () => {
    const data = fixture({
      trips: [
        rawTrip({ name: 'TRIP-OVER', vehicle: 'V1', status: 'Draft', total_buckets: 120, capacity_buckets: 100 }),
        rawTrip({ name: 'TRIP-NOCAP', vehicle: 'V2', status: 'Draft', total_buckets: 10, capacity_buckets: 0 }),
      ],
    });
    const groups = groupTrips(data);
    expect(groups.planned.find((t) => t.name === 'TRIP-OVER')!.fillPct).toBe(100);
    expect(groups.planned.find((t) => t.name === 'TRIP-NOCAP')!.fillPct).toBe(0);
  });

  it('groups a multi-farm trip into stops in collection_order sequence, extra farms appended', () => {
    const data = fixture({
      trips: [
        rawTrip({
          name: 'TRIP-MULTI', vehicle: 'V1', status: 'Draft',
          collection_order: 'Kaptumbo, Simotwo', total_buckets: 30,
          orders: [
            orderRow({ order_pick_list: 'OPL-1', order_name: 'ORD-1', customer: 'Acme', farm: 'Simotwo', varieties: 'Freedom', buckets: 10 }),
            orderRow({ order_pick_list: 'OPL-2', order_name: 'ORD-2', customer: 'Acme', farm: 'Kaptumbo', varieties: 'Avalanche', buckets: 15 }),
            orderRow({ order_pick_list: 'OPL-3', order_name: 'ORD-3', customer: 'Beta', farm: 'Torongo', varieties: 'Explorer', buckets: 5 }),
          ],
        }),
      ],
    });
    const trip = groupTrips(data).planned[0];
    expect(trip.stops.map((s) => s.farm)).toEqual(['Kaptumbo', 'Simotwo', 'Torongo']);
    expect(trip.stops[0].buckets).toBe(15);
    expect(trip.stops[0].orders).toEqual([{ orderName: 'ORD-2', customer: 'Acme', varieties: 'Avalanche', buckets: 15 }]);
  });

  it('sums bucket-stage counts per stop and trip-wide, dropping zero counts from pills', () => {
    const data = fixture({
      trips: [
        rawTrip({
          name: 'TRIP-1', vehicle: 'V1', status: 'Dispatched', total_buckets: 15,
          orders: [
            orderRow({ order_pick_list: 'OPL-1', farm: 'Simotwo', buckets: 10, loaded: 3, in_transit: 7 }),
            orderRow({ order_pick_list: 'OPL-2', farm: 'Kaptumbo', buckets: 5, awaiting: 5 }),
          ],
        }),
      ],
    });
    const trip = groupTrips(data).on_the_road[0];
    const simotwo = trip.stops.find((s) => s.farm === 'Simotwo')!;
    expect(simotwo.stage).toEqual({ awaiting: 0, loaded: 3, inTransit: 7, shelved: 0 });
    expect(trip.pills).toEqual([
      { key: 'awaiting', label: 'Awaiting', count: 5 },
      { key: 'loaded', label: 'Loading', count: 3 },
      { key: 'in_transit', label: 'In transit', count: 7 },
    ]);
  });

  it('dedupes stage counts by (order_pick_list, farm) when the same pair appears on multiple rows', () => {
    // Real data: multi-round "Distribute across teams" planning adds a new row per
    // round instead of merging into the existing one for the same (opl, farm). The
    // backend reports the SAME stage totals on every duplicate row — summing them
    // naively would multiply the true count by the number of duplicate rows.
    const data = fixture({
      trips: [
        rawTrip({
          name: 'TRIP-1', vehicle: 'V1', status: 'Draft', total_buckets: 8,
          orders: [
            orderRow({ order_pick_list: 'OPL-1', farm: 'Simotwo', buckets: 5, shelved: 4 }),
            orderRow({ order_pick_list: 'OPL-1', farm: 'Simotwo', buckets: 3, shelved: 4 }),
          ],
        }),
      ],
    });
    const trip = groupTrips(data).planned[0];
    expect(trip.stops[0].buckets).toBe(8); // planned buckets ARE additive across rounds
    expect(trip.stops[0].stage).toEqual({ awaiting: 0, loaded: 0, inTransit: 0, shelved: 4 }); // stage is not
  });

  it('returns no pills when nothing has moved yet', () => {
    const data = fixture({
      trips: [rawTrip({ name: 'TRIP-1', vehicle: 'KAA 999Z', status: 'Draft', orders: [orderRow({ order_pick_list: 'OPL-1', farm: 'Simotwo', buckets: 5 })] })],
    });
    expect(groupTrips(data).planned[0].pills).toEqual([]);
  });

  it('builds scheduleContext from the matching schedule order with the lowest sequence number', () => {
    const data = fixture({
      orders: [
        scheduleOrder({ opl: 'OPL-1', schedule: 5, team: 'Team B' }),
        scheduleOrder({ opl: 'OPL-2', schedule: 2, team: 'Team A' }),
      ],
      trips: [
        rawTrip({
          name: 'TRIP-1', vehicle: 'V1', status: 'Draft', total_buckets: 25,
          orders: [
            orderRow({ order_pick_list: 'OPL-1', farm: 'Simotwo', buckets: 10 }),
            orderRow({ order_pick_list: 'OPL-2', farm: 'Kaptumbo', buckets: 15 }),
          ],
        }),
      ],
    });
    expect(groupTrips(data).planned[0].scheduleContext).toBe('Team A · #2 in queue');
  });

  it('returns an empty scheduleContext when no order on the trip matches the schedule feed', () => {
    const data = fixture({
      trips: [
        rawTrip({
          name: 'TRIP-1', vehicle: 'V1', status: 'Draft', total_buckets: 5,
          orders: [orderRow({ order_pick_list: 'OPL-UNKNOWN', farm: 'Simotwo', buckets: 5 })],
        }),
      ],
    });
    expect(groupTrips(data).planned[0].scheduleContext).toBe('');
  });

  it('numbers trips globally by ascending schedule priority, regardless of status, ties broken by name', () => {
    const data = fixture({
      orders: [
        scheduleOrder({ opl: 'OPL-LOW', schedule: 1 }),
        scheduleOrder({ opl: 'OPL-MID', schedule: 4 }),
      ],
      trips: [
        // Dispatched but lower priority than the Draft trip below.
        rawTrip({ name: 'TRIP-B', vehicle: 'V2', status: 'Dispatched', orders: [orderRow({ order_pick_list: 'OPL-MID', farm: 'Simotwo', buckets: 1 })] }),
        rawTrip({ name: 'TRIP-A', vehicle: 'V1', status: 'Draft', orders: [orderRow({ order_pick_list: 'OPL-LOW', farm: 'Simotwo', buckets: 1 })] }),
        // No matching schedule order at all -> pushed to the end.
        rawTrip({ name: 'TRIP-C', vehicle: 'V3', status: 'Draft', orders: [orderRow({ order_pick_list: 'OPL-UNKNOWN', farm: 'Simotwo', buckets: 1 })] }),
      ],
    });
    const all = [...groupTrips(data).planned, ...groupTrips(data).on_the_road];
    const byName = new Map(all.map((t) => [t.name, t.sequence]));
    expect(byName.get('TRIP-A')).toBe(1);
    expect(byName.get('TRIP-B')).toBe(2);
    expect(byName.get('TRIP-C')).toBe(3);
  });

  it('carries dispatchedAt/receivedAt through and computes turnaround once both are set', () => {
    const data = fixture({
      trips: [
        rawTrip({
          name: 'TRIP-1', vehicle: 'V1', status: 'Received',
          dispatched_at: '2026-08-22 08:00:00', received_at: '2026-08-22 09:45:00',
        }),
      ],
    });
    const trip = groupTrips(data).back[0];
    expect(trip.dispatchedAt).toBe('2026-08-22 08:00:00');
    expect(trip.receivedAt).toBe('2026-08-22 09:45:00');
    expect(trip.turnaround).toBe('1h 45m');
  });
});

describe('stageToPills', () => {
  it('drops zero counts and preserves stage order', () => {
    expect(stageToPills({ awaiting: 0, loaded: 2, inTransit: 0, shelved: 3 })).toEqual([
      { key: 'loaded', label: 'Loading', count: 2 },
      { key: 'shelved', label: 'Arrived', count: 3 },
    ]);
  });
});

describe('turnaroundLabel', () => {
  it('formats under an hour as minutes only', () => {
    expect(turnaroundLabel('2026-08-22 08:00:00', '2026-08-22 08:20:00')).toBe('20m');
  });

  it('formats an hour or more as "Xh Ym"', () => {
    expect(turnaroundLabel('2026-08-22 08:00:00', '2026-08-22 10:05:00')).toBe('2h 5m');
  });

  it('returns empty when either timestamp is missing', () => {
    expect(turnaroundLabel('', '2026-08-22 10:05:00')).toBe('');
    expect(turnaroundLabel('2026-08-22 08:00:00', '')).toBe('');
    expect(turnaroundLabel('', '')).toBe('');
  });
});

describe('buildRoutes', () => {
  it('builds the drive chain from ordered legs, packhouse at both ends', () => {
    const data = fixture({
      routes: [
        {
          name: 'ROUTE-1', vehicle: 'KAA 001A', total_km: 12.5,
          legs: [
            { leg: 'Kapkolia-Simotwo', from_farm: 'Kapkolia', to_farm: 'Simotwo', distance_km: 5 },
            { leg: 'Simotwo-Kaptumbo', from_farm: 'Simotwo', to_farm: 'Kaptumbo', distance_km: 3 },
            { leg: 'Kaptumbo-Kapkolia', from_farm: 'Kaptumbo', to_farm: 'Kapkolia', distance_km: 4.5 },
          ],
          farms: ['Simotwo', 'Kaptumbo'],
        },
      ],
    });
    const routes = buildRoutes(data);
    expect(routes).toHaveLength(1);
    expect(routes[0].stops).toEqual(['Kapkolia', 'Simotwo', 'Kaptumbo', 'Kapkolia']);
    expect(routes[0].totalKm).toBe(12.5);
    expect(routes[0].hasRoute).toBe(true);
    expect(routes[0].trip).toBeNull();
  });

  it('flags a vehicle with a trip today but no route set, instead of hiding it', () => {
    const data = fixture({
      trips: [rawTrip({ name: 'TRIP-1', vehicle: 'KAA 999Z', status: 'Draft' })],
    });
    const routes = buildRoutes(data);
    expect(routes).toEqual([
      { vehicle: 'KAA 999Z', stops: [], totalKm: 0, hasRoute: false, trip: { name: 'TRIP-1', status: 'Draft' } },
    ]);
  });

  it('cross-references a route with its trip status when both exist for the same vehicle', () => {
    const data = fixture({
      routes: [{ name: 'ROUTE-1', vehicle: 'KAA 001A', total_km: 5, legs: [], farms: [] }],
      trips: [rawTrip({ name: 'TRIP-1', vehicle: 'KAA 001A', status: 'Dispatched' })],
    });
    expect(buildRoutes(data)[0].trip).toEqual({ name: 'TRIP-1', status: 'Dispatched' });
  });
});
