import {
  buildRoutes,
  buildTrip,
  groupTrips,
  stageToPills,
  turnaroundLabel,
  useKarenBucketLogisticsStore,
} from '@/src/tenants/karen/state/karen-bucket-logistics-store';
import { karenBucketLogisticsApi } from '@/src/tenants/karen/api/karen-bucket-logistics-api';
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
  it('buckets trips into requests/started/on_the_road/back by status', () => {
    const data = fixture({
      trips: [
        rawTrip({ name: 'TRIP-1', vehicle: 'KAA 001A', status: 'Draft' }),
        rawTrip({ name: 'TRIP-2', vehicle: 'KAA 002B', status: 'Scheduled' }),
        rawTrip({ name: 'TRIP-5', vehicle: 'KAA 005E', status: 'Requested' }),
        rawTrip({ name: 'TRIP-3', vehicle: 'KAA 003C', status: 'Dispatched' }),
        rawTrip({ name: 'TRIP-4', vehicle: 'KAA 004D', status: 'Received' }),
      ],
    });
    const groups = groupTrips(data);
    expect(groups.requests.map((t) => t.name)).toEqual(['TRIP-1', 'TRIP-5']);
    expect(groups.started.map((t) => t.name)).toEqual(['TRIP-2']);
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
    expect(groups.requests.find((t) => t.name === 'TRIP-OVER')!.fillPct).toBe(100);
    expect(groups.requests.find((t) => t.name === 'TRIP-NOCAP')!.fillPct).toBe(0);
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
    const trip = groupTrips(data).requests[0];
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
    const trip = groupTrips(data).requests[0];
    expect(trip.stops[0].buckets).toBe(8); // planned buckets ARE additive across rounds
    expect(trip.stops[0].stage).toEqual({ awaiting: 0, loaded: 0, inTransit: 0, shelved: 4 }); // stage is not
  });

  it('returns no pills when nothing has moved yet', () => {
    const data = fixture({
      trips: [rawTrip({ name: 'TRIP-1', vehicle: 'KAA 999Z', status: 'Draft', orders: [orderRow({ order_pick_list: 'OPL-1', farm: 'Simotwo', buckets: 5 })] })],
    });
    expect(groupTrips(data).requests[0].pills).toEqual([]);
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
    expect(groupTrips(data).requests[0].scheduleContext).toBe('Team A · #2 in queue');
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
    expect(groupTrips(data).requests[0].scheduleContext).toBe('');
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
    const all = [...groupTrips(data).requests, ...groupTrips(data).on_the_road];
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
  it('builds each trip from ordered legs, packhouse at both ends', () => {
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
    expect(routes[0].hub).toBe('Kapkolia');
    expect(routes[0].runs).toEqual([['Simotwo', 'Kaptumbo']]);
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
      { vehicle: 'KAA 999Z', hub: '', runs: [], totalKm: 0, hasRoute: false, trip: { name: 'TRIP-1', status: 'Draft' } },
    ]);
  });

  it('splits a route into trips where it comes back to the packhouse, as the dashboard does', () => {
    const data = fixture({
      routes: [
        {
          name: 'ROUTE-2', vehicle: 'KAX 254U', total_km: 4.3,
          legs: [
            { leg: 'Kapkolia-Chepsito', from_farm: 'Kapkolia', to_farm: 'Chepsito', distance_km: 1 },
            { leg: 'Chepsito-Kapkolia', from_farm: 'Chepsito', to_farm: 'Kapkolia', distance_km: 1 },
            { leg: 'Kapkolia-Chepsito', from_farm: 'Kapkolia', to_farm: 'Chepsito', distance_km: 1 },
            { leg: 'Chepsito-Kapkolia', from_farm: 'Chepsito', to_farm: 'Kapkolia', distance_km: 1.3 },
          ],
          farms: ['Chepsito'],
        },
      ],
    });
    expect(buildRoutes(data)[0].runs).toEqual([['Chepsito'], ['Chepsito']]);
  });

  it('cross-references a route with its trip status when both exist for the same vehicle', () => {
    const data = fixture({
      routes: [{ name: 'ROUTE-1', vehicle: 'KAA 001A', total_km: 5, legs: [], farms: [] }],
      trips: [rawTrip({ name: 'TRIP-1', vehicle: 'KAA 001A', status: 'Dispatched' })],
    });
    expect(buildRoutes(data)[0].trip).toEqual({ name: 'TRIP-1', status: 'Dispatched' });
  });
});


