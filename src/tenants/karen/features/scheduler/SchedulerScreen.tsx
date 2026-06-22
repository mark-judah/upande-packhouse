import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/src/core/ui/Screen';
import { Card } from '@/src/core/ui/Card';
import { DateSelector } from '@/src/core/ui/DateSelector';
import { tomorrowISO } from '@/src/core/date';
import {
  useKarenSchedulerStore,
  STAGES,
  type SchedulerOrder,
} from '@/src/tenants/karen/state/karen-scheduler-store';
import { COLORS, borderRadius, fontFamily, fontSize, spacing } from '@/src/core/theme';

// Stage → colour, matching the bucket-logistics dashboard.
const STAGE_COLOR: Record<string, string> = {
  'Awaiting Transfer': '#b45309',
  'Loaded in Trolley': '#0891b2',
  'In Transit': '#7c3aed',
  Shelved: '#0369a1',
  'Ready for Packing': '#ca8a04',
  Issued: '#16a34a',
};
const STAGE_SHORT: Record<string, string> = {
  'Awaiting Transfer': 'Awaiting',
  'Loaded in Trolley': 'Trolley',
  'In Transit': 'Transit',
  Shelved: 'Shelved',
  'Ready for Packing': 'Ready',
  Issued: 'Issued',
};

export function KarenSchedulerScreen() {
  const { loading, error, date, orders, load, setDate } = useKarenSchedulerStore();

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Screen title="Scheduler">
      <Card title="Delivery day">
        <DateSelector
          value={date}
          onChange={setDate}
          label="Delivery date"
          maxDate={null}
          resetTo={tomorrowISO()}
          resetLabel="Tomorrow"
        />
        <Text style={s.helper}>
          {loading
            ? 'Loading…'
            : `${orders.length} order${orders.length === 1 ? '' : 's'} · in processing order`}
        </Text>
        {error ? <Text style={s.err}>{error}</Text> : null}
      </Card>

      {orders.map((o) => (
        <OrderRow key={o.oplName} order={o} />
      ))}

      {!loading && orders.length === 0 && !error ? (
        <Card><Text style={s.helper}>No orders for this delivery date.</Text></Card>
      ) : null}
    </Screen>
  );
}

function OrderRow({ order }: { order: SchedulerOrder }) {
  const badges = STAGES.filter((st) => (order.stages[st] || 0) > 0);

  return (
    <View style={s.row}>
      <View style={s.left}>
        {order.scheduleNumber ? (
          <Text style={s.seq}>{order.scheduleNumber}</Text>
        ) : (
          <Text style={s.seqNone}>—</Text>
        )}
      </View>

      <View style={s.body}>
        <View style={s.titleLine}>
          <Text style={s.orderName} numberOfLines={1}>{order.orderName}</Text>
          {order.packed ? <Text style={s.packed}>packed</Text> : null}
        </View>
        <Text style={s.sub} numberOfLines={1}>
          {[order.customer, order.team].filter(Boolean).join('  ·  ')}
        </Text>

        {order.specs.length > 0 ? (
          <View style={s.specs}>
            {order.specs.map((sp, i) => (
              <View key={`${sp.spec}-${i}`} style={s.specRow}>
                <Text style={s.specText} numberOfLines={1}>
                  {sp.spec || sp.variety}
                </Text>
                <Text style={s.specBoxes}>{sp.boxes} {sp.boxes === 1 ? 'box' : 'boxes'}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={s.badges}>
          {badges.length === 0 ? (
            <Text style={s.sub}>No buckets allocated</Text>
          ) : (
            badges.map((st) => (
              <View key={st} style={[s.badge, { backgroundColor: STAGE_COLOR[st] }]}>
                <Text style={s.badgeText}>{STAGE_SHORT[st]} {order.stages[st]}</Text>
              </View>
            ))
          )}
        </View>

        <View style={s.statChips}>
          <Stat label="stems" value={order.totalStems.toLocaleString()} />
          <Stat label="boxes" value={String(order.boxes)} />
          <Stat label="stems/box" value={order.packrate ? String(order.packrate) : '—'} />
          <Stat label="buckets" value={String(order.buckets)} />
          <Stat label="issuing" value={`${order.issuingPct}%`} />
        </View>
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  helper: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, marginTop: spacing.xs },
  err: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: '#dc2626', marginTop: spacing.xs },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  left: { alignItems: 'center', justifyContent: 'center', width: 32, alignSelf: 'stretch' },
  seq: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.lg,
    color: COLORS.primary,
  },
  seqNone: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: COLORS.textMuted },

  body: { flex: 1, minWidth: 0 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orderName: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  packed: { fontFamily: fontFamily.bold, fontSize: 10, color: '#16a34a' },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, marginTop: 1 },
  specs: { marginTop: 6, gap: 2 },
  specRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  specText: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: COLORS.text },
  specBoxes: { fontFamily: fontFamily.medium, fontSize: 10, color: COLORS.textSecondary },

  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  badge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontFamily: fontFamily.bold, fontSize: 10, color: '#fff' },

  statChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: 8 },
  stat: { alignItems: 'flex-start' },
  statValue: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: COLORS.text },
  statLabel: { fontFamily: fontFamily.regular, fontSize: 9, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
});
