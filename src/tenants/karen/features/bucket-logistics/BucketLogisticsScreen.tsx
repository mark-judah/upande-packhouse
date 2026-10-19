import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/src/core/ui/Screen';
import { Segmented } from '@/src/core/ui/Segmented';
import { DateSelector } from '@/src/core/ui/DateSelector';
import { formatDayLabel } from '@/src/core/date';
import { useToast } from '@/src/core/ui/Toast';
import { showDialog } from '@/src/core/ui/DialogHost';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';
import { useKarenBucketLogisticsStore } from '@/src/tenants/karen/state/karen-bucket-logistics-store';
import type { NotScheduledOrder, Trip } from '@/src/tenants/karen/state/karen-bucket-logistics-store';
import { RouteCard } from './RouteCard';
import { TripCard } from './TripCard';
import { TripEditSheet } from './TripEditSheet';
import { RejectTripSheet } from './RejectTripSheet';
import { TripBucketsSheet, type BucketListTarget } from './TripBucketsSheet';

/** Quiet refresh while the screen is open. */
const REFRESH_MS = 30_000;

const TABS = [
  { value: 'routes', label: 'Routes' },
  { value: 'requests', label: 'Trip Requests' },
  { value: 'trips', label: 'Trips' },
] as const;
type Tab = (typeof TABS)[number]['value'];

/** Trip Requests: planned and requested from the Scheduler; a released trip has started
 *  and moves to Trips. */
const REQUEST_SECTIONS: { status: 'Requested' | 'Draft'; label: string; empty: string }[] = [
  { status: 'Requested', label: 'Requested', empty: 'No trucks requested.' },
  { status: 'Draft', label: 'Planned', empty: 'No trips planned.' },
];

/** History: the day's dispatched and ended trips (and a truck still out from before). */
function isHistory(t: Trip, day: string): boolean {
  if (t.status === 'Dispatched') return true;
  return t.tripDate === day || t.dispatchedAt.startsWith(day) || t.receivedAt.startsWith(day);
}

/** "today" / "yesterday" / "Sat 17 Oct", for use mid-sentence. */
function dayPhrase(day: string): string {
  const label = formatDayLabel(day);
  return /^(Today|Yesterday|Tomorrow)$/.test(label) ? label.toLowerCase() : label;
}

function farmTotals(rows: NotScheduledOrder[]): { farm: string; buckets: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.farm, (m.get(r.farm) || 0) + r.buckets);
  return [...m.entries()].map(([farm, buckets]) => ({ farm, buckets }));
}