describe('earlier-day trips', () => {
  const TODAY = '2026-08-22';
  const EARLIER = '2026-08-18';

  it('drops every earlier-day trip except one still on the road', () => {
    const groups = groupTrips(
      fixture({
        generated_at: `${TODAY} 06:00:00`,
        trips: [
          rawTrip({ name: 'OLD-DRAFT', vehicle: 'V1', status: 'Draft', trip_date: EARLIER }),
          rawTrip({ name: 'OLD-REQ', vehicle: 'V2', status: 'Requested', trip_date: EARLIER }),
          rawTrip({ name: 'OLD-SCHED', vehicle: 'V5', status: 'Scheduled', trip_date: EARLIER }),
          rawTrip({ name: 'OLD-LOADED', vehicle: 'V6', status: 'Requested', trip_date: EARLIER, loading: 1, loaded_buckets: 9 }),
          rawTrip({ name: 'OLD-ROAD', vehicle: 'V3', status: 'Dispatched', trip_date: EARLIER }),
          rawTrip({ name: 'NEW-DRAFT', vehicle: 'V4', status: 'Draft', trip_date: TODAY }),
        ],
      }),
    );
    expect(groups.requests.map((t) => t.name)).toEqual(['NEW-DRAFT']);
    expect(groups.started).toEqual([]);
    expect(groups.on_the_road.map((t) => t.name)).toEqual(['OLD-ROAD']);
    expect(groups.back).toEqual([]);
    expect(groups.requests[0].sequence + groups.on_the_road[0].sequence).toBe(3);
  });

  it("leaves earlier-day trips that never left out of today's routes", () => {
    const routes = buildRoutes(
      fixture({
        generated_at: `${TODAY} 06:00:00`,
        trips: [
          rawTrip({ name: 'OLD', vehicle: 'V1', status: 'Draft', trip_date: EARLIER }),
          rawTrip({ name: 'OLD-ROAD', vehicle: 'V2', status: 'Dispatched', trip_date: EARLIER }),
        ],
      }),
    );
    expect(routes.map((r) => r.vehicle)).toEqual(['V2']);
  });

  it('never offers release or dispatch on an earlier-day trip', () => {
    const trip = buildTrip(
      rawTrip({ name: 'T', vehicle: 'V', status: 'Requested', trip_date: EARLIER, loaded_buckets: 4 }),
      [],
      1,
      TODAY,
    );
    expect(trip.canRelease).toBe(false);
    expect(trip.canDispatch).toBe(false);
    expect(trip.editable).toBe(false);
  });

  it("offers release for today's request and dispatch for a loaded Draft or Requested trip", () => {
    const requested = buildTrip(rawTrip({ name: 'T', vehicle: 'V', status: 'Requested', trip_date: TODAY }), [], 1, TODAY);
    expect(requested.canRelease).toBe(true);
    expect(requested.canDispatch).toBe(false);

    const loadedDraft = buildTrip(rawTrip({ name: 'T', vehicle: 'V', status: 'Draft', trip_date: TODAY, loaded_buckets: 3 }), [], 1, TODAY);
    expect(loadedDraft.hasLoads).toBe(true);
    expect(loadedDraft.canDispatch).toBe(true);
    expect(loadedDraft.editable).toBe(false);

    const loadingRequested = buildTrip(rawTrip({ name: 'T', vehicle: 'V', status: 'Requested', trip_date: TODAY, loading: 1 }), [], 1, TODAY);
    expect(loadingRequested.canDispatch).toBe(true);

    const scheduled = buildTrip(rawTrip({ name: 'T', vehicle: 'V', status: 'Scheduled', trip_date: TODAY }), [], 1, TODAY);
    expect(scheduled.canDispatch).toBe(true);

    const onRoad = buildTrip(rawTrip({ name: 'T', vehicle: 'V', status: 'Dispatched', trip_date: TODAY, loaded_buckets: 3 }), [], 1, TODAY);
    expect(onRoad.canDispatch).toBe(false);
  });
});

