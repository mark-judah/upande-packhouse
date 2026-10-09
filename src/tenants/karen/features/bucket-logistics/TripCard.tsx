import { StyleSheet, Text, View } from 'react-native';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';
import { Button } from '@/src/core/ui/Button';
import { showDialog } from '@/src/core/ui/DialogHost';
import { StatusPills } from './StatusPills';
import { stageToPills, type Trip, type TripStatus } from '@/src/tenants/karen/state/karen-bucket-logistics-store';

function fillColor(pct: number): string {
  if (pct >= 100) return COLORS.success;
  if (pct > 0) return '#D97706';
  return COLORS.border;
}

const STATUS_BADGE: Record<TripStatus, { label: string; bg: string; fg: string }> = {
  Draft: { label: 'Planned', bg: '#F5F5F5', fg: '#525252' },
  Requested: { label: 'Truck requested', bg: '#FFFBEB', fg: '#B45309' },
  Scheduled: { label: 'Started', bg: '#EFF6FF', fg: '#2563EB' },
  Dispatched: { label: 'On the road', bg: '#EFF6FF', fg: '#2563EB' },
  Received: { label: 'Completed', bg: '#F0FDF4', fg: '#166534' },
};

/** One question for a truck request: Yes releases the truck to the farm, No rejects it
 *  (the reason is asked next). */
function confirmRequest(trip: Trip, onRelease: (name: string) => void, onReject: (trip: Trip) => void) {
  const farms = trip.stops.map((st) => st.farm).join(', ') || 'the farm';
  const load = `${trip.totalBuckets}${trip.capacityBuckets ? ` / ${trip.capacityBuckets}` : ''} buckets`;
  const by = trip.requestedBy ? ` Requested by ${trip.requestedBy}${trip.requestedAt ? ` · ${trip.requestedAt.slice(11, 16)}` : ''}.` : '';
  showDialog(
    `Release ${trip.vehicle} to ${farms}?`,
    `Pick ${load}.${by}`,
    [
      { text: 'No', style: 'destructive', onPress: () => onReject(trip) },
      { text: 'Yes', onPress: () => onRelease(trip.name) },
    ],
    { name: 'car-outline', tone: 'info' },
  );
}

/** Dispatch is confirmed: Yes puts the truck and its buckets in transit to the packhouse. */
function confirmDispatch(trip: Trip, onDispatch: (name: string) => void) {
  const farms = trip.stops.map((st) => st.farm).join(', ') || 'the farm';
  showDialog(
    `Dispatch ${trip.vehicle}?`,
    `${trip.totalBuckets} buckets from ${farms} are on the truck and go in transit to the packhouse.`,
    [
      { text: 'No', style: 'cancel' },
      { text: 'Yes', onPress: () => onDispatch(trip.name) },
    ],
    { name: 'car-outline', tone: 'info' },
  );
}

export function TripCard({
  trip,
  actioning,
  onDispatch,
  onReceive,
  onEdit,
  onRelease,
  onReject,
}: {
  trip: Trip;
  actioning: boolean;
  onRelease: (name: string) => void;
  onReject: (trip: Trip) => void;
  onDispatch: (name: string) => void;
  onReceive: (name: string) => void;
  onEdit: (trip: Trip) => void;
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
      {trip.requestedBy ? (
        <Text style={s.requested}>
          Requested by {trip.requestedBy}
          {trip.requestedAt ? ` · ${trip.requestedAt.slice(11, 16)}` : ''}
        </Text>
      ) : null}

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
              <View key={`${o.orderName}-${oi}`} style={[s.orderRow, oi % 2 ? s.orderRowAlt : null]}>
                <Text style={s.orderName} numberOfLines={1}>
                  {o.orderName}{o.customer ? ` · ${o.customer}` : ''}
                </Text>
                <Text style={s.orderBkt}>{o.buckets}</Text>
              </View>
            ))}
            {stageToPills(stop.stage).length > 0 ? (
              <View style={s.stopPills}>
                <StatusPills pills={stageToPills(stop.stage)} />
              </View>
            ) : null}
          </View>
        ))}
      </View>

      {trip.editable ? (
        <Button label="Change truck" onPress={() => onEdit(trip)} variant="outline" size="sm" disabled={actioning} style={s.edit} />
      ) : null}

      {trip.status === 'Requested' ? (
        <Button
          label="Confirm request"
          onPress={() => confirmRequest(trip, onRelease, onReject)}
          loading={actioning}
          style={s.action}
        />
      ) : trip.status === 'Scheduled' ? (
        <Button label="Dispatch" onPress={() => confirmDispatch(trip, onDispatch)} loading={actioning} style={s.action} />
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
  requested: {
    alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: borderRadius.full,
    borderWidth: 1, borderColor: COLORS.border, fontFamily: fontFamily.medium, fontSize: 11, color: COLORS.textSecondary,
  },
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
  orderRow: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 22, paddingRight: 4, paddingVertical: 3, marginTop: 2, borderRadius: 4 },
  orderRowAlt: { backgroundColor: COLORS.bgMuted },
  edit: { marginTop: spacing.md, alignSelf: 'flex-start' },
  orderName: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textSecondary },
  orderBkt: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted },
  stopPills: { paddingLeft: 22 },
  action: { marginTop: spacing.md },
  turnaround: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border,
  },
  turnaroundLbl: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  turnaroundVal: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: COLORS.success },
});
