import { useCallback, useEffect } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Screen } from '@/src/core/ui/Screen';
import { Card, Alert } from '@/src/core/ui/Card';
import { Button } from '@/src/core/ui/Button';
import { showDialog } from '@/src/core/ui/DialogHost';
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
    save,
    setDate,
    reset,
    location,
    locations,
    setLocation,
    initLocation,
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

  const doConfirm = async () => {
    const outcome = await save();
    if (outcome.kind === 'success') showSuccess(outcome.message);
    else showError(outcome.message);
    loadOrders();
  };

  // The app's own dialog (not the phone's plain alert), like every other confirm.
  const onConfirmPress = () => {
    const boxes = `${totalBoxes} box${totalBoxes === 1 ? '' : 'es'}`;
    const ords = `${orders.length} order${orders.length === 1 ? '' : 's'}`;
    showDialog(
      'Confirm dispatch?',
      `${ords} · ${boxes} for ${deliveryDate || selectedDate}, seal ${sealNumberInput.trim()}. ` +
        'Once confirmed, dispatch is final and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm dispatch', onPress: doConfirm },
      ],
      { name: 'car-outline', tone: 'warn' },
    );
  };

  const canConfirm =
    !saving && !loading && orders.length > 0 && !!sealNumberInput.trim() && missingBoxes.length === 0;

  return (
    <Screen title="Dispatch" onRefresh={loadOrders}>
      <Card title="Delivery day">
        {/* A station dispatches its own location only; the choice is for a device
            with no station set. */}
        {farm ? null : (
          <>
            <Text style={s.filterLabel}>Location</Text>
            <Segmented
              value={location || locations[0] || ''}
              options={locations.map((l) => ({ value: l, label: l }))}
              onChange={(v) => void setLocation(v)}
            />
          </>
        )}
        <DateSelector
          value={selectedDate}
          onChange={(d) => { if (d !== selectedDate) setDate(d); }}
          label="Delivery date"
          maxDate={null}
          resetTo={tomorrowISO()}
          resetLabel="Tomorrow"
        />
      </Card>

      {dispatched ? (
        <Card>
          <View style={s.dispatchedBanner}>
            <MaterialCommunityIcons name="check-circle" size={22} color="#16a34a" />
            <View style={{ flex: 1 }}>
              <Text style={s.dispatchedTitle}>Dispatched</Text>
              <Text style={s.helper}>
                Seal number {savedSealNumber || '—'} · {totalBoxes} box{totalBoxes === 1 ? '' : 'es'} loaded
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      {!dispatched && missingBoxes.length > 0 ? (
        <Card title="Boxes not loaded">
          <Text style={s.missingHelper}>
            {missingBoxes.length} staged box{missingBoxes.length === 1 ? '' : 'es'} for this delivery date{' '}
            {missingBoxes.length === 1 ? 'has' : 'have'} not been loaded onto the truck yet. Dispatch is
            blocked until every staged box is loaded.
          </Text>
          <View style={{ height: spacing.sm }} />
          {missingBoxes.map((b) => (
            <View key={b.boxLabel} style={s.missingRow}>
              <MaterialCommunityIcons name="package-variant-closed" size={16} color="#dc2626" />
              <View style={{ flex: 1 }}>
                <Text style={s.missingBoxName} numberOfLines={1}>
                  Box {b.boxNumber} · {b.customer || '—'}
                </Text>
                <Text style={s.missingBoxSub} numberOfLines={1}>
                  {[b.orderPickList, b.deliveryPoint].filter(Boolean).join('  ·  ')}
                </Text>
              </View>
              {b.stagingLocation ? (
                <View style={s.missingLocationTag}>
                  <MaterialCommunityIcons name="map-marker-outline" size={12} color="#92400e" />
                  <Text style={s.missingLocationText} numberOfLines={1}>{b.stagingLocation}</Text>
                </View>
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}

      <Card title="Dispatch clipboard">
        <View style={s.summaryRow}>
          <Text style={s.summary}>
            {orders.length} order{orders.length === 1 ? '' : 's'} · {totalBoxes}/{totalRequired} box
            {totalRequired === 1 ? '' : 'es'} loaded
          </Text>
          {deliveryDate ? <Text style={s.date}>{deliveryDate}</Text> : null}
        </View>
        <Text style={s.helper}>
          {loading
            ? 'Loading…'
            : 'What the day’s orders require vs what has actually been loaded onto the truck.'}
        </Text>

        <View style={{ height: spacing.sm }} />
        <View style={s.tableHead}>
          <Text style={[s.th, { flex: 1 }]}>Order</Text>
          <Text style={s.thNum}>Req.</Text>
          <Text style={s.thNum}>Loaded</Text>
        </View>

        {!loading && orders.length === 0 ? (
          <Text style={s.helper}>No orders planned for this delivery date.</Text>
        ) : (
          orders.map((o) => {
            const complete = o.boxesRequired > 0 && o.boxesLoaded >= o.boxesRequired;
            const short = o.boxesRequired > 0 && o.boxesLoaded < o.boxesRequired;
            return (
              <View key={o.salesOrder || o.orderName} style={s.orderRow}>
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
          })
        )}
      </Card>

      <Card title="Seal number">
        <Text style={s.helper}>The seal number on the truck, recorded once at dispatch.</Text>
        <View style={{ height: spacing.sm }} />
        <TextInput
          value={sealNumberInput}
          onChangeText={setSealNumberInput}
          placeholder="e.g. SL-102938"
          placeholderTextColor={COLORS.textMuted}
          editable={!dispatched}
          autoCapitalize="characters"
          style={[s.sealInput, dispatched && s.sealInputLocked]}
        />
      </Card>

      {!dispatched ? (
        <Card title="Confirm dispatch">
          <Text style={s.helper}>
            This is a one-time confirmation, not a form you can resave — once confirmed, dispatch
            for this date is final and cannot be edited again.
          </Text>
          <View style={{ height: spacing.sm }} />
          <Button
            label={saving ? 'Confirming…' : 'Confirm dispatch'}
            onPress={onConfirmPress}
            disabled={!canConfirm}
          />
          {missingBoxes.length > 0 ? (
            <Text style={s.blockedHint}>
              {missingBoxes.length} box{missingBoxes.length === 1 ? '' : 'es'} still need loading before you
              can confirm dispatch.
            </Text>
          ) : !sealNumberInput.trim() ? (
            <Text style={s.blockedHint}>Enter the seal number before confirming.</Text>
          ) : null}
        </Card>
      ) : null}

      {lastOutcome?.kind === 'error' ? (
        <Alert tone="danger">{lastOutcome.message}</Alert>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  filterLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: COLORS.textMuted,
    marginBottom: spacing.xs,
  },
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
  missingBoxSub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textSecondary, marginTop: 1 },
  missingLocationTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: 130,
  },
  missingLocationText: { fontFamily: fontFamily.semiBold, fontSize: 10, color: '#92400e', flexShrink: 1 },

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
  sealInputLocked: { backgroundColor: COLORS.bg, color: COLORS.textMuted },
  blockedHint: {
    marginTop: spacing.xs,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
});
