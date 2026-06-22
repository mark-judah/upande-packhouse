import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/src/core/ui/Screen';
import { Card, Alert } from '@/src/core/ui/Card';
import { Button } from '@/src/core/ui/Button';
import { Dropdown } from '@/src/core/ui/Dropdown';
import { ScanField, type ScanFieldHandle } from '@/src/core/scanning/ScanField';
import { focusWhenReady } from '@/src/core/scanning/focus';
import { useToast } from '@/src/core/ui/Toast';
import { useKarenDispatchStore } from '@/src/tenants/karen/state/karen-dispatch-store';
import { COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';

export function KarenDispatchScreen() {
  const scanRef = useRef<ScanFieldHandle>(null);
  const {
    trucks,
    trucksLoading,
    selectedTruck,
    submitting,
    lastOutcome,
    loadTrucks,
    setSelectedTruck,
    submitBoxLabel,
    reset,
  } = useKarenDispatchStore();
  const { showSuccess, showError } = useToast();

  useEffect(() => {
    loadTrucks();
    return () => reset();
  }, [loadTrucks, reset]);

  // Park the cursor on the scan field on screen entry — but only after a
  // truck is selected (otherwise scanning is a no-op anyway).
  useFocusEffect(
    useCallback(() => {
      if (selectedTruck) focusWhenReady(scanRef);
    }, [selectedTruck]),
  );

  const onScan = async (raw: string) => {
    // Box QR may come in either as a bare label or wrapped JSON like
    // {"box_label":"…"} depending on how the printer was configured.
    let boxLabel = raw.trim();
    if (boxLabel.startsWith('{')) {
      try {
        const parsed = JSON.parse(boxLabel) as Record<string, unknown>;
        const candidate = parsed.box_label;
        if (typeof candidate === 'string' && candidate.trim()) {
          boxLabel = candidate.trim();
        } else {
          showError('Scan was JSON but had no box_label.');
          scanRef.current?.clear();
          focusWhenReady(scanRef);
          return;
        }
      } catch {
        showError('Invalid box QR format.');
        scanRef.current?.clear();
        focusWhenReady(scanRef);
        return;
      }
    }

    const outcome = await submitBoxLabel(boxLabel);
    if (outcome.kind === 'success') {
      showSuccess(`Dispatched ${outcome.boxLabel}`);
    } else {
      showError(outcome.message);
    }
    // Always clear and refocus so the operator can scan the next box.
    scanRef.current?.clear();
    focusWhenReady(scanRef);
  };

  const onChangeTruck = (next: string) => {
    setSelectedTruck(next || null);
    // Hand focus to the scan field so the operator can start scanning right away.
    focusWhenReady(scanRef);
  };

  const truckOptions = trucks.map((t) => ({ label: t.licensePlate, value: t.licensePlate }));
  const truckHelper = trucksLoading
    ? 'Loading trucks…'
    : trucks.length === 0
      ? 'No trucks parked for dispatch.'
      : `${trucks.length} truck${trucks.length === 1 ? '' : 's'} available`;

  return (
    <Screen title="Dispatch">
      <Card title="Truck">
        <Dropdown
          label="Truck"
          value={selectedTruck}
          options={truckOptions}
          placeholder={trucksLoading ? 'Loading…' : 'Pick a truck'}
          iconName="truck"
          onChange={onChangeTruck}
          disabled={trucksLoading || trucks.length === 0}
        />
        <Text style={s.helper}>{truckHelper}</Text>
        {!trucksLoading && trucks.length === 0 ? (
          <>
            <View style={{ height: spacing.sm }} />
            <Button label="Reload trucks" variant="outline" onPress={loadTrucks} />
          </>
        ) : null}
      </Card>

      <Card title="Scan box">
        <ScanField
          ref={scanRef}
          onScan={onScan}
          autoFocus={!!selectedTruck && !submitting}
          editable={!!selectedTruck && !submitting}
          placeholder={
            selectedTruck ? 'Scan box QR' : 'Pick a truck first to start scanning'
          }
        />
        {submitting ? <Text style={s.helper}>Submitting…</Text> : null}
      </Card>

      {lastOutcome?.kind === 'success' ? (
        <Card title="Last dispatched">
          <Row label="Box" value={lastOutcome.boxLabel} />
          <Row label="Truck" value={lastOutcome.truck} />
          {lastOutcome.message ? <Row label="Server" value={lastOutcome.message} /> : null}
        </Card>
      ) : lastOutcome?.kind === 'error' ? (
        <Alert tone="danger">{lastOutcome.message}</Alert>
      ) : null}
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value || '—'}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  helper: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: COLORS.textMuted,
    marginTop: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  rowLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  rowValue: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: COLORS.text,
    flexShrink: 1,
    textAlign: 'right',
  },
});
