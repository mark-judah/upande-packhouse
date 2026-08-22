import { groupTrips } from '@/src/tenants/karen/state/karen-bucket-logistics-store';
import type { RawTransferScheduleData } from '@/src/tenants/karen/api/karen-bucket-logistics-api';

function fixture(overrides: Partial<RawTransferScheduleData> = {}): RawTransferScheduleData {
  return {
    orders: [],
    trips: [],
    truck_status: [],
    packhouse: 'Kapkolia',
    window: { from: '2026-08-22', to: '2026-08-22' },
    generated_at: '2026-08-22 06:00:00',
    ...overrides,
  };
}

describe('groupTrips', () => {
  it('buckets trips into planned/on_the_road/back by status', () => {
    const data = fixture({
      trips: [
        { name: 'TRIP-1', vehicle: 'KAA 001A', trip_date: '2026-08-22', status: 'Draft', notes: '', collection_order: '', farm: '', total_buckets: 0, total_stems: 0, capacity_buckets: 100, orders: [] },
        { name: 'TRIP-2', vehicle: 'KAA 002B', trip_date: '2026-08-22', status: 'Scheduled', notes: '', collection_order: '', farm: '', total_buckets: 0, total_stems: 0, capacity_buckets: 100, orders: [] },
        { name: 'TRIP-3', vehicle: 'KAA 003C', trip_date: '2026-08-22', status: 'Dispatched', notes: '', collection_order: '', farm: '', total_buckets: 0, total_stems: 0, capacity_buckets: 100, orders: [] },
        { name: 'TRIP-4', vehicle: 'KAA 004D', trip_date: '2026-08-22', status: 'Received', notes: '', collection_order: '', farm: '', total_buckets: 0, total_stems: 0, capacity_buckets: 100, orders: [] },
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
        { name: 'TRIP-OVER', vehicle: 'V1', trip_date: '2026-08-22', status: 'Draft', notes: '', collection_order: '', farm: '', total_buckets: 120, total_stems: 0, capacity_buckets: 100, orders: [] },
        { name: 'TRIP-NOCAP', vehicle: 'V2', trip_date: '2026-08-22', status: 'Draft', notes: '', collection_order: '', farm: '', total_buckets: 10, total_stems: 0, capacity_buckets: 0, orders: [] },
      ],
    });
    const groups = groupTrips(data);
    expect(groups.planned.find((t) => t.name === 'TRIP-OVER')!.fillPct).toBe(100);
    expect(groups.planned.find((t) => t.name === 'TRIP-NOCAP')!.fillPct).toBe(0);
  });

  it('groups a multi-farm trip into stops in collection_order sequence, extra farms appended', () => {
    const data = fixture({
      trips: [
        {
          name: 'TRIP-MULTI', vehicle: 'V1', trip_date: '2026-08-22', status: 'Draft', notes: '',
          collection_order: 'Kaptumbo, Simotwo', farm: '', total_buckets: 30, total_stems: 0, capacity_buckets: 100,
          orders: [
            { order_pick_list: 'OPL-1', order_name: 'ORD-1', customer: 'Acme', farm: 'Simotwo', varieties: 'Freedom', buckets: 10, stems: 200, full_farm_buckets: 10, is_partial: 0 },
            { order_pick_list: 'OPL-2', order_name: 'ORD-2', customer: 'Acme', farm: 'Kaptumbo', varieties: 'Avalanche', buckets: 15, stems: 300, full_farm_buckets: 15, is_partial: 0 },
            { order_pick_list: 'OPL-3', order_name: 'ORD-3', customer: 'Beta', farm: 'Torongo', varieties: 'Explorer', buckets: 5, stems: 100, full_farm_buckets: 5, is_partial: 0 },
          ],
        },
      ],
    });
    const trip = groupTrips(data).planned[0];
    expect(trip.stops.map((s) => s.farm)).toEqual(['Kaptumbo', 'Simotwo', 'Torongo']);
    expect(trip.stops[0].buckets).toBe(15);
    expect(trip.stops[0].orders).toEqual([{ orderName: 'ORD-2', customer: 'Acme', varieties: 'Avalanche', buckets: 15 }]);
  });

  it('builds status pills from truck_status matched by vehicle, dropping zero counts', () => {
    const data = fixture({
      trips: [
        { name: 'TRIP-1', vehicle: 'KAA 001A', trip_date: '2026-08-22', status: 'Dispatched', notes: '', collection_order: '', farm: '', total_buckets: 10, total_stems: 0, capacity_buckets: 100, orders: [] },
      ],
      truck_status: [
        { truck: 'KAA 001A', total: 10, awaiting: 0, loaded: 3, in_transit: 7, shelved: 0, location: 'in_transit', farm: 'Simotwo', loading_pct: 100, last: '2026-08-22 07:00:00' },
      ],
    });
    const trip = groupTrips(data).on_the_road[0];
    expect(trip.pills).toEqual([
      { key: 'loaded', label: 'Loading', count: 3 },
      { key: 'in_transit', label: 'In transit', count: 7 },
    ]);
  });

  it('returns no pills when the vehicle has no truck_status entry', () => {
    const data = fixture({
      trips: [
        { name: 'TRIP-1', vehicle: 'KAA 999Z', trip_date: '2026-08-22', status: 'Draft', notes: '', collection_order: '', farm: '', total_buckets: 0, total_stems: 0, capacity_buckets: 100, orders: [] },
      ],
    });
    expect(groupTrips(data).planned[0].pills).toEqual([]);
  });

  it('builds scheduleContext from the matching schedule order with the lowest sequence number', () => {
    const data = fixture({
      orders: [
        { opl: 'OPL-1', order_name: 'ORD-1', customer: 'Acme', so: 'SO-1', delivery_date: '2026-08-23', truck: '', mixed: 0, schedule: 5, team: 'Team B', total_buckets: 10, total_stems: 200, farms: [] },
        { opl: 'OPL-2', order_name: 'ORD-2', customer: 'Acme', so: 'SO-2', delivery_date: '2026-08-23', truck: '', mixed: 0, schedule: 2, team: 'Team A', total_buckets: 15, total_stems: 300, farms: [] },
      ],
      trips: [
        {
          name: 'TRIP-1', vehicle: 'V1', trip_date: '2026-08-22', status: 'Draft', notes: '',
          collection_order: '', farm: '', total_buckets: 25, total_stems: 0, capacity_buckets: 100,
          orders: [
            { order_pick_list: 'OPL-1', order_name: 'ORD-1', customer: 'Acme', farm: 'Simotwo', varieties: 'Freedom', buckets: 10, stems: 200, full_farm_buckets: 10, is_partial: 0 },
            { order_pick_list: 'OPL-2', order_name: 'ORD-2', customer: 'Acme', farm: 'Kaptumbo', varieties: 'Avalanche', buckets: 15, stems: 300, full_farm_buckets: 15, is_partial: 0 },
          ],
        },
      ],
    });
    expect(groupTrips(data).planned[0].scheduleContext).toBe('Team A · #2 in queue');
  });

  it('returns an empty scheduleContext when no order on the trip matches the schedule feed', () => {
    const data = fixture({
      trips: [
        {
          name: 'TRIP-1', vehicle: 'V1', trip_date: '2026-08-22', status: 'Draft', notes: '',
          collection_order: '', farm: '', total_buckets: 5, total_stems: 0, capacity_buckets: 100,
          orders: [{ order_pick_list: 'OPL-UNKNOWN', order_name: 'ORD-X', customer: '', farm: 'Simotwo', varieties: '', buckets: 5, stems: 100, full_farm_buckets: 5, is_partial: 0 }],
        },
      ],
    });
    expect(groupTrips(data).planned[0].scheduleContext).toBe('');
  });
});