describe('day filter', () => {
  const TODAY = '2026-08-22';
  const EARLIER = '2026-08-18';
  const feed = () =>
    fixture({
      generated_at: `${TODAY} 06:00:00`,
      routes: [{ name: 'R1', vehicle: 'V9', total_km: 10, legs: [], farms: [] }],
      trips: [
        rawTrip({ name: 'NEW-REQ', vehicle: 'V1', status: 'Requested', trip_date: TODAY }),
        rawTrip({ name: 'OLD-REQ', vehicle: 'V2', status: 'Requested', trip_date: EARLIER }),
        rawTrip({ name: 'OLD-SCHED', vehicle: 'V3', status: 'Scheduled', trip_date: EARLIER, loaded_buckets: 5 }),
        rawTrip({ name: 'OLD-ROAD', vehicle: 'V4', status: 'Dispatched', trip_date: EARLIER }),
        rawTrip({ name: 'OLD-BACK', vehicle: 'V5', status: 'Received', trip_date: EARLIER }),
        rawTrip({ name: 'MID-ROAD', vehicle: 'V6', status: 'Dispatched', trip_date: '2026-08-20' }),
      ],
    });

  it("defaults to the feed's day from generated_at", () => {
    const groups = groupTrips(feed());
    expect(groups.requests.map((t) => t.name)).toEqual(['NEW-REQ']);
    expect(groups.started).toEqual([]);
    // A truck still out from an earlier day shows on today.
    expect(groups.on_the_road.map((t) => t.name).sort()).toEqual(['MID-ROAD', 'OLD-ROAD']);
    expect(groups.back).toEqual([]);
  });

  it("shows only the selected earlier day's trips, view-only", () => {
    const groups = groupTrips(feed(), TODAY, EARLIER);
    expect(groups.requests.map((t) => t.name)).toEqual(['OLD-REQ']);
    expect(groups.started.map((t) => t.name)).toEqual(['OLD-SCHED']);
    expect(groups.on_the_road.map((t) => t.name)).toEqual(['OLD-ROAD']);
    expect(groups.back.map((t) => t.name)).toEqual(['OLD-BACK']);
    for (const t of [...groups.requests, ...groups.started]) {
      expect(t.canRelease).toBe(false);
      expect(t.canDispatch).toBe(false);
      expect(t.editable).toBe(false);
    }
  });

  it("limits routes to the selected day's trips; the feed's routes are today's only", () => {
    expect(buildRoutes(feed()).map((r) => r.vehicle)).toEqual(['V1', 'V4', 'V6', 'V9']);
    expect(buildRoutes(feed(), TODAY, EARLIER).map((r) => r.vehicle)).toEqual(['V2', 'V3', 'V4', 'V5']);
  });
});

