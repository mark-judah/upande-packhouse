import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  LayoutAnimation,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type ScrollViewInstance,
  type TextInputInstance,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Screen } from '@/src/core/ui/Screen';
import { Card, Alert } from '@/src/core/ui/Card';
import { Button } from '@/src/core/ui/Button';
import { Dialog } from '@/src/core/ui/Dialog';
import { Skeleton } from '@/src/core/ui/Skeleton';
import { DateSelector } from '@/src/core/ui/DateSelector';
import { Segmented } from '@/src/core/ui/Segmented';
import { useUserStation } from '@/src/core/tenant/user-station';
import { tomorrowISO } from '@/src/core/date';
import { useToast } from '@/src/core/ui/Toast';
import { useKarenDispatchStore } from '@/src/tenants/karen/state/karen-dispatch-store';
import { COLORS, fontFamily, fontSize, spacing, borderRadius } from '@/src/core/theme';

// Dispatch is a read-only confirmation clipboard, not a form: it shows what
// the day's orders required vs what actually got loaded, then a single final
// "Confirm dispatch" action -- once confirmed the Loading Sheet is marked
// Departed server-side and this screen locks (see karen-dispatch-store.save).
export function KarenDispatchScreen() {
  const {
    loading,
    saving,
    selectedDate,
    deliveryDate,
    orders,
    totalBoxes,
    totalRequired,
    dispatched,
    savedSealNumber,
    sealNumberInput,
    missingBoxes,
    lastOutcome,
    loadOrders,
    setSealNumberInput,
    rememberSeal,
    save,
    setDate,
    reset,
    location,
    locations,
    setLocation,
    initLocation,
    trucks,
    vehicle,
    setVehicle,
  } = useKarenDispatchStore();
  const { showSuccess, showError } = useToast();
  const { station } = useUserStation();
  const farm = station?.userFarm ?? '';

  // Orders load once a location is picked (remembered, else the station's farm's):
  // dispatch never mixes Ravine's and Karen's orders.
  useEffect(() => {
    initLocation(farm);
    return () => reset();
  }, [farm, initLocation, reset]);

  // Refresh the loaded-orders list whenever the screen regains focus.
  useFocusEffect(
    useCallback(() => {
      if (useKarenDispatchStore.getState().location) loadOrders();
    }, [loadOrders]),
  );

  const [confirmOpen, setConfirmOpen] = useState(false);
  // The dialog's Confirm stays solid black; pressing it without a seal marks the field.
  const [sealMissing, setSealMissing] = useState(false);

  // The selected truck scrolls to the middle of the strip, whoever picked it.
  const truckStripRef = useRef<ScrollViewInstance>(null);
  const truckStripWidth = useRef(0);
  const truckLayout = useRef<Record<string, { x: number; width: number }>>({});
  const centreTruck = useCallback((v: string) => {
    const at = truckLayout.current[v];
    if (!at || !truckStripRef.current) return;
    const x = Math.max(0, at.x + at.width / 2 - truckStripWidth.current / 2);
    truckStripRef.current.scrollTo({ x, animated: true });
  }, []);
  // Switching trucks fades the clipboard in again so the change is visible.
  const [swap] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (vehicle) centreTruck(vehicle);
    swap.setValue(0);
    Animated.timing(swap, { toValue: 1, duration: 280, useNativeDriver: true }).start();
  }, [vehicle, centreTruck, swap]);
  const pickTruck = (v: string) => {
    if (v === vehicle) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    void setVehicle(v);
  };

  // Two steps in the dialog: type the seal, then Yes / No on that seal.
  const [askSure, setAskSure] = useState(false);

  // Focus the seal field once the dialog is up, filled or not. autoFocus fires before
  // the Modal's fade-in ends and, with a remembered seal already in the field, Android
  // then treats the later focus() as a no-op and never raises the keyboard: blur first
  // so the focus is always a fresh one.
  const sealRef = useRef<TextInputInstance>(null);
  useEffect(() => {
    if (!confirmOpen || askSure) return;
    const t = setTimeout(() => {
      sealRef.current?.blur();
      sealRef.current?.focus();
    }, 300);
    return () => clearTimeout(t);
  }, [confirmOpen, askSure]);

  const toSure = () => {
    if (!sealNumberInput.trim()) {
      setSealMissing(true);
      return;
    }
    void rememberSeal();
    setAskSure(true);
  };

  const doConfirm = async () => {
    const outcome = await save();
    setConfirmOpen(false);
    if (outcome.kind === 'success') showSuccess(outcome.message);
    else showError(outcome.message);
    loadOrders();
  };

  // The seal is entered in the confirm dialog itself, not a separate field on the page.
  const onConfirmPress = () => {
    setSealMissing(false);
    setAskSure(false);
    setConfirmOpen(true);
  };
  const confirmSummary =
    `${vehicle ? `${vehicle}: ` : ''}${orders.length} order${orders.length === 1 ? '' : 's'} · ` +
    `${totalBoxes} box${totalBoxes === 1 ? '' : 'es'} for ${deliveryDate || selectedDate}. ` +
    'Once confirmed, dispatch is final and cannot be undone.';

  // The boxes still to load take at most a fifth of the screen; the clipboard gets the rest.
  const { height } = useWindowDimensions();
  const missingMax = Math.max(96, height * 0.2);

  const canConfirm =
    !saving && !loading && orders.length > 0 && missingBoxes.length === 0;

  return (
    <Screen
      title="Dispatch"
      // The page itself never scrolls: the cards fit the screen and the clipboard
      // and the boxes still to load scroll inside their own cards, on any phone size.
      scroll={false}
      // The screen's default bottom padding left a gap between the clipboard and the
      // Confirm bar; this page sets its own so the clipboard runs down to the bar.
      contentPadded={false}
      footer={
        dispatched ? null : (
          <View>
            <Button
              label={saving ? 'Dispatching…' : 'Dispatch'}
              onPress={onConfirmPress}
              disabled={!canConfirm}
            />
            {missingBoxes.length > 0 ? (
              <Text style={s.blockedHint}>
                Load the {missingBoxes.length} box{missingBoxes.length === 1 ? '' : 'es'} to dispatch
              </Text>
            ) : null}
          </View>
        )
      }
    >
      <View style={s.body}>
      <Card style={s.compactCard}>
        {farm ? null : (
          <View style={s.locationRow}>
            <Segmented
              value={location || locations[0] || ''}
              options={locations.map((l) => ({ value: l, label: l }))}
              onChange={(v) => void setLocation(v)}
            />
          </View>
        )}
        <DateSelector
          value={selectedDate}
          onChange={(d) => { if (d !== selectedDate) setDate(d); }}
          label="Delivery date"
          compact
          showDate
          maxDate={null}
          resetTo={tomorrowISO()}
          resetLabel="Tomorrow"
        />
      </Card>

      {loading && trucks.length === 0 ? (
        <Card title="Truck" style={s.compactCard}>
          <View style={s.truckSkeletons}>
            <Skeleton height={40} radius={borderRadius.md} style={s.flex} />
            <Skeleton height={40} radius={borderRadius.md} style={s.flex} />
          </View>
        </Card>
      ) : null}

      {trucks.length > 0 ? (
        <Card title="Truck" style={s.compactCard}>
          <ScrollView
            ref={truckStripRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.truckStrip}
            onLayout={(e) => { truckStripWidth.current = e.nativeEvent.layout.width; }}
          >
          {trucks.map((t) => {
            const active = t.vehicle === vehicle;
            return (
              <TouchableOpacity
                key={t.vehicle}
                style={[
                  s.truckRow,
                  t.dispatched && s.truckRowGone,
                  active && (t.dispatched ? s.truckRowGoneActive : s.truckRowActive),
                ]}
                onPress={() => pickTruck(t.vehicle)}
                onLayout={(e) => {
                  const { x, width } = e.nativeEvent.layout;
                  truckLayout.current[t.vehicle] = { x, width };
                  if (active) centreTruck(t.vehicle);
                }}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="truck-outline"
                  size={22}
                  color={active ? '#fff' : t.dispatched ? '#16a34a' : COLORS.text}
                />
                <View style={s.truckText}>
                  <Text style={[s.truckName, active && s.truckTextActive]}>{t.vehicle}</Text>
                  <Text style={[s.truckSub, active && s.truckTextActive]}>
                    {t.boxesLoaded} box{t.boxesLoaded === 1 ? '' : 'es'} {t.dispatched ? 'dispatched' : 'loaded'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
          </ScrollView>
        </Card>
      ) : null}

      {dispatched ? (
        <Card style={s.compactCard}>
          <View style={s.dispatchedBanner}>
            <MaterialCommunityIcons name="check-circle" size={22} color="#16a34a" />
            <View style={{ flex: 1 }}>
              <Text style={s.dispatchedTitle}>Dispatched{vehicle ? ` · ${vehicle}` : ''}</Text>
              <Text style={s.helper}>
                Seal number {savedSealNumber || '—'} · {totalBoxes} box{totalBoxes === 1 ? '' : 'es'} loaded
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      {!dispatched && missingBoxes.length > 0 ? (
        <Card style={s.compactCard}>
          <Text style={s.missingHelper}>
            Load the {missingBoxes.length} box{missingBoxes.length === 1 ? '' : 'es'} to dispatch
          </Text>
          <ScrollView style={{ maxHeight: missingMax }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {missingBoxes.map((b) => (
              <View key={b.boxLabel} style={s.missingRow}>
                <MaterialCommunityIcons name="package-variant-closed" size={16} color="#dc2626" />
                <View style={{ flex: 1 }}>
                  <Text style={s.missingBoxName} numberOfLines={1}>
                    Box {b.boxNumber} · {b.customer || '—'}
                  </Text>
                  <View style={s.missingSubRow}>
                    <MaterialCommunityIcons name="map-marker-outline" size={13} color="#92400e" />
                    <Text style={s.missingLocationText} numberOfLines={1}>
                      {b.stagingLocation || 'No location'}
                    </Text>
                    {b.deliveryPoint ? (
                      <Text style={s.missingBoxSub} numberOfLines={1}>
                        ·  {b.deliveryPoint}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>
        </Card>
      ) : null}

      {lastOutcome?.kind === 'error' ? (
        <Alert tone="danger">{lastOutcome.message}</Alert>
      ) : null}

      <Dialog
        visible={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        busy={saving}
        icon={{ name: 'car-outline', tone: 'warn' }}
        title={askSure ? `Dispatch ${vehicle || location} with seal ${sealNumberInput.trim()}?` : 'Confirm dispatch?'}
        subtitle={confirmSummary}
        actions={
          askSure ? (
            <>
              <Button
                label="No"
                variant="outline"
                size="sm"
                onPress={() => setAskSure(false)}
                disabled={saving}
                style={s.flex}
              />
              <Button label="Yes" onPress={doConfirm} loading={saving} size="sm" style={s.flex} />
            </>
          ) : (
            <>
              <Button
                label="Cancel"
                variant="outline"
                size="sm"
                onPress={() => setConfirmOpen(false)}
                style={s.flex}
              />
              <Button label="Confirm dispatch" onPress={toSure} size="sm" style={s.flex} />
            </>
          )
        }
      >
        {askSure ? null : (
          <TextInput
            ref={sealRef}
            value={sealNumberInput}
            onChangeText={(v) => {
              setSealNumberInput(v);
              if (v.trim()) setSealMissing(false);
            }}
            placeholder="Seal number"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="characters"
            showSoftInputOnFocus
            onSubmitEditing={toSure}
            style={[s.sealInput, sealMissing && s.sealInputMissing]}
          />
        )}
      </Dialog>

      <Animated.View
        style={[
          s.clipboardWrap,
          { opacity: swap, transform: [{ translateY: swap.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] },
        ]}
      >
      <Card style={s.clipboard}>
        <View style={s.summaryRow}>
          {loading && orders.length === 0 ? (
            <Skeleton width="60%" height={18} />
          ) : (
            <Text style={s.summary}>
              {orders.length} order{orders.length === 1 ? '' : 's'} · {totalBoxes}/{totalRequired} box
              {totalRequired === 1 ? '' : 'es'} loaded
            </Text>
          )}
          {deliveryDate ? <Text style={s.date}>{deliveryDate}</Text> : null}
        </View>
        <View style={s.tableHead}>
          <Text style={[s.th, { flex: 1 }]}>Order</Text>
          <Text style={s.thNum}>Req.</Text>
          <Text style={s.thNum}>Loaded</Text>
        </View>
        <FlatList
          style={s.flex}
          showsVerticalScrollIndicator={false}
          data={orders}
          keyExtractor={(o) => o.salesOrder || o.orderName}
          refreshControl={
            <RefreshControl refreshing={loading && orders.length > 0} onRefresh={loadOrders} tintColor={COLORS.text} colors={[COLORS.text]} />
          }
          ListEmptyComponent={
            loading ? (
              <View>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <View key={i} style={s.orderRow}>
                    <View style={[s.flex, s.skeletonLines]}>
                      <Skeleton width="70%" height={14} />
                      <Skeleton width="45%" height={10} />
                    </View>
                    <Skeleton width={28} height={14} />
                    <Skeleton width={56} height={18} radius={10} />
                  </View>
                ))}
              </View>
            ) : (
              <Text style={s.helper}>No orders planned for this delivery date.</Text>
            )
          }
          renderItem={({ item: o }) => {
            const complete = o.boxesRequired > 0 && o.boxesLoaded >= o.boxesRequired;
            const short = o.boxesRequired > 0 && o.boxesLoaded < o.boxesRequired;
            return (
              <View style={s.orderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.orderName} numberOfLines={1}>
                    {[o.customer, o.deliveryPoint].filter(Boolean).join('  ·  ')}
                  </Text>
                  <Text style={s.orderSub} numberOfLines={1}>
                    {[o.orderName, o.farm].filter(Boolean).join('  ·  ')}
                  </Text>
                </View>
                <Text style={s.tdNum}>{o.boxesRequired}</Text>
                <View style={[s.boxTag, complete && s.boxTagDone, short && s.boxTagShort]}>
                  <Text style={[s.boxTagText, (complete || short) && s.boxTagTextAlt]}>
                    {o.boxesLoaded}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      </Card>
      </Animated.View>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  compactCard: { paddingVertical: spacing.sm },
  locationRow: { marginBottom: spacing.xs },
  body: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  clipboardWrap: { flex: 1, minHeight: 0 },
  truckSkeletons: { flexDirection: 'row', gap: spacing.sm },
  skeletonLines: { gap: 6 },
  clipboard: { flex: 1, minHeight: 0, marginBottom: 0 },
  truckRow: {
    flexGrow: 1,
    minWidth: 150,
    justifyContent: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: borderRadius.md,
  },
  // Few trucks share the full width; more than fit scroll sideways.
  truckStrip: { gap: spacing.sm, flexGrow: 1 },
  truckRowGone: { borderColor: '#16a34a' },
  // The selected truck is filled (black, or green once dispatched); the rest stay white.
  truckRowActive: { borderColor: COLORS.text, backgroundColor: COLORS.text },
  truckRowGoneActive: { borderColor: '#16a34a', backgroundColor: '#16a34a' },
  truckTextActive: { color: '#fff' },
  truckText: { alignItems: 'flex-start' },
  truckName: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: COLORS.text },
  truckSub: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: COLORS.textSecondary },
  helper: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: COLORS.textMuted,
    marginTop: spacing.xs,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summary: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: COLORS.text },
  date: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted },

  tableHead: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  th: { fontFamily: fontFamily.semiBold, fontSize: 10, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  thNum: { width: 56, textAlign: 'right', fontFamily: fontFamily.semiBold, fontSize: 10, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },

  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  orderName: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: COLORS.text },
  orderSub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textSecondary, marginTop: 3 },
  tdNum: { width: 56, textAlign: 'right', fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.textSecondary },

  boxTag: {
    width: 56,
    alignItems: 'center',
    backgroundColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  boxTagDone: { backgroundColor: '#16a34a' },
  boxTagShort: { backgroundColor: '#dc2626' },
  boxTagText: { fontFamily: fontFamily.bold, fontSize: 11, color: COLORS.textSecondary },
  boxTagTextAlt: { color: '#fff' },

  dispatchedBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dispatchedTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: '#16a34a' },

  missingHelper: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: '#991b1b' },
  missingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  missingBoxName: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: COLORS.text },
  missingSubRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  missingBoxSub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textSecondary, flexShrink: 1 },
  missingLocationText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: '#92400e', flexShrink: 1 },

  sealInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.md,
    color: COLORS.text,
  },
  sealInputMissing: { borderColor: '#dc2626' },
  blockedHint: {
    marginTop: spacing.xs,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
});
