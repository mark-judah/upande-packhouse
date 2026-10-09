import { bySchedule, type SchedulerOrder } from '@/src/tenants/karen/state/karen-scheduler-store';

const o = (oplName: string, team: string, scheduleNumber: number, where: SchedulerOrder['where']): SchedulerOrder => ({
  oplName, orderName: oplName, scheduleNumber, where, customer: '', team, salesOrder: '', issuingPct: 0,
  packed: false, totalStems: 0, buckets: 0, boxes: 0, packrate: 0, specs: [], stages: {},
});

describe('bySchedule', () => {
  it('lists Kapkolia orders first, then farm orders, each in schedule order, unscheduled last', () => {
    const list = [
      o('A5-farm', 'Team A', 5, 'remote'),
      o('E6-hub', 'Eldama A', 6, 'hub'),
      o('none', 'Jamafa', 0, ''),
      o('J1-hub', 'Jamafa', 1, 'hub'),
      o('A1-hub', 'Team A', 1, 'hub'),
      o('J6-farm', 'Jamafa', 6, 'remote'),
    ].sort(bySchedule);
    expect(list.map((x) => x.oplName)).toEqual(['J1-hub', 'A1-hub', 'E6-hub', 'A5-farm', 'J6-farm', 'none']);
  });
});
