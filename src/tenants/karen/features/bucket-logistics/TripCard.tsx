import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';
import { Button } from '@/src/core/ui/Button';
import { showDialog } from '@/src/core/ui/DialogHost';
import { StatePill } from './StatusPills';
import { dateTimeLabel, type Trip } from '@/src/tenants/karen/state/karen-bucket-logistics-store';

const OVER = '#c4302b';

/** The load bar: green, amber from 90% full, red over capacity. */
function fillColor(trip: Trip): string {
  if (trip.freeBuckets < 0) return OVER;
  if (trip.loadPct >= 90) return '#d97706';
  return '#16a34a';
}

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
  onOpen,
  onDispatch,
  onReceive,
  onEdit,
  onRelease,
  onReject,
}: {
  trip: Trip;
  actioning: boolean;
  /** Its buckets, read only. */
  onOpen: (trip: Trip) => void;
  onRelease: (name: string) => void;
  onReject: (trip: Trip) => void;
  onDispatch: (name: string) => void;
  onReceive: (name: string) => void;
  onEdit: (trip: Trip) => void;
}) {
  const cap = trip.capacityBuckets;
  const total = cap ? cap - trip.freeBuckets : trip.totalBuckets;
  const over = trip.freeBuckets < 0;
  const when = [
    trip.createdAt ? `Created ${dateTimeLabel(trip.createdAt)}` : '',
    trip.scheduledAt ? `Scheduled ${dateTimeLabel(trip.scheduledAt)}` : '',
  ].filter(Boolean);

  return (
    <Pressable
      onPress={() => onOpen(trip)}
      accessibilityRole="button"
      accessibilityLabel={`Buckets on ${trip.title}`}
      style={({ pressed }) => [s.card, pressed ? s.pressed : null]}
    >
      <View style={s.hd}>
        <Ionicons name="car" size={15} color={COLORS.text} />
        <Text style={s.title} numberOfLines={1}>{trip.title}</Text>
        <StatePill label={trip.state.label} color={trip.state.color} />
      </View>
      {trip.runChain ? <Text style={s.meta} numberOfLines={1}>{trip.runChain}</Text> : null}
      {when.length ? <Text style={s.meta} numberOfLines={1}>{when.join(' · ')}</Text> : null}
      {trip.requestedBy ? (
        <Text style={s.requested}>
          Requested by {trip.requestedBy}
          {trip.requestedAt ? ` · ${trip.requestedAt.slice(11, 16)}` : ''}
        </Text>
      ) : null}

      <View style={s.kpis}>
        <Text style={s.kpi}>Capacity <Text style={s.kpiVal}>{cap || '—'}</Text></Text>
        <Text style={s.kpi}>
          Buckets <Text style={s.kpiVal}>{total}</Text>
          {cap ? <Text style={s.kpiSub}> ({trip.loadPct}%)</Text> : null}
        </Text>
        {cap ? (
          <Text style={[s.kpi, over ? s.over : null]}>
            {over ? 'Over ' : 'Free '}
            <Text style={[s.kpiVal, over ? s.over : null]}>{Math.abs(trip.freeBuckets)}</Text>
          </Text>
        ) : null}
        <Text style={s.kpi}>Loaded <Text style={s.kpiVal}>{trip.loadedBuckets}</Text></Text>
        <Text style={s.kpi}>Arrived <Text style={s.kpiVal}>{trip.arrivedBuckets}</Text></Text>
      </View>
      {cap ? (
        <View style={s.track}>
          <View style={[s.fill, { width: `${Math.min(100, Math.max(trip.loadPct, 2))}%`, backgroundColor: fillColor(trip) }]} />
        </View>
      ) : null}

      {trip.farmLoads.length ? (
        <View style={s.farms}>
          {trip.farmLoads.map((f) => (
            <View key={f.farm} style={s.farmChip}>
              <Text style={s.farmTxt} numberOfLines={1}>
                {f.farm} <Text style={s.farmN}>{f.buckets}</Text>
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={s.foot}>
        <Pressable onPress={() => onOpen(trip)} hitSlop={6} style={s.viewBtn} accessibilityRole="button">
          <Ionicons name="cube-outline" size={14} color={COLORS.text} />
          <Text style={s.viewTxt}>View buckets</Text>
          <Ionicons name="chevron-forward" size={14} color={COLORS.text} />
        </Pressable>
        {trip.editable ? (
          <Button label="Change truck" onPress={() => onEdit(trip)} variant="outline" size="sm" disabled={actioning} />
        ) : null}
      </View>

      {trip.canDispatch ? (
        <Button label="Dispatch" onPress={() => confirmDispatch(trip, onDispatch)} loading={actioning} style={s.action} />
      ) : null}

      {trip.canRelease ? (
        <Button
          label="Confirm request"
          onPress={() => confirmRequest(trip, onRelease, onReject)}
          loading={actioning}
          style={s.action}
        />
      ) : trip.status === 'Requested' ? (
        <Button label="Reject" onPress={() => onReject(trip)} loading={actioning} variant="outline" style={s.action} />
      ) : trip.status === 'Dispatched' ? (
        <Button label="End Trip" onPress={() => onReceive(trip.name)} loading={actioning} variant="outline" style={s.action} />
      ) : trip.turnaround ? (
        <View style={s.turnaround}>
          <Text style={s.turnaroundLbl}>Turnaround</Text>
          <Text style={s.turnaroundVal}>{trip.turnaround}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  pressed: { opacity: 0.85 },
  hd: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { flex: 1, fontFamily: fontFamily.bold, fontSize: fontSize.md, color: COLORS.text },
  meta: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted, marginTop: 2 },
  requested: {
    alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: borderRadius.full,
    borderWidth: 1, borderColor: COLORS.border, fontFamily: fontFamily.medium, fontSize: 11, color: COLORS.textSecondary,
  },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md, rowGap: 2, marginTop: spacing.sm },
  kpi: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textSecondary },
  kpiVal: { fontFamily: fontFamily.bold, color: COLORS.text },
  kpiSub: { color: COLORS.textMuted },
  over: { color: OVER },
  track: { height: 8, borderRadius: 4, backgroundColor: COLORS.bgMuted, overflow: 'hidden', marginTop: 6 },
  fill: { height: '100%', borderRadius: 4 },
  farms: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  farmChip: {
    borderRadius: borderRadius.full, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.bgMuted, paddingHorizontal: 8, paddingVertical: 2,
  },
  farmTxt: { fontFamily: fontFamily.medium, fontSize: 11, color: COLORS.textSecondary },
  farmN: { fontFamily: fontFamily.bold, color: COLORS.text },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, gap: spacing.sm },
  viewBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  viewTxt: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: COLORS.text },
  action: { marginTop: spacing.md },
  turnaround: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border,
  },
  turnaroundLbl: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  turnaroundVal: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: COLORS.success },
});
