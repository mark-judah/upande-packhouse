import { StyleSheet, Text, View } from 'react-native';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';
import { Button } from '@/src/core/ui/Button';
import { StatusPills } from './StatusPills';
import type { Trip, TripStatus } from '@/src/tenants/karen/state/karen-bucket-logistics-store';

function fillColor(pct: number): string {
  if (pct >= 100) return COLORS.success;
  if (pct > 0) return '#D97706';
  return COLORS.border;
}

const STATUS_BADGE: Record<TripStatus, { label: string; bg: string; fg: string }> = {
  Draft: { label: 'Planned', bg: '#F5F5F5', fg: '#525252' },
  Scheduled: { label: 'Planned', bg: '#F5F5F5', fg: '#525252' },
  Dispatched: { label: 'On the road', bg: '#EFF6FF', fg: '#2563EB' },
  Received: { label: 'Completed', bg: '#F0FDF4', fg: '#166534' },
};

export function TripCard({
  trip,
  actioning,
  onDispatch,
  onReceive,
}: {
  trip: Trip;
  actioning: boolean;
  onDispatch: (name: string) => void;
  onReceive: (name: string) => void;
}) {
  const badge = STATUS_BADGE[trip.status];

  return (
    <View style={s.card}>
      <View style={s.hd}>
        <Text style={s.tripNo}>TRIP {trip.sequence}</Text>
        <View style={[s.badge, { backgroundColor: badge.bg }]}>
          <Text style={[s.badgeTxt, { color: badge.fg }]}>{badge.label}</Text>
        </View>
      </View>

      <View style={s.vehicleRow}>
        <Text style={s.vehicle} numberOfLines={1}>{trip.vehicle}</Text>
        <Text style={s.count}>
          {trip.totalBuckets}{trip.capacityBuckets ? ` / ${trip.capacityBuckets}` : ''} bkt
        </Text>
      </View>
      {trip.scheduleContext ? <Text style={s.schedule}>{trip.scheduleContext}</Text> : null}

      <View style={s.track}>
        <View style={[s.fill, { width: `${Math.max(trip.fillPct, 3)}%`, backgroundColor: fillColor(trip.fillPct) }]} />
      </View>

      <StatusPills pills={trip.pills} />

      <View style={s.stops}>
        {trip.stops.map((stop, i) => (
          <View key={stop.farm} style={s.stop}>
            <View style={s.stopHd}>
              <Text style={s.stopIdx}>{i + 1}</Text>
              <Text style={s.stopFarm} numberOfLines={1}>{stop.farm}</Text>
              <Text style={s.stopBkt}>{stop.buckets} bkt</Text>
            </View>
            {stop.orders.map((o, oi) => (
              <View key={`${o.orderName}-${oi}`} style={s.orderRow}>
                <Text style={s.orderName} numberOfLines={1}>
                  {o.orderName}{o.customer ? ` · ${o.customer}` : ''}
                </Text>
                <Text style={s.orderBkt}>{o.buckets}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      {trip.status === 'Draft' || trip.status === 'Scheduled' ? (
        <Button label="Dispatch" onPress={() => onDispatch(trip.name)} loading={actioning} style={s.action} />
      ) : trip.status === 'Dispatched' ? (
        <Button label="End Trip" onPress={() => onReceive(trip.name)} loading={actioning} variant="outline" style={s.action} />
      ) : trip.turnaround ? (
        <View style={s.turnaround}>
          <Text style={s.turnaroundLbl}>Turnaround</Text>
          <Text style={s.turnaroundVal}>{trip.turnaround}</Text>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  hd: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tripNo: {
    fontFamily: fontFamily.bold, fontSize: fontSize.xs, color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  badge: { borderRadius: borderRadius.full, paddingHorizontal: 10, paddingVertical: 3 },
  badgeTxt: { fontFamily: fontFamily.semiBold, fontSize: 11 },
  vehicleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  vehicle: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: COLORS.text, flexShrink: 1 },
  count: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: COLORS.textSecondary },
  schedule: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted, marginTop: 2 },
  track: { height: 8, borderRadius: 4, backgroundColor: COLORS.bgMuted, overflow: 'hidden', marginTop: spacing.sm },
  fill: { height: '100%', borderRadius: 4 },
  stops: { marginTop: spacing.sm, gap: spacing.xs },
  stop: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border, paddingTop: spacing.xs },
  stopHd: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stopIdx: {
    fontFamily: fontFamily.bold, fontSize: 10, color: COLORS.textOnPrimary, backgroundColor: COLORS.primary,
    width: 16, height: 16, borderRadius: 8, textAlign: 'center', lineHeight: 16, overflow: 'hidden',
  },
  stopFarm: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  stopBkt: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted },
  orderRow: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 22, marginTop: 2 },
  orderName: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textSecondary },
  orderBkt: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted },
  action: { marginTop: spacing.md },
  turnaround: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border,
  },
  turnaroundLbl: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  turnaroundVal: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: COLORS.success },
});
