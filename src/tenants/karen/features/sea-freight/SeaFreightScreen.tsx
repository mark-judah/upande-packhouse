import { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/core/ui/Screen';
import { Alert } from '@/src/core/ui/Card';
import { Button } from '@/src/core/ui/Button';
import { ProgressBar } from '@/src/core/ui/ProgressBar';
import { useToast } from '@/src/core/ui/Toast';
import { ScanField, type ScanFieldHandle } from '@/src/core/scanning/ScanField';
import { COLORS, borderRadius, fontFamily, fontSize, spacing } from '@/src/core/theme';
import { mapAxiosError } from '@/src/core/api/client';
import { karenSeaFreightApi, type SeaFreightOrder } from '@/src/tenants/karen/api/karen-sea-freight-api';

const fmt = (n: number) => Math.round(n).toLocaleString();

/** Bucket id from a scan: a bare id, {"bucket_id": …}, {"id": …} or the legacy {"<id>": "bucket"}. */
function bucketFromScan(raw: string): string {
  const t = (raw || '').trim();
  if (!t.startsWith('{')) return t;
  try {
    const p = JSON.parse(t) as Record<string, unknown>;
    if (typeof p.bucket_id === 'string') return p.bucket_id.trim();
    if (typeof p.id === 'string') return p.id.trim();
    for (const [k, v] of Object.entries(p)) if (v === 'bucket') return k;
  } catch {
    // not JSON after all
  }
  return '';
}

/** Open sea freight orders. Once the farm marks one harvested, Receive scans its buckets in: that makes its pick
 *  lists, issued, and Pack opens them on the Packing screen. */
export function KarenSeaFreightScreen() {
  const [orders, setOrders] = useState<SeaFreightOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [receiving, setReceiving] = useState<string | null>(null);

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
    const opl = o.pickLists[0] ?? o.pickList;
    if (!opl) return;
    router.push({ pathname: '/packing', params: { opl, date: o.deliveryDate } } as never);
  };

  return (
    <Screen title="Sea Freight" loading={loading && orders.length === 0} error={error} onRetry={load} onRefresh={load}>
      {!loading && !error && orders.length === 0 ? <Alert tone="info">No open sea freight orders.</Alert> : null}
      {orders.map((o) => (
        <View key={o.name} style={s.order}>
          <View style={s.head}>
            <View style={{ flex: 1 }}>
              <Text style={s.title} numberOfLines={1}>{o.orderName || o.customer}</Text>
              <Text style={s.sub}>
                {[o.orderName ? o.customer : '', o.name, `Delivery ${o.deliveryDate}`].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <StatusPill order={o} />
          </View>

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
            </View>
          ))}

          {receiving === o.name ? (
            <ReceivePanel
              order={o}
              onCancel={() => setReceiving(null)}
              onDone={() => {
                setReceiving(null);
                load();
              }}
            />
          ) : (
            <View style={{ marginTop: spacing.sm }}>
              {o.received ? (
                <Button label="Pack" iconLeft="cube-outline" onPress={() => pack(o)} disabled={!o.pickLists.length} />
              ) : o.harvestDone ? (
                <Button label="Receive" iconLeft="download-outline" onPress={() => setReceiving(o.name)} />
              ) : null}
            </View>
          )}
        </View>
      ))}
    </Screen>
  );
}

function StatusPill({ order }: { order: SeaFreightOrder }) {
  const [label, color] = order.received
    ? ['Received', COLORS.success]
    : order.harvestDone
      ? ['Ready to receive', COLORS.warn]
      : ['Harvesting', COLORS.textMuted];
  return (
    <View style={[s.pill, { borderColor: color }]}>
      <Text style={[s.pillText, { color }]}>{label}</Text>
    </View>
  );
}

/** Scan every bucket harvested for the order, then take it in. */
function ReceivePanel({ order, onCancel, onDone }: { order: SeaFreightOrder; onCancel: () => void; onDone: () => void }) {
  const { showSuccess, showError } = useToast();
  const scanRef = useRef<ScanFieldHandle>(null);
  const [scanned, setScanned] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const expected = order.buckets;
  const allIn = expected.length > 0 && expected.every((b) => scanned.includes(b.bucket));

  const onScan = (raw: string) => {
    const id = bucketFromScan(raw);
    scanRef.current?.clear();
    if (!id) {
      showError('That is not a bucket QR code.');
      return;
    }
    if (!expected.some((b) => b.bucket === id)) {
      showError(`Bucket ${id} was not harvested for this order.`);
      return;
    }
    if (scanned.includes(id)) {
      showError(`Bucket ${id} is already scanned.`);
      return;
    }
    setScanned((p) => [...p, id]);
  };

  const finish = async () => {
    setSaving(true);
    try {
      const r = await karenSeaFreightApi.receive(order.name, scanned);
      showSuccess(`${order.name} received: ${r.pickLists.length} pick list${r.pickLists.length === 1 ? '' : 's'} ready to pack.`);
      onDone();
    } catch (err) {
      showError(mapAxiosError(err).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={s.receive}>
      <Text style={s.receiveTitle}>{`Scan buckets · ${scanned.length} / ${expected.length}`}</Text>
      <ScanField ref={scanRef} onScan={onScan} autoFocus placeholder="Scan bucket QR" />
      {expected.map((b) => {
        const done = scanned.includes(b.bucket);
        return (
          <View key={b.bucket} style={s.bucket}>
            <Ionicons
              name={done ? 'checkmark-circle' : 'ellipse-outline'}
              size={18}
              color={done ? COLORS.success : COLORS.textMuted}
            />
            <Text style={[s.bucketText, done && { color: COLORS.text }]} numberOfLines={1}>
              {[b.bucket, b.itemCode, `${fmt(b.stems)} stems`, b.greenhouse].filter(Boolean).join(' · ')}
            </Text>
          </View>
        );
      })}
      <View style={s.actions}>
        <View style={{ flex: 1 }}>
          <Button label="Cancel" variant="outline" onPress={onCancel} disabled={saving} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Receive" iconLeft="checkmark" onPress={finish} loading={saving} disabled={!allIn} />
        </View>
      </View>
    </View>
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
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textSecondary },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  pillText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs },
  totals: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.sm },
  total: {
    flex: 1,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  totalValue: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  totalLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border, paddingTop: spacing.sm, gap: 4 },
  lineHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lineTitle: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.text },
  lineQty: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  receive: {
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  receiveTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  bucket: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bucketText: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
});
