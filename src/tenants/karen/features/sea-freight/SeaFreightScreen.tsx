import { useCallback, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

/** Buckets scanned in so far, per order: kept while the app is open, so leaving the screen loses none. */
const scannedByOrder: Record<string, string[]> = {};

/** Open sea freight orders. Once the farm marks one harvested, scanning its buckets receives them; with every bucket
 *  in, Create pick list makes its pick lists, issued, and Pack opens them on the Packing screen. */
export function KarenSeaFreightScreen() {
  const [orders, setOrders] = useState<SeaFreightOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState<Record<string, string[]>>({ ...scannedByOrder });
  const [saving, setSaving] = useState<string | null>(null);
  const scanRef = useRef<ScanFieldHandle>(null);
  const { showSuccess, showError } = useToast();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

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
  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const toReceive = orders.filter((o) => o.harvestDone && !o.received);

  // a scan receives the bucket; the order's last bucket takes the order in
  const onScan = async (raw: string) => {
    const id = bucketFromScan(raw);
    scanRef.current?.clear();
    if (!id) {
      showError('That is not a bucket QR code.');
      return;
    }
    const o = toReceive.find((x) => x.buckets.some((b) => b.bucket === id));
    if (!o) {
      showError(`Bucket ${id} is not on a harvested sea freight order.`);
      return;
    }
    const mine = scannedByOrder[o.name] ?? [];
    if (mine.includes(id)) {
      showError(`Bucket ${id} is already received.`);
      return;
    }
    const next = [...mine, id];
    scannedByOrder[o.name] = next;
    setScanned({ ...scannedByOrder });
    const allIn = o.buckets.every((b) => next.includes(b.bucket));
    showSuccess(allIn ? `${id} received · every bucket in` : `${id} received · ${next.length} / ${o.buckets.length}`);
  };

  // every bucket in: the order's pick lists are made (issued, ready to pack)
  const createPickList = async (o: SeaFreightOrder) => {
    const next = scannedByOrder[o.name] ?? [];
    setSaving(o.name);
    try {
      const r = await karenSeaFreightApi.receive(o.name, next);
      delete scannedByOrder[o.name];
      setScanned({ ...scannedByOrder });
      showSuccess(`${o.orderName || o.name}: ${r.pickLists.length} pick list${r.pickLists.length === 1 ? '' : 's'} ready to pack.`);
      await load();
    } catch (err) {
      showError(mapAxiosError(err).message);
    } finally {
      setSaving(null);
    }
  };

  const pack = (o: SeaFreightOrder) => {
    const opl = o.pickLists[0] ?? o.pickList;
    if (!opl) return;
    router.push({ pathname: '/packing', params: { opl, date: o.deliveryDate, t: String(Date.now()) } } as never);
  };

  return (
    <Screen
      title="Sea Freight"
      loading={loading && orders.length === 0}
      error={error}
      onRetry={load}
      scroll={false}
      contentPadded={false}
    >
      {/* the scan stays put at the top; only the orders scroll under it */}
      {toReceive.length || (!loading && !error && orders.length === 0) ? (
        <View style={s.pinned}>
          {!loading && !error && orders.length === 0 ? <Alert tone="info">No open sea freight orders.</Alert> : null}
          {toReceive.length ? (
            <ScanField ref={scanRef} label="Scan bucket to receive" onScan={onScan} autoFocus placeholder="Scan bucket QR" />
          ) : null}
        </View>
      ) : null}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.list, { paddingBottom: spacing.xxl + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.text} colors={[COLORS.text]} />}
      >
      {orders.map((o) => (
        <View key={o.name} style={s.order}>
          <View style={s.head}>
            {o.sequence > 0 ? (
              <View style={s.seqBadge}>
                <Text style={s.seqNum}>{`#${o.sequence}`}</Text>
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{o.orderName || o.customer}</Text>
              <Text style={s.sub}>
                {[o.orderName ? o.customer : '', o.team, `Delivery ${o.deliveryDate}`].filter(Boolean).join(' · ')}
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

          {o.items.filter((l) => l.harvestedStems > 0).map((l) => (
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

          {o.harvestDone && !o.received ? (
            <>
              <Received order={o} scanned={scanned[o.name] ?? []} />
              {o.buckets.length > 0 && o.buckets.every((b) => (scanned[o.name] ?? []).includes(b.bucket)) ? (
                <View style={{ marginTop: spacing.sm }}>
                  <Button
                    label="Create pick list"
                    iconLeft="clipboard-outline"
                    onPress={() => createPickList(o)}
                    loading={saving === o.name}
                  />
                </View>
              ) : null}
            </>
          ) : o.received ? (
            <View style={{ marginTop: spacing.sm }}>
              <Button label="Pack" iconLeft="cube-outline" onPress={() => pack(o)} disabled={!o.pickLists.length} />
            </View>
          ) : null}
        </View>
      ))}
      </ScrollView>
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

/** The order's buckets, ticked as they are scanned in. */
function Received({ order, scanned }: { order: SeaFreightOrder; scanned: string[] }) {
  const expected = order.buckets;
  return (
    <View style={s.receive}>
      <Text style={s.receiveTitle}>{`Received ${scanned.length} / ${expected.length} buckets`}</Text>
      {expected.map((b) => {
        const done = scanned.includes(b.bucket);
        return (
          <View key={b.bucket} style={s.bucket}>
            <Ionicons
              name={done ? 'checkmark-circle' : 'ellipse-outline'}
              size={18}
              color={done ? COLORS.success : COLORS.textMuted}
            />
            <Text style={[s.bucketText, done && { color: COLORS.text }]}>
              {[b.bucket, b.itemCode, `${fmt(b.stems)} stems`, b.greenhouse].filter(Boolean).join(' · ')}
            </Text>
          </View>
        );
      })}
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
  pinned: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
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
  seqBadge: {
    minWidth: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.text,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  seqNum: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: '#FFFFFF' },
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