export function KarenBucketLogisticsScreen() {
  const [tab, setTab] = useState<Tab>('routes');
  const {
    loading, error, groups, routes, vehicles, actioning, today, date, notScheduled, hub,
    load, setDate, dispatch, release, reject, receive, saveEdit, reset,
  } = useKarenBucketLogisticsStore();
  const day = date ?? today;
  const dayLabel = dayPhrase(day);
  const [editing, setEditing] = useState<Trip | null>(null);
  const [rejecting, setRejecting] = useState<Trip | null>(null);
  const [listing, setListing] = useState<BucketListTarget | null>(null);
  /** Trucks picked in the filter; none = every truck. */
  const [trucks, setTrucks] = useState<string[]>([]);
  const { showSuccess, showError } = useToast();

  useEffect(() => () => reset(), [reset]);

  useFocusEffect(
    useCallback(() => {
      load();
      const id = setInterval(() => { load(); }, REFRESH_MS);
      return () => clearInterval(id);
    }, [load]),
  );

  const openTrip = useCallback(
    (trip: Trip) => setListing({ title: trip.title, pairs: trip.orderFarms, trip: { name: trip.name, status: trip.status } }),
    [],
  );

  const handleDispatch = useCallback(
    async (name: string) => {
      const outcome = await dispatch(name);
      if (outcome.kind === 'success') showSuccess(outcome.message);
      else showError(outcome.message);
    },
    [dispatch, showSuccess, showError],
  );

  const handleRelease = useCallback(
    async (name: string) => {
      const outcome = await release(name);
      if (outcome.kind === 'success') showSuccess(outcome.message);
      else showError(outcome.message);
    },
    [release, showSuccess, showError],
  );

  const handleReject = useCallback(
    async (trip: Trip, reason: string) => {
      const outcome = await reject(trip.name, reason);
      if (outcome.kind === 'success') {
        showSuccess(outcome.message);
        setRejecting(null);
      } else showError(outcome.message);
    },
    [reject, showSuccess, showError],
  );

  // Ending a trip can't be undone from here: ask first.
  const handleReceive = useCallback(
    (name: string) => {
      showDialog('End trip', 'Are you sure you want to end the trip?', [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            const outcome = await receive(name);
            if (outcome.kind === 'success') showSuccess(outcome.message);
            else showError(outcome.message);
          },
        },
      ]);
    },
    [receive, showSuccess, showError],
  );

  const handleSaveEdit = useCallback(
    async (trip: Trip, vehicle: string) => {
      const outcome = await saveEdit(trip, vehicle);
      if (outcome.kind === 'success') {
        showSuccess(outcome.message);
        setEditing(null);
      } else showError(outcome.message);
    },
    [saveEdit, showSuccess, showError],
  );

  const allTrips = useMemo(
    () => [...groups.requests, ...groups.started, ...groups.on_the_road, ...groups.back],
    [groups],
  );
  const truckList = useMemo(() => [...new Set(allTrips.map((t) => t.vehicle))].sort(), [allTrips]);
  const picked = trucks.filter((v) => truckList.includes(v));
  const shown = (list: Trip[]) => (picked.length ? list.filter((t) => picked.includes(t.vehicle)) : list);
  const toggleTruck = (v: string) =>
    setTrucks((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));

  const started = shown(groups.started);
  const history = shown([...groups.on_the_road, ...groups.back].filter((t) => isHistory(t, day)));
  const waitingN = notScheduled.reduce((n, o) => n + o.buckets, 0);
  const totalTrips = groups.started.length + groups.on_the_road.length + groups.back.length;

  const truckChips = truckList.length > 1 ? (
    <View style={s.trucks}>
      {truckList.map((v) => {
        const on = picked.includes(v);
        return (
          <Pressable
            key={v}
            onPress={() => toggleTruck(v)}
            style={[s.truck, on ? s.truckOn : null]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Ionicons name="car" size={12} color={on ? COLORS.textOnPrimary : COLORS.textSecondary} />
            <Text style={[s.truckTxt, on ? s.truckTxtOn : null]}>{v}</Text>
          </Pressable>
        );
      })}
    </View>
  ) : null;

  const card = (trip: Trip) => (
    <TripCard
      key={trip.name}
      trip={trip}
      actioning={!!actioning[trip.name]}
      onOpen={openTrip}
      onDispatch={handleDispatch}
      onReceive={handleReceive}
      onEdit={setEditing}
      onRelease={handleRelease}
      onReject={setRejecting}
    />
  );

  return (
    <Screen title="Bucket Logistics" loading={loading} error={error} onRetry={load} onRefresh={load}>
      <DateSelector value={day} onChange={setDate} maxDate={today} resetTo={today} compact />
      <Segmented value={tab} options={TABS} onChange={setTab} />

      {tab === 'routes' ? (
        !loading && routes.length === 0 ? (
          <Text style={s.empty}>No trucks planned for {dayLabel}.</Text>
        ) : (
          routes.map((route) => <RouteCard key={route.vehicle} route={route} dayLabel={dayLabel} />)
        )
      ) : tab === 'requests' ? (
        <>
          {truckChips}
          {REQUEST_SECTIONS.map((section) => {
            const list = shown(groups.requests.filter((t) => t.status === section.status));
            return (
              <View key={section.status} style={s.section}>
                <Text style={s.sectionLbl}>{section.label} ({list.length})</Text>
                {list.length === 0 ? <Text style={s.empty}>{section.empty}</Text> : list.map(card)}
              </View>
            );
          })}
        </>
      ) : (
        <>
          {truckChips}
          {!loading && totalTrips === 0 && waitingN === 0 ? (
            <Text style={s.empty}>No bucket request trips {day === today ? 'yet today' : `for ${dayLabel}`}.</Text>
          ) : (
            <>
              <View style={s.section}>
                <Text style={s.sectionLbl}>Started ({started.length})</Text>
                {started.length === 0 ? <Text style={s.empty}>No trips started.</Text> : started.map(card)}
              </View>

              {waitingN > 0 ? (
                <Pressable
                  onPress={() =>
                    setListing({
                      title: `Not Scheduled (${waitingN}bkts)`,
                      pairs: notScheduled.map((o) => ({ opl: o.opl, orderName: o.orderName, farm: o.farm })),
                      trip: null,
                    })
                  }
                  accessibilityRole="button"
                  style={({ pressed }) => [s.waiting, pressed ? s.pressed : null]}
                >
                  <View style={s.waitingHd}>
                    <Ionicons name="time-outline" size={15} color={COLORS.textMuted} />
                    <Text style={s.waitingTitle}>Not Scheduled ({waitingN}bkts)</Text>
                    <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                  </View>
                  <View style={s.farms}>
                    {farmTotals(notScheduled).map((f) => (
                      <Text key={f.farm} style={s.farmChip}>
                        {f.farm} <Text style={s.farmN}>{f.buckets}</Text>
                      </Text>
                    ))}
                  </View>
                </Pressable>
              ) : null}

              {history.length ? (
                <View style={s.section}>
                  <Text style={s.sectionLbl}>History ({history.length})</Text>
                  {history.map(card)}
                </View>
              ) : null}
            </>
          )}
        </>
      )}

      <RejectTripSheet
        trip={rejecting}
        busy={!!(rejecting && actioning[rejecting.name])}
        onClose={() => setRejecting(null)}
        onReject={handleReject}
      />

      <TripBucketsSheet target={listing} hub={hub} onClose={() => setListing(null)} />

      <TripEditSheet
        trip={editing}
        vehicles={vehicles}
        busy={!!(editing && actioning[editing.name])}
        onClose={() => setEditing(null)}
        onSave={handleSaveEdit}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  section: { marginBottom: spacing.lg },
  sectionLbl: {
    fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: spacing.sm,
  },
  empty: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  trucks: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.md },
  truck: {
    flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: borderRadius.full,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, paddingHorizontal: 10, paddingVertical: 4,
  },
  truckOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  truckTxt: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: COLORS.textSecondary },
  truckTxtOn: { color: COLORS.textOnPrimary },
  waiting: {
    backgroundColor: COLORS.bgMuted, borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed',
    borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.lg, opacity: 0.85,
  },
  pressed: { opacity: 0.7 },
  waitingHd: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  waitingTitle: { flex: 1, fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: COLORS.textMuted },
  farms: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  farmChip: {
    fontFamily: fontFamily.medium, fontSize: 11, color: COLORS.textMuted, borderRadius: borderRadius.full,
    borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden',
  },
  farmN: { fontFamily: fontFamily.bold },
});
