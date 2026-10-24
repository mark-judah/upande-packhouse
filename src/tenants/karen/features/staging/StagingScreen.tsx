import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/src/core/ui/Screen';
import { Card, Alert } from '@/src/core/ui/Card';
import { ScanField, type ScanFieldHandle } from '@/src/core/scanning/ScanField';
import { focusWhenReady } from '@/src/core/scanning/focus';
import { useToast } from '@/src/core/ui/Toast';
import { useUserStation } from '@/src/core/tenant/user-station';
import { Skeleton } from '@/src/core/ui/Skeleton';
import { useKarenStagingStore } from '@/src/tenants/karen/state/karen-staging-store';
import { COLORS, borderRadius, fontFamily, fontSize, spacing } from '@/src/core/theme';

/** "3h 05m", "12m", "<1m" */
function formatSince(ms: number): string {
  if (ms < 60_000) return '<1m';
  const mins = Math.floor(ms / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

export function KarenStagingScreen() {
  const scanRef = useRef<ScanFieldHandle>(null);
  const locRef = useRef<ScanFieldHandle>(null);
  const { showSuccess, showError, showInfo } = useToast();
  const {
    submitting,
    lastOutcome,
    location,
    setLocation,
    submitScan,
    reset,
    coldstore,
    coldstoreSkewMs,
    coldstoreLoading,
    loadColdstore,
  } = useKarenStagingStore();
  const { station } = useUserStation();
  const farm = station?.userFarm ?? '';
  // The station's own location's boxes (Karen or Ravine); every box on a phone with no station.
  const site = farm ? (farm === 'Karen' ? 'Karen' : 'Ravine') : undefined;

  // Times in the coldstore tick every 30s without asking the server again.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadColdstore(site);
    }, [loadColdstore, site]),
  );
  const boxCount = coldstore.reduce((n, g) => n + g.boxes.length, 0);

  useEffect(() => {
    return () => reset();
  }, [reset]);

  // Keep the box scanner focused once a location is set; otherwise focus the location field.
  useFocusEffect(
    useCallback(() => {
      if (submitting) return;
      focusWhenReady(location ? scanRef : locRef);
    }, [submitting, location]),
  );

  const onScanLocation = (raw: string) => {
    setLocation(raw);
    locRef.current?.clear();
    focusWhenReady(scanRef);
  };

  const onScan = async (raw: string) => {
    const outcome = await submitScan(raw);
    if (outcome.kind === 'success') showSuccess(outcome.message || 'Box staged successfully');
    else if (outcome.kind === 'warning') showInfo(outcome.message || 'Check the scan and try again');
    else showError(outcome.message || 'Failed to create precooling entry');
    if (outcome.kind === 'success') void loadColdstore(site);
    scanRef.current?.clear();
    focusWhenReady(scanRef);
  };

  return (
    <Screen title="Precooling Entry" onRefresh={() => loadColdstore(site)}>
      <Card title="Precooling location">
        <ScanField
          ref={locRef}
          onScan={onScanLocation}
          autoFocus={!location}
          editable={!submitting}
          placeholder="Scan dispatch coldstore location QR"
        />
        {location ? (
          <Text style={s.locText}>Precooling to: {location}</Text>
        ) : (
          <Text style={s.helper}>Scan a coldstore location QR before precooling boxes.</Text>
        )}
      </Card>

      <Card title="Scan box">
        <ScanField
          ref={scanRef}
          onScan={onScan}
          autoFocus={!submitting && !!location}
          editable={!submitting && !!location}
          placeholder={location ? 'Scan box label' : 'Scan a location first'}
        />
        {submitting ? <Text style={s.helper}>Submitting…</Text> : (
          <Text style={s.helper}>
            {location ? `Scan each box label to stage it at ${location}.` : 'Scan a location QR above to begin.'}
          </Text>
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

      <Card title={`In the coldstore${boxCount ? ` · ${boxCount}` : ''}`}>
        {coldstoreLoading && coldstore.length === 0 ? (
          [0, 1, 2].map((i) => (
            <View key={i} style={s.boxRow}>
              <View style={s.skeletonLines}>
                <Skeleton width="60%" height={14} />
                <Skeleton width="35%" height={10} />
              </View>
              <Skeleton width={48} height={14} />
            </View>
          ))
        ) : coldstore.length === 0 ? (
          <Text style={s.helper}>No boxes waiting in the coldstore.</Text>
        ) : (
          coldstore.map((g) => (
            <View key={g.deliveryPoint || '-'} style={s.group}>
              <View style={s.groupHead}>
                <Text style={s.groupName} numberOfLines={1}>{g.deliveryPoint || 'No drop-off point'}</Text>
                <Text style={s.groupCount}>
                  {g.boxes.length} box{g.boxes.length === 1 ? '' : 'es'}
                </Text>
              </View>
              {g.boxes.map((b) => (
                <View key={b.boxLabel} style={s.boxRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.boxName} numberOfLines={1}>
                      Box {b.boxNumber} · {b.customer || '—'}
                    </Text>
                    <View style={s.spotRow}>
                      <MaterialCommunityIcons name="map-marker-outline" size={13} color="#92400e" />
                      <Text style={s.spotText} numberOfLines={1}>{b.spot || 'No location'}</Text>
                    </View>
                  </View>
                  <View style={s.timeTag}>
                    <MaterialCommunityIcons name="clock-outline" size={12} color={COLORS.textSecondary} />
                    <Text style={s.timeText}>
                      {b.sinceMs ? formatSince(now - coldstoreSkewMs - b.sinceMs) : '—'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ))
        )}
      </Card>
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
  group: { marginBottom: spacing.sm },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  groupName: { flex: 1, fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: COLORS.text },
  groupCount: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: COLORS.textSecondary },
  boxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  skeletonLines: { flex: 1, gap: 6 },
  boxName: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  spotRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  spotText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: '#92400e', flexShrink: 1 },
  timeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: COLORS.bg,
    borderRadius: borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  timeText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: COLORS.textSecondary },
  locText: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: COLORS.primary, marginTop: spacing.xs },
});


