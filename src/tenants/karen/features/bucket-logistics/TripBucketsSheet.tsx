import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@/src/core/ui/Dialog';
import { mapAxiosError } from '@/src/core/api/client';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';
import { StatePill } from './StatusPills';
import {
  fetchTripBuckets,
  stageInfo,
  varietySections,
  type OrderFarm,
  type TripBucket,
  type TripStatus,
} from '@/src/tenants/karen/state/karen-bucket-logistics-store';

/** What the sheet lists: a trip's buckets, or the Not Scheduled ones (trip null). */
export type BucketListTarget = {
  title: string;
  pairs: OrderFarm[];
  trip: { name: string; status: TripStatus } | null;
};

type Props = { target: BucketListTarget | null; hub: string; onClose: () => void };

/** Read only: the buckets per variety, each with its current stage. */
export function TripBucketsSheet({ target, hub, onClose }: Props) {
  if (!target) return null;
  // A fresh list per target.
  return <BucketList key={`${target.trip?.name ?? 'none'}|${target.title}`} target={target} hub={hub} onClose={onClose} />;
}

function BucketList({ target, hub, onClose }: Props & { target: BucketListTarget }) {
  const [buckets, setBuckets] = useState<TripBucket[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchTripBuckets(target.pairs, target.trip)
      .then((list) => { if (live) setBuckets(list); })
      .catch((err) => { if (live) setError(mapAxiosError(err).message || 'Could not load the buckets.'); });
    return () => { live = false; };
  }, [target]);

  const sections = buckets ? varietySections(buckets) : [];
  return (
    <BottomSheet
      visible
      onClose={onClose}
      title={target.title}
      subtitle={buckets ? `${buckets.length} bucket${buckets.length === 1 ? '' : 's'}` : undefined}
    >
      {error ? (
        <Text style={s.empty}>{error}</Text>
      ) : !buckets ? (
        <ActivityIndicator style={s.spinner} color={COLORS.text} />
      ) : !buckets.length ? (
        <Text style={s.empty}>No buckets.</Text>
      ) : (
        sections.map((sec) => (
          <View key={sec.variety || '-'} style={s.section}>
            <View style={s.secHd}>
              {sec.color ? <View style={[s.dot, { backgroundColor: sec.color }]} /> : null}
              <Text style={s.secTitle} numberOfLines={1}>{sec.variety || 'No variety'}</Text>
              <Text style={s.secCount}>{sec.buckets.length}</Text>
            </View>
            {sec.buckets.map((b, i) => {
              const stage = stageInfo(b.stage, hub);
              const color = b.varietyColor || sec.color;
              return (
                <View
                  key={b.key}
                  style={[s.row, i > 0 ? s.rowSep : null, color ? [s.stripe, { borderLeftColor: color }] : null]}
                >
                  <View style={s.rowMain}>
                    <Text style={s.bucket} numberOfLines={1}>{b.bucket} ({b.stems})</Text>
                    <Text style={s.meta} numberOfLines={1}>{b.length}({b.orderName})</Text>
                  </View>
                  <StatePill label={stage.label} color={stage.color} small />
                </View>
              );
            })}
          </View>
        ))
      )}
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  spinner: { marginVertical: spacing.lg },
  empty: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, marginVertical: spacing.md },
  section: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: borderRadius.md,
    padding: spacing.sm, marginTop: spacing.sm, backgroundColor: COLORS.surface,
  },
  secHd: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 6, marginBottom: 2,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
  secTitle: { flex: 1, fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: COLORS.text },
  secCount: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: COLORS.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
  rowSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  stripe: { borderLeftWidth: 4, paddingLeft: 8 },
  rowMain: { flex: 1, minWidth: 0 },
  bucket: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: COLORS.text },
  meta: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textSecondary, marginTop: 1 },
});