describe('store actions', () => {
  const TODAY = '2026-08-22';
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    useKarenBucketLogisticsStore.getState().reset();
    fetchSpy = jest.spyOn(karenBucketLogisticsApi, 'fetch');
  });
  afterEach(() => jest.restoreAllMocks());

  it('dispatches a loaded Draft trip from the requests group', async () => {
    const data = fixture({
      generated_at: `${TODAY} 06:00:00`,
      trips: [rawTrip({ name: 'T1', vehicle: 'V1', status: 'Draft', trip_date: TODAY, loaded_buckets: 4 })],
    });
    fetchSpy.mockResolvedValue(data);
    await useKarenBucketLogisticsStore.getState().load();
    expect(useKarenBucketLogisticsStore.getState().groups.requests.map((t) => t.name)).toEqual(['T1']);

    let resolveDispatch: (v: unknown) => void = () => {};
    jest.spyOn(karenBucketLogisticsApi, 'dispatch').mockReturnValue(
      new Promise((r) => { resolveDispatch = r; }) as never,
    );
    const pending = useKarenBucketLogisticsStore.getState().dispatch('T1');
    const groups = useKarenBucketLogisticsStore.getState().groups;
    expect(groups.requests).toEqual([]);
    expect(groups.on_the_road.map((t) => [t.name, t.status])).toEqual([['T1', 'Dispatched']]);

    resolveDispatch({ message: { status: 'success' } });
    expect(await pending).toEqual({ kind: 'success', message: 'Truck dispatched.' });
  });

  it('refreshes in the background once data is on screen, and never overlaps loads', async () => {
    const data = fixture({ generated_at: `${TODAY} 06:00:00` });
    fetchSpy.mockResolvedValue(data);
    await useKarenBucketLogisticsStore.getState().load();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    let release: (v: unknown) => void = () => {};
    fetchSpy.mockReturnValueOnce(new Promise((r) => { release = r; }) as never);
    const a = useKarenBucketLogisticsStore.getState().load();
    expect(useKarenBucketLogisticsStore.getState().loading).toBe(false);
    expect(useKarenBucketLogisticsStore.getState().refreshing).toBe(true);
    const b = useKarenBucketLogisticsStore.getState().load();
    const c = useKarenBucketLogisticsStore.getState().load();
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    release(data);
    await Promise.all([a, b, c]);
    // The loads asked for mid-flight collapse into one more request.
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(useKarenBucketLogisticsStore.getState().refreshing).toBe(false);
  });

  it('keeps the data on screen when a background refresh fails', async () => {
    fetchSpy.mockResolvedValueOnce(
      fixture({ generated_at: `${TODAY} 06:00:00`, trips: [rawTrip({ name: 'T1', vehicle: 'V1', status: 'Draft', trip_date: TODAY })] }),
    );
    await useKarenBucketLogisticsStore.getState().load();
    fetchSpy.mockRejectedValueOnce(new Error('timeout'));
    await useKarenBucketLogisticsStore.getState().load();
    const st = useKarenBucketLogisticsStore.getState();
    expect(st.error).toBeNull();
    expect(st.groups.requests.map((t) => t.name)).toEqual(['T1']);
  });
});

describe('setDate', () => {
  const TODAY = '2026-08-22';
  const EARLIER = '2026-08-18';
  beforeEach(() => useKarenBucketLogisticsStore.getState().reset());
  afterEach(() => jest.restoreAllMocks());

  it('clears the previous day, then loads the chosen day with trip_date', async () => {
    const fetchSpy = jest.spyOn(karenBucketLogisticsApi, 'fetch');
    fetchSpy.mockResolvedValueOnce(
      fixture({ generated_at: `${TODAY} 06:00:00`, trips: [rawTrip({ name: 'NEW', vehicle: 'V1', status: 'Draft', trip_date: TODAY })] }),
    );
    await useKarenBucketLogisticsStore.getState().load();
    expect(fetchSpy).toHaveBeenLastCalledWith(undefined);
    expect(useKarenBucketLogisticsStore.getState().today).toBe(TODAY);

    let resolve: (v: unknown) => void = () => {};
    fetchSpy.mockReturnValueOnce(new Promise((r) => { resolve = r; }) as never);
    const pending = useKarenBucketLogisticsStore.getState().setDate(EARLIER);
    let st = useKarenBucketLogisticsStore.getState();
    expect(st.date).toBe(EARLIER);
    expect(st.loading).toBe(true);
    expect(st.groups.requests).toEqual([]);
    expect(fetchSpy).toHaveBeenLastCalledWith(EARLIER);

    resolve(fixture({ generated_at: `${TODAY} 07:00:00`, trips: [rawTrip({ name: 'OLD', vehicle: 'V2', status: 'Draft', trip_date: EARLIER })] }));
    await pending;
    st = useKarenBucketLogisticsStore.getState();
    expect(st.date).toBe(EARLIER);
    expect(st.groups.requests.map((t) => t.name)).toEqual(['OLD']);

    fetchSpy.mockResolvedValueOnce(fixture({ generated_at: `${TODAY} 08:00:00` }));
    await useKarenBucketLogisticsStore.getState().setDate(TODAY);
    expect(useKarenBucketLogisticsStore.getState().date).toBeNull();
    expect(fetchSpy).toHaveBeenLastCalledWith(undefined);
  });
});
