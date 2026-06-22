import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/src/core/ui/Screen';
import { Card, Alert } from '@/src/core/ui/Card';
import { ScanField, type ScanFieldHandle } from '@/src/core/scanning/ScanField';
import { focusWhenReady } from '@/src/core/scanning/focus';
import { useToast } from '@/src/core/ui/Toast';
import { useKarenStagingStore } from '@/src/tenants/karen/state/karen-staging-store';
import { COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';

export function KarenStagingScreen() {
  const scanRef = useRef<ScanFieldHandle>(null);
  const { showSuccess, showError, showInfo } = useToast();
  const { submitting, lastOutcome, submitScan, reset } = useKarenStagingStore();

  useEffect(() => {
    return () => reset();
  }, [reset]);

  // Staging is a pure scan loop — keep the scanner focused while idle.
  useFocusEffect(
    useCallback(() => {
      if (!submitting) focusWhenReady(scanRef);
    }, [submitting]),
  );

  const onScan = async (raw: string) => {
    const outcome = await submitScan(raw);
    if (outcome.kind === 'success') showSuccess(outcome.message || 'Box staged successfully');
    else if (outcome.kind === 'warning') showInfo(outcome.message || 'Check the scan and try again');
    else showError(outcome.message || 'Failed to create staging entry');
    scanRef.current?.clear();
    focusWhenReady(scanRef);
  };

  return (
    <Screen title="Staging Entry">
      <Card title="Scan box">
        <ScanField
          ref={scanRef}
          onScan={onScan}
          autoFocus={!submitting}
          editable={!submitting}
          placeholder="Scan box label"
        />
        {submitting ? <Text style={s.helper}>Submitting…</Text> : (
          <Text style={s.helper}>Scan each box label to stage it for loading.</Text>
        )}
      </Card>

      {lastOutcome ? (
        lastOutcome.kind === 'success' ? (
          <Card title="Last staged">
            <View style={s.okRow}>
              <Text style={s.okText}>{lastOutcome.message}</Text>
            </View>
          </Card>
        ) : (
          <Alert tone={lastOutcome.kind === 'warning' ? 'warn' : 'danger'}>
            {lastOutcome.message}
          </Alert>
        )
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
  okRow: { paddingVertical: spacing.xs },
  okText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
});
