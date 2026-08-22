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

const TABS = [
  { value: 'routes', label: "Today's Routes" },
  { value: 'trips', label: 'Trips' },
] as const;
type Tab = (typeof TABS)[number]['value'];

const SECTIONS: { key: TripGroup; label: string; empty: string }[] = [
  { key: 'planned', label: 'Planned', empty: 'No trips planned yet — built on the desktop Transfer Scheduling page.' },
  { key: 'on_the_road', label: 'On the road', empty: 'No trucks out right now.' },
  { key: 'back', label: 'Completed', empty: 'No trips ended yet today.' },
];

export function KarenBucketLogisticsScreen() {
  const [tab, setTab] = useState<Tab>('routes');
  const { loading, error, groups, routes, actioning, load, dispatch, receive, reset } = useKarenBucketLogisticsStore();
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

  const handleReceive = useCallback(
    async (name: string) => {
      const outcome = await receive(name);
      if (outcome.kind === 'success') showSuccess(outcome.message);
      else showError(outcome.message);
    },
    [receive, showSuccess, showError],
  );

  const totalTrips = groups.planned.length + groups.on_the_road.length + groups.back.length;

  return (
    <Screen title="Bucket Logistics" loading={loading} error={error} onRetry={load} onRefresh={load}>
      <Segmented value={tab} options={TABS} onChange={setTab} />

      {tab === 'routes' ? (
        !loading && routes.length === 0 ? (
          <Text style={s.empty}>No trucks planned for today yet.</Text>
        ) : (
          routes.map((route) => <RouteCard key={route.vehicle} route={route} />)
        )
      ) : !loading && totalTrips === 0 ? (
        <Text style={s.empty}>No bucket request trips yet today.</Text>
      ) : (
        SECTIONS.map((section) => (
          <View key={section.key} style={s.section}>
            <Text style={s.sectionLbl}>{section.label} ({groups[section.key].length})</Text>
            {groups[section.key].length === 0 ? (
              <Text style={s.empty}>{section.empty}</Text>
            ) : (
              groups[section.key].map((trip: Trip) => (
                <TripCard
                  key={trip.name}
                  trip={trip}
                  actioning={!!actioning[trip.name]}
                  onDispatch={handleDispatch}
                  onReceive={handleReceive}
                />
              ))
            )}
          </View>
        ))
      )}
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
