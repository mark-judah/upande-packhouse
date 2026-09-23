import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Screen } from '@/src/core/ui/Screen';
import { Card, Alert } from '@/src/core/ui/Card';
import { DateSelector } from '@/src/core/ui/DateSelector';
import { tomorrowISO } from '@/src/core/date';
import { ScanField, type ScanFieldHandle } from '@/src/core/scanning/ScanField';
import { focusWhenReady } from '@/src/core/scanning/focus';
import { useToast } from '@/src/core/ui/Toast';
import { Button } from '@/src/core/ui/Button';
import { useUserStation } from '@/src/core/tenant/user-station';
import {
  useKarenLoadingStore,
  customersAtDeliveryPoint,
  deliveryPoints,
  isItemFullyLoaded,
  itemsForCustomerAtDeliveryPoint,
  summaryForDeliveryPoint,
  sumOrderTotals,
  type LoadingData,
  type LoadingPlanItem,
} from '@/src/tenants/karen/state/karen-loading-store';
import { COLORS, fontFamily, fontSize, spacing, borderRadius } from '@/src/core/theme';

export function KarenLoadingScreen() {
  const scanRef = useRef<ScanFieldHandle>(null);
  const [temperature, setTemperature] = useState('');
  const { showSuccess, showError, showInfo } = useToast();
  const { station, loaded: stationLoaded } = useUserStation();
  const farm = station?.userFarm ?? '';

  const {
    loading,
    vehicleLoading,
    loaded,
    data,
    selectedPlan,
    selectedVehicle,
    expandedDeliveryPoint,
    selectedDate,
    submitting,
    lastOutcome,
    loadInitial,
    selectPlan,
    reload,
    setDate,
    deselectVehicle,
    toggleDeliveryPoint,
    submitScan,
    reset,
  } = useKarenLoadingStore();

  useEffect(() => {
    if (farm) loadInitial(farm);
    return () => reset();
  }, [farm, loadInitial, reset]);

  const hasPlan = !!selectedPlan && !vehicleLoading && !!data?.hasLoadingPlan;

  useFocusEffect(
    useCallback(() => {
      if (hasPlan && !submitting) focusWhenReady(scanRef);
    }, [hasPlan, submitting]),
  );

  const announce = useCallback(
    (o: { kind: string; message?: string }) => {
      if (o.kind === 'success') showSuccess(o.message || 'Box loaded successfully');
      else if (o.kind === 'warning') showInfo(o.message || 'Check the scan and try again');
      else showError(o.message || 'Failed to record loading');
    },
    [showSuccess, showError, showInfo],
  );

  const onScan = async (raw: string) => {
    const temp = parseFloat(temperature.trim());
    const outcome = await submitScan(farm, raw, Number.isFinite(temp) ? temp : 0);
    announce(outcome);
    scanRef.current?.clear();
    if (hasPlan) focusWhenReady(scanRef);
  };

  // The device-wide farm/station config hydrates from storage asynchronously,
  // and this screen (unlike Issuing/Packing, which resolve farm server-side
  // from the logged-in Employee) depends on it client-side. Before it
  // resolves, `farm` reads as '' — which used to fall straight through to the
  // "couldn't load the day's loading plans" error below on every first open,
  // even though no fetch had actually been attempted yet. Show a neutral
  // spinner instead while station is still hydrating.
  if (!stationLoaded) {
    return (
      <Screen title="Loading Entry">
        <View style={s.centerPad}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      </Screen>
    );
  }

  // Station hydrated but no farm configured on this device -- send them to
  // configure it instead of showing a misleading "pull to refresh" error
  // that retrying can never fix.
  if (!farm) {
    return (
      <Screen title="Loading Entry">
        <Alert tone="warn">No farm configured on this device yet.</Alert>
        <View style={{ height: spacing.sm }} />
        <Button
          label="Configure station"
          onPress={() => router.push({ pathname: '/configure-station', params: { next: '/loading' } })}
        />
      </Screen>
    );
  }

  // Initial full-screen loader, before anything has arrived.
  if (loading && !loaded) {
    return (
      <Screen title="Loading Entry">
        <View style={s.centerPad}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen title="Loading Entry" onRefresh={() => reload(farm)}>
      {/* ── Delivery day ── */}
      <Card title="Delivery day">
        <DateSelector
          value={selectedDate}
          onChange={(d) => { if (d !== selectedDate) setDate(farm, d); }}
          label="Delivery date"
          maxDate={null}
          resetTo={tomorrowISO()}
          resetLabel="Tomorrow"
        />
      </Card>

      {/* Fetching a picked plan */}
      {vehicleLoading ? (
        <Card>
          <View style={s.inlineLoader}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={s.helper}>Loading plan…</Text>
          </View>
        </Card>
      ) : null}

      {/* ── Load failed: the fetch errored and left us with no data. Say so
             instead of showing a blank screen with no feedback. ── */}
      {!loading && !vehicleLoading && !data ? (
        <Alert tone="warn">
          {lastOutcome && lastOutcome.kind === 'error'
            ? lastOutcome.message
            : 'Couldn’t load the day’s loading plans. Pull down to refresh and try again.'}
        </Alert>
      ) : null}

      {/* ── No plan chosen: show the day's loading plans (each carries its truck) ── */}
      {!selectedPlan && !vehicleLoading && data ? (
        <AvailablePlans data={data} onPick={(planName) => selectPlan(farm, planName)} />
      ) : null}

      {/* ── Plan chosen but it didn't load ── */}
      {selectedPlan && !vehicleLoading && data && !data.hasLoadingPlan ? (
        <Alert tone="warn">
          Could not load plan {selectedPlan} for {data.deliveryDate || 'the delivery date'}.
        </Alert>
      ) : null}

      {/* ── Vehicle chosen, plan loaded ── */}
      {hasPlan && data ? (
        <>
          <TruckSummary data={data} vehicle={selectedVehicle || selectedPlan || ''} />

          <Pressable style={s.changeTruck} onPress={() => deselectVehicle(farm)} hitSlop={6}>
            <MaterialCommunityIcons name="swap-horizontal" size={16} color={COLORS.primary} />
            <Text style={s.changeTruckText}>Change truck / plan</Text>
          </Pressable>

          <Card title="Scan boxes">
            <TextInput
              value={temperature}
              onChangeText={(t) => setTemperature(t.replace(/[^\d.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="Temperature (°C)"
              placeholderTextColor={COLORS.textMuted}
              style={s.tempInput}
              editable={!submitting}
            />
            <View style={{ height: spacing.sm }} />
            <ScanField
              ref={scanRef}
              onScan={onScan}
              autoFocus={!submitting}
              editable={!submitting}
              placeholder="Scan box label"
            />
            {submitting ? <Text style={s.helper}>Submitting…</Text> : null}
          </Card>

          <Card title="Loading sequence">
            {deliveryPoints(data).map((dp, i) => (
              <DropOff
                key={dp}
                data={data}
                deliveryPoint={dp}
                index={i}
                expanded={expandedDeliveryPoint === dp}
                onToggle={() => toggleDeliveryPoint(dp)}
              />
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

// ── Available plans (no vehicle selected) ──────────────────────────────
function AvailablePlans({
  data,
  onPick,
}: {
  data: LoadingData;
  onPick: (planName: string) => void;
}) {
  if (data.availablePlans.length === 0) {
    return (
      <Alert tone="warn">
        No loading plans for {data.deliveryDate || 'the delivery date'}.
      </Alert>
    );
  }
  return (
    <Card title={`${data.availablePlans.length} plan${data.availablePlans.length === 1 ? '' : 's'} for ${data.deliveryDate || 'the delivery date'}`}>
      {data.availablePlans.map((plan) => {
        // The plan carries its own truck (custom_vehicle). Show the friendly
        // plate when we can resolve it, but ALWAYS pick by plan.vehicle so the
        // row works even when the vehicle isn't in the dispatch-truck list.
        const plate = data.vehicles.find((v) => v.name === plan.vehicle)?.licensePlate;
        return (
          <Pressable
            key={plan.name}
            style={s.planRow}
            onPress={() => onPick(plan.name)}
          >
            <MaterialCommunityIcons name="truck-outline" size={18} color={COLORS.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={s.planVehicle}>{plate || plan.vehicle || '—'}</Text>
              <Text style={s.planName} numberOfLines={1}>{plan.name}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={COLORS.textMuted} />
          </Pressable>
        );
      })}
    </Card>
  );
}

// ── Truck summary header ───────────────────────────────────────────────
function TruckSummary({ data, vehicle }: { data: LoadingData; vehicle: string }) {
  const stops = deliveryPoints(data).length;
  const loaded = data.totals.totalBoxesLoaded;
  const allocated = data.totals.totalBoxesAllocated;
  const plannedBoxes = data.planItems.reduce((sum, it) => sum + it.numberOfBoxes, 0);
  const progress = allocated > 0 ? Math.min(1, loaded / allocated) : 0;

  return (
    <View style={s.summary}>
      <View style={s.summaryHead}>
        <MaterialCommunityIcons name="truck" size={24} color="#fff" />
        <View style={{ flex: 1 }}>
          <Text style={s.summaryTitle}>{vehicle}  •  {data.deliveryDate || '—'}</Text>
          <Text style={s.summarySub}>
            {stops} drop-off{stops === 1 ? '' : 's'}  •  {plannedBoxes} planned  •  {loaded}/{allocated} loaded
          </Text>
        </View>
      </View>
      <View style={s.summaryTrack}>
        <View style={[s.summaryFill, { width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

// ── A drop-off point (delivery point) → customers → box types ──────────
function DropOff({
  data,
  deliveryPoint,
  index,
  expanded,
  onToggle,
}: {
  data: LoadingData;
  deliveryPoint: string;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const summary = summaryForDeliveryPoint(data, deliveryPoint);
  const done = summary.isFullyLoaded;
  const customers = useMemo(
    () => customersAtDeliveryPoint(data, deliveryPoint),
    [data, deliveryPoint],
  );

  return (
    <View style={s.stopWrap}>
      <Pressable style={s.stopHeader} onPress={onToggle}>
        <View style={[s.dot, done ? s.dotDone : expanded ? s.dotActive : null]}>
          {done ? (
            <MaterialCommunityIcons name="check" size={14} color="#fff" />
          ) : (
            <Text style={[s.dotText, expanded && s.dotTextActive]}>{index + 1}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.stopName, done && s.stopNameDone]} numberOfLines={1}>
            {deliveryPoint || '—'}
          </Text>
          <Text style={s.stopMeta}>
            {summary.customerCount} customer{summary.customerCount === 1 ? '' : 's'}  •  {summary.totalBoxes} boxes
          </Text>
        </View>
        <View style={[s.badge, done ? s.badgeDone : s.badgePending]}>
          <Text style={[s.badgeText, done && s.badgeTextDone]}>
            {done ? 'DONE' : `${summary.totalLoaded}/${summary.totalAllocated}`}
          </Text>
        </View>
        <MaterialCommunityIcons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={COLORS.textMuted}
        />
      </Pressable>

      {expanded ? (
        <View style={s.stopBody}>
          {customers.map((customer) => (
            <CustomerBlock
              key={customer}
              customer={customer}
              items={itemsForCustomerAtDeliveryPoint(data, customer, deliveryPoint)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function CustomerBlock({ customer, items }: { customer: string; items: LoadingPlanItem[] }) {
  // Dedupe by Sales Order, not a raw per-row sum — a customer can have
  // several rows at one stop (one per box type / a position split) that
  // all carry the same underlying order(s).
  const { allocated: totalAllocated, loaded: totalLoaded } = sumOrderTotals(items);
  const done = totalAllocated > 0 && totalLoaded >= totalAllocated;

  return (
    <View style={s.custBlock}>
      <View style={s.custHead}>
        <MaterialCommunityIcons
          name="account-outline"
          size={15}
          color={done ? '#16a34a' : COLORS.textSecondary}
        />
        <Text style={[s.custName, done && s.custNameDone]} numberOfLines={1}>
          {customer}
        </Text>
        {done ? (
          <MaterialCommunityIcons name="check-circle" size={16} color="#16a34a" />
        ) : (
          <Text style={s.custCount}>{totalLoaded}/{totalAllocated}</Text>
        )}
      </View>
      {items.map((item, i) => {
        const p = item.boxesAllocated > 0 ? Math.min(1, item.boxesLoaded / item.boxesAllocated) : 0;
        const itemDone = isItemFullyLoaded(item);
        // Order name + variety (or mix name, for a mixed box/bunch) behind
        // this row — usually one OPL, but the last row of a stop can absorb
        // more than one if a customer has more OPLs than plan rows (see
        // fetchLoadingData's per-OPL matching).
        const orderLines = item.orders.map((o) =>
          [o.orderName, o.isMixed && o.variety ? `${o.variety} (Mixed)` : o.variety]
            .filter(Boolean)
            .join(' · '),
        ).filter(Boolean);
        // Where to physically find the boxes still waiting to be loaded --
        // grouped by location (usually the same coldstore zone per stop) so
        // the operator doesn't have to hunt for each box number separately.
        const stagedByLocation = new Map<string, number>();
        for (const o of item.orders) {
          for (const b of o.stagedBoxes) {
            const loc = b.stagingLocation || 'Unknown location';
            stagedByLocation.set(loc, (stagedByLocation.get(loc) ?? 0) + 1);
          }
        }
        return (
          <View key={`${item.boxType}-${i}`} style={s.boxRowWrap}>
            <View style={s.boxRow}>
              {item.boxType ? (
                <View style={s.boxTag}>
                  <Text style={s.boxTagText}>{item.boxType}</Text>
                </View>
              ) : null}
              <Text style={s.boxQty}>
                {item.numberOfBoxes} box{item.numberOfBoxes === 1 ? '' : 'es'}
              </Text>
              <View style={s.boxTrack}>
                <View style={[s.boxFill, { width: `${p * 100}%` }, itemDone && s.boxFillDone]} />
              </View>
              <Text style={s.boxCount}>{item.boxesLoaded}/{item.boxesAllocated}</Text>
            </View>
            {orderLines.length > 0 ? (
              <Text style={s.boxOrderName} numberOfLines={1}>{orderLines.join(', ')}</Text>
            ) : null}
            {!itemDone && stagedByLocation.size > 0 ? (
              <View style={s.stagingRow}>
                <MaterialCommunityIcons name="map-marker-outline" size={12} color={COLORS.primary} />
                <Text style={s.stagingText} numberOfLines={1}>
                  {[...stagedByLocation.entries()]
                    .map(([loc, count]) => `${loc} (${count})`)
                    .join(', ')}
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  centerPad: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
  helper: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, marginTop: spacing.xs },
  inlineLoader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },

  changeTruck: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  changeTruckText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: COLORS.primary },

  // Available plans
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  planVehicle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  planName: { fontFamily: fontFamily.regular, fontSize: 10, color: COLORS.textMuted, marginTop: 1 },

  // Truck summary
  summary: { backgroundColor: COLORS.primary, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.md },
  summaryHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  summaryTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: '#fff' },
  summarySub: { fontFamily: fontFamily.regular, fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  summaryTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden', marginTop: spacing.sm },
  summaryFill: { height: '100%', backgroundColor: '#4ade80', borderRadius: 4 },

  // Drop-off
  stopWrap: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border, paddingVertical: spacing.xs },
  stopHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  dot: { width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  dotActive: { backgroundColor: COLORS.primary },
  dotDone: { backgroundColor: '#16a34a' },
  dotText: { fontFamily: fontFamily.bold, fontSize: 11, color: COLORS.textSecondary },
  dotTextActive: { color: '#fff' },
  stopName: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: COLORS.text },
  stopNameDone: { color: '#166534' },
  stopMeta: { fontFamily: fontFamily.regular, fontSize: 10, color: COLORS.textMuted, marginTop: 1 },

  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgePending: { backgroundColor: COLORS.border },
  badgeDone: { backgroundColor: '#16a34a' },
  badgeText: { fontFamily: fontFamily.bold, fontSize: 10, color: COLORS.textSecondary },
  badgeTextDone: { color: '#fff' },

  // Customers + box types
  stopBody: { paddingLeft: 32, paddingBottom: spacing.sm, gap: spacing.md },
  custBlock: { gap: 4 },
  custHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  custName: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: COLORS.text },
  custNameDone: { color: '#166534' },
  custCount: { fontFamily: fontFamily.bold, fontSize: 11, color: COLORS.textMuted },

  boxRowWrap: { gap: 2 },
  boxRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 21 },
  boxOrderName: {
    fontFamily: fontFamily.regular,
    fontSize: 9,
    color: COLORS.textMuted,
    paddingLeft: 21,
  },
  stagingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingLeft: 21, marginTop: 1,
  },
  stagingText: {
    fontFamily: fontFamily.medium,
    fontSize: 9,
    color: COLORS.primary,
    flex: 1,
  },
  boxTag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: '#eff6ff' },
  boxTagText: { fontFamily: fontFamily.semiBold, fontSize: 10, color: '#1d4ed8' },
  boxQty: { fontFamily: fontFamily.regular, fontSize: 10, color: COLORS.textMuted },
  boxTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: COLORS.border, overflow: 'hidden' },
  boxFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 2 },
  boxFillDone: { backgroundColor: '#16a34a' },
  boxCount: { fontFamily: fontFamily.regular, fontSize: 9, color: COLORS.textMuted, minWidth: 30, textAlign: 'right' },

  tempInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.md,
    color: COLORS.text,
  },
});
