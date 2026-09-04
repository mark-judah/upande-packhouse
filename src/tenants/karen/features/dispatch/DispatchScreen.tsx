import { useCallback, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/src/core/ui/Screen';
import { Card, Alert } from '@/src/core/ui/Card';
import { Button } from '@/src/core/ui/Button';
import { DateSelector } from '@/src/core/ui/DateSelector';
import { tomorrowISO } from '@/src/core/date';
import { useToast } from '@/src/core/ui/Toast';
import { useKarenDispatchStore } from '@/src/tenants/karen/state/karen-dispatch-store';
import { COLORS, fontFamily, fontSize, spacing, borderRadius } from '@/src/core/theme';

export function KarenDispatchScreen() {
  const {
    loading,
    saving,
    selectedDate,
    deliveryDate,
    orders,
    totalBoxes,
    lastOutcome,
    loadOrders,
    save,
    setDate,
    reset,
  } = useKarenDispatchStore();
  const { showSuccess, showError } = useToast();

  useEffect(() => {
    loadOrders();
    return () => reset();
  }, [loadOrders, reset]);

  // Refresh the loaded-orders list whenever the screen regains focus.
  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, [loadOrders]),
  );

  const onSave = async () => {
    const outcome = await save();
    if (outcome.kind === 'success') showSuccess(outcome.message);
    else showError(outcome.message);
    loadOrders();
  };

  return (
    <Screen title="Dispatch">
      <Card title="Delivery day">
        <DateSelector
          value={selectedDate}
          onChange={(d) => { if (d !== selectedDate) setDate(d); }}
          label="Delivery date"
          maxDate={null}
          resetTo={tomorrowISO()}
          resetLabel="Tomorrow"
        />
      </Card>

      <Card title="Loaded orders">
        <View style={s.summaryRow}>
          <Text style={s.summary}>
            {orders.length} order{orders.length === 1 ? '' : 's'} · {totalBoxes} box
            {totalBoxes === 1 ? '' : 'es'} loaded
          </Text>
          {deliveryDate ? <Text style={s.date}>{deliveryDate}</Text> : null}
        </View>
        <Text style={s.helper}>
          {loading
            ? 'Loading…'
            : 'These are the orders loaded for dispatch (from the loading sheet).'}
        </Text>
      </Card>

      {!loading && orders.length === 0 ? (
        <Card>
          <Text style={s.helper}>No orders have been loaded yet.</Text>
        </Card>
      ) : (
        orders.map((o) => (
          <View key={o.salesOrder || o.orderName} style={s.orderCard}>
            <View style={s.orderTop}>
              <Text style={s.orderName} numberOfLines={1}>{o.orderName}</Text>
              <View style={s.boxTag}>
                <Text style={s.boxTagText}>{o.boxesLoaded} box{o.boxesLoaded === 1 ? '' : 'es'}</Text>
              </View>
            </View>
            <Text style={s.orderSub} numberOfLines={1}>
              {[o.customer, o.deliveryPoint, o.farm].filter(Boolean).join('  ·  ')}
            </Text>
          </View>
        ))
      )}

      <Card title="Dispatch">
        <Text style={s.helper}>
          Create or update the day&rsquo;s dispatch form from all loaded boxes. An existing
          draft form is updated with the current details; otherwise a new one is created.
        </Text>
        <View style={{ height: spacing.sm }} />
        <Button
          label={saving ? 'Saving…' : 'Create / update dispatch form'}
          onPress={onSave}
          disabled={saving || loading || orders.length === 0}
        />
      </Card>

      {lastOutcome?.kind === 'error' ? (
        <Alert tone="danger">{lastOutcome.message}</Alert>
      ) : lastOutcome?.kind === 'success' ? (
        <Card title="Last action">
          <Text style={s.rowValue}>{lastOutcome.message}</Text>
        </Card>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  helper: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: COLORS.textMuted,
    marginTop: spacing.xs,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summary: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: COLORS.text },
  date: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted },
  orderCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  orderTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orderName: { flex: 1, fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: COLORS.text },
  boxTag: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  boxTagText: { fontFamily: fontFamily.bold, fontSize: 11, color: '#fff' },
  orderSub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textSecondary, marginTop: 3 },
  rowValue: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
});
