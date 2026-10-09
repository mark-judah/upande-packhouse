import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/src/core/ui/Screen';
import { Segmented } from '@/src/core/ui/Segmented';
import { useToast } from '@/src/core/ui/Toast';
import { COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';
import { useKarenBucketLogisticsStore } from '@/src/tenants/karen/state/karen-bucket-logistics-store';
import type { Trip, TripGroup } from '@/src/tenants/karen/state/karen-bucket-logistics-store';
import { RouteCard } from './RouteCard';
import { TripCard } from './TripCard';
import { TripEditSheet } from './TripEditSheet';
import { RejectTripSheet } from './RejectTripSheet';

const TABS = [
  { value: 'routes', label: "Today's Routes" },
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

const SECTIONS: { key: TripGroup; label: string; empty: string }[] = [
  { key: 'started', label: 'Started', empty: 'No trips started.' },
  { key: 'on_the_road', label: 'On the road', empty: 'No trucks out right now.' },
  { key: 'back', label: 'Completed', empty: 'No trips ended yet today.' },
];

export function KarenBucketLogisticsScreen() {
  const [tab, setTab] = useState<Tab>('routes');
  const { loading, error, groups, routes, vehicles, actioning, load, dispatch, release, reject, receive, saveEdit, reset } =
    useKarenBucketLogisticsStore();
  const [editing, setEditing] = useState<Trip | null>(null);
  const [rejecting, setRejecting] = useState<Trip | null>(null);
  const { showSuccess, showError } = useToast();

  useEffect(() => {
    load();
    return () => reset();
  }, [load, reset]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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

  const handleReceive = useCallback(
    async (name: string) => {
      const outcome = await receive(name);
      if (outcome.kind === 'success') showSuccess(outcome.message);
      else showError(outcome.message);
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

  const totalTrips = groups.started.length + groups.on_the_road.length + groups.back.length;
  const card = (trip: Trip) => (
    <TripCard
      key={trip.name}
      trip={trip}
      actioning={!!actioning[trip.name]}
      onDispatch={handleDispatch}
      onReceive={handleReceive}
      onEdit={setEditing}
      onRelease={handleRelease}
      onReject={setRejecting}
    />
  );

  return (
    <Screen title="Bucket Logistics" loading={loading} error={error} onRetry={load} onRefresh={load}>
      <Segmented value={tab} options={TABS} onChange={setTab} />

      {tab === 'routes' ? (
        !loading && routes.length === 0 ? (
          <Text style={s.empty}>No trucks planned for today yet.</Text>
        ) : (
          routes.map((route) => <RouteCard key={route.vehicle} route={route} />)
        )
      ) : tab === 'requests' ? (
        REQUEST_SECTIONS.map((section) => {
          const list = groups.requests.filter((t) => t.status === section.status);
          return (
            <View key={section.status} style={s.section}>
              <Text style={s.sectionLbl}>{section.label} ({list.length})</Text>
              {list.length === 0 ? <Text style={s.empty}>{section.empty}</Text> : list.map(card)}
            </View>
          );
        })
      ) : !loading && totalTrips === 0 ? (
        <Text style={s.empty}>No bucket request trips yet today.</Text>
      ) : (
        SECTIONS.map((section) => (
          <View key={section.key} style={s.section}>
            <Text style={s.sectionLbl}>{section.label} ({groups[section.key].length})</Text>
            {groups[section.key].length === 0 ? (
              <Text style={s.empty}>{section.empty}</Text>
            ) : (
              groups[section.key].map(card)
            )}
          </View>
        ))
      )}

      <RejectTripSheet
        trip={rejecting}
        busy={!!(rejecting && actioning[rejecting.name])}
        onClose={() => setRejecting(null)}
        onReject={handleReject}
      />

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
});
