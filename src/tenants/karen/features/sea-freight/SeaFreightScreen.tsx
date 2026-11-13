import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Screen } from '@/src/core/ui/Screen';
import { Alert } from '@/src/core/ui/Card';
import { Button } from '@/src/core/ui/Button';
import { ProgressBar } from '@/src/core/ui/ProgressBar';
import { COLORS, borderRadius, fontFamily, fontSize, spacing } from '@/src/core/theme';
import { mapAxiosError } from '@/src/core/api/client';
import { karenSeaFreightApi, type SeaFreightOrder } from '@/src/tenants/karen/api/karen-sea-freight-api';

const fmt = (n: number) => Math.round(n).toLocaleString();

/** Open sea freight orders: what was ordered, harvested for each order, received and packed; Pack opens the
 *  order's pick list on the Packing screen. */
export function KarenSeaFreightScreen() {
  const [orders, setOrders] = useState<SeaFreightOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await karenSeaFreightApi.orders();
      setOrders(next);
      setError(null);
    } catch (err) {
      setError(mapAxiosError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const pack = (o: SeaFreightOrder) => {
    if (!o.pickList) return;
    router.push({ pathname: '/packing', params: { opl: o.pickList, date: o.deliveryDate } } as never);
  };

  return (
    <Screen title="Sea Freight" loading={loading && orders.length === 0} error={error} onRetry={load} onRefresh={load}>
      {!loading && !error && orders.length === 0 ? <Alert tone="info">No open sea freight orders.</Alert> : null}
      {orders.map((o) => (
        <View key={o.name} style={s.order}>
          <Text style={s.title} numberOfLines={1}>{o.customer}</Text>
          <Text style={s.sub}>{`${o.name} · Delivery ${o.deliveryDate}`}</Text>

          <View style={s.totals}>
            <Total label="Ordered" value={o.orderedStems} />
            <Total label="Harvested" value={o.harvestedStems} />
            <Total label="Received" value={o.receivedStems} />
            <Total label="Packed" value={o.packedStems} />
          </View>

          {o.items.map((l) => (
            <View key={l.name} style={s.line}>
              <View style={s.lineHead}>
                <Text style={s.lineTitle} numberOfLines={1}>
                  {[l.itemName, l.stemLength].filter(Boolean).join(' · ')}
                </Text>
                <Text style={s.lineQty}>{`${fmt(l.harvestedStems)} / ${fmt(l.orderedStems)}`}</Text>
              </View>
              <ProgressBar value={l.orderedStems > 0 ? l.harvestedStems / l.orderedStems : 0} />
              <Text style={s.meta}>{`${fmt(l.receivedStems)} received`}</Text>
            </View>
          ))}

          <View style={{ marginTop: spacing.sm }}>
            {o.pickList ? (
              <Button label="Pack" iconLeft="cube-outline" onPress={() => pack(o)} />
            ) : (
              <Text style={s.meta}>No pick list yet</Text>
            )}
          </View>
        </View>
      ))}
    </Screen>
  );
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <View style={s.total}>
      <Text style={s.totalValue}>{fmt(value)}</Text>
      <Text style={s.totalLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  order: {
    backgroundColor: COLORS.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textSecondary },
  totals: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.sm },
  total: { flex: 1, backgroundColor: COLORS.surfaceAlt, borderRadius: borderRadius.sm, paddingVertical: spacing.sm, alignItems: 'center' },
  totalValue: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  totalLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border, paddingTop: spacing.sm, gap: 4 },
  lineHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lineTitle: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.text },
  lineQty: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  meta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
});
