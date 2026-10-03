import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/src/core/ui/Screen';
import { Card, Alert } from '@/src/core/ui/Card';
import { Button } from '@/src/core/ui/Button';
import { Dropdown } from '@/src/core/ui/Dropdown';
import { DateSelector } from '@/src/core/ui/DateSelector';
import { tomorrowISO } from '@/src/core/date';
import { ItemGroupFilter } from '@/src/core/ui/ItemGroupFilter';
import { ScanField, type ScanFieldHandle } from '@/src/core/scanning/ScanField';
import { focusWhenReady } from '@/src/core/scanning/focus';
import { useToast } from '@/src/core/ui/Toast';
import {
  useKarenIssuingStore,
  type PackingItem,
} from '@/src/tenants/karen/state/karen-issuing-store';
import { useKarenTeamsStore } from '@/src/tenants/karen/state/karen-teams-store';
import { ReplacePicker } from './ReplacePicker';
import { COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';

export function KarenIssuingScreen() {
  const scanRef = useRef<ScanFieldHandle>(null);
  const {
    ordersLoading,
    availableOrders,
    selectedDate,
    selectedItemGroup,
    selectedTeam,
    packingLoading,
    selectedOpl,
    packingItems,
    submitting,
    lastOutcome,
    loadOrders,
    setDate,
    setItemGroup,
    setTeam,
    selectOrder,
    submitScan,
    replace,
    openReplace,
    closeReplace,
    confirmReplace,
    reset,
  } = useKarenIssuingStore();
  const { showSuccess, showError } = useToast();
  const canonicalTeams = useKarenTeamsStore((s) => s.teams);
  const loadTeams = useKarenTeamsStore((s) => s.load);

  useEffect(() => {
    loadOrders();
    loadTeams();
    return () => reset();
  }, [loadOrders, loadTeams, reset]);

  // Issued buckets drop off the scan list; progress tracks against the total.
  const unissuedItems = useMemo(
    () => packingItems.filter((it) => !it.isIssued),
    [packingItems],
  );
  const issuedItems = useMemo(() => packingItems.filter((it) => it.isIssued), [packingItems]);
  const [showIssued, setShowIssued] = useState(false);
  const unissuedCount = unissuedItems.length;
  const issuedCount = packingItems.length - unissuedCount;
  const issueProgress = packingItems.length > 0 ? issuedCount / packingItems.length : 0;

  // Team this order's buckets should be issued to (from the OPL's custom_team).
  const orderTeam = useMemo(() => {
    const teams = [
      ...new Set(packingItems.map((it) => it.team).filter((t) => t && t !== 'Unassigned')),
    ];
    return teams.join(', ');
  }, [packingItems]);

  useFocusEffect(
    useCallback(() => {
      if (selectedOpl && unissuedCount > 0) focusWhenReady(scanRef);
    }, [selectedOpl, unissuedCount]),
  );

  // Item groups present across the ready orders, with how many orders each one
  // covers. Drives the filter chips above the order picker.
  const itemGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of availableOrders) {
      for (const g of o.itemGroups) counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));
  }, [availableOrders]);

  // Canonical team list (Packing Teams doctype), with how many of today's
  // ready orders each one covers -- a team with none today still shows up
  // as a choice (count 0), rather than only ever offering whatever team
  // strings happened to appear on already-loaded orders.
  const teamOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of availableOrders) {
      for (const t of o.teams) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return canonicalTeams.map((name) => ({ name, count: counts.get(name) ?? 0 }));
  }, [canonicalTeams, availableOrders]);

  const filteredOrders = useMemo(
    () =>
      availableOrders.filter(
        (o) =>
          (!selectedItemGroup || o.itemGroups.includes(selectedItemGroup)) &&
          (!selectedTeam || o.teams.includes(selectedTeam)),
      ),
    [availableOrders, selectedItemGroup, selectedTeam],
  );

  // Label shows customer + variety + stem length per OPL, per the packhouse
  // spec — operators pick the specific pick list, not a merged sale order.
  const orderOptions = filteredOrders.map((o) => ({
    label:
      [o.customer, o.varieties.join(', '), o.stemLengths.join(', ')]
        .filter(Boolean)
        .join(' · ') || o.name,
    value: o.oplName,
    sublabel: [o.name, o.qty ? `${o.qty} stems` : null].filter(Boolean).join(' · ') || undefined,
  }));

  const selectedOplInfo = useMemo(
    () => availableOrders.find((o) => o.oplName === selectedOpl) ?? null,
    [availableOrders, selectedOpl],
  );

  const onPickOrder = (next: string) => {
    if (!next || next === selectedOpl) return;
    selectOrder(next);
  };

  const onScan = async (raw: string) => {
    const outcome = await submitScan(raw);
    if (outcome.kind === 'success') {
      showSuccess(`Issued ${outcome.bucket}`);
    } else {
      showError(outcome.message);
    }
    scanRef.current?.clear();
    focusWhenReady(scanRef);
  };

  return (
    <Screen title="Issue from Coldstore" onRefresh={loadOrders}>
      <Card title="Sale order">
        <DateSelector
          value={selectedDate}
          onChange={setDate}
          label="Delivery date"
          maxDate={null}
          resetTo={tomorrowISO()}
          resetLabel="Tomorrow"
        />
        {itemGroups.length > 0 ? (
          <ItemGroupFilter
            groups={itemGroups}
            totalCount={availableOrders.length}
            selected={selectedItemGroup}
            onSelect={setItemGroup}
          />
        ) : null}
        {teamOptions.length > 0 ? (
          <ItemGroupFilter
            label="Team"
            groups={teamOptions}
            totalCount={availableOrders.length}
            selected={selectedTeam}
            onSelect={setTeam}
          />
        ) : null}
        <Dropdown
          label="Pick List"
          value={selectedOpl}
          options={orderOptions}
          placeholder={ordersLoading ? 'Loading…' : 'Pick a pick list'}
          iconName="clipboard-text-outline"
          onChange={onPickOrder}
          disabled={ordersLoading || filteredOrders.length === 0}
        />
        <Text style={s.helper}>
          {ordersLoading
            ? 'Loading pick lists…'
            : availableOrders.length === 0
              ? 'No pick lists are ready to be issued.'
              : selectedItemGroup || selectedTeam
                ? `${filteredOrders.length} of ${availableOrders.length} pick list${availableOrders.length === 1 ? '' : 's'}${[selectedItemGroup, selectedTeam].filter(Boolean).length ? ' · ' + [selectedItemGroup, selectedTeam].filter(Boolean).join(' · ') : ''}`
                : `${availableOrders.length} pick list${availableOrders.length === 1 ? '' : 's'} ready`}
        </Text>
        {!ordersLoading && availableOrders.length === 0 ? (
          <>
            <View style={{ height: spacing.sm }} />
            <Button label="Reload orders" variant="outline" onPress={loadOrders} />
          </>
        ) : null}
      </Card>

      {selectedOpl ? (
        <Card
          title={`Packing list — ${selectedOplInfo?.customer || selectedOpl}`}
        >
          {selectedOplInfo ? (
            <Text style={s.helper}>
              {selectedOplInfo.name} · {selectedOplInfo.varieties.join(', ') || '—'}
              {selectedOplInfo.stemLengths.length ? ` · ${selectedOplInfo.stemLengths.join(', ')}` : ''}
              {selectedOplInfo.qty ? ` · ${selectedOplInfo.qty} stems` : ''}
            </Text>
          ) : null}
          {packingLoading ? (
            <Text style={s.helper}>Loading packing list…</Text>
          ) : packingItems.length === 0 ? (
            <Text style={s.helper}>No buckets allocated to this pick list.</Text>
          ) : (
            <>
              {/* Which team to hand this order's buckets to. */}
              {orderTeam ? (
                <View style={s.teamBanner}>
                  <Text style={s.teamLabel}>ISSUE TO TEAM</Text>
                  <Text style={s.teamValue}>{orderTeam}</Text>
                </View>
              ) : null}

              {/* Issuing progress across all buckets in the order. */}
              <View style={s.progressHead}>
                <Text style={s.progressText}>
                  {issuedCount} of {packingItems.length} issued
                </Text>
                <Text style={s.progressPct}>{Math.round(issueProgress * 100)}%</Text>
              </View>
              <View style={s.progressTrack}>
                <View style={[s.progressFill, { width: `${issueProgress * 100}%` }]} />
              </View>
              <View style={{ height: spacing.sm }} />

              {unissuedCount === 0 ? (
                <Text style={s.helper}>All buckets issued for this order.</Text>
              ) : (
                <>
                  <Text style={s.helper}>
                    {unissuedCount} still to issue. Scan a bucket QR from the list, or Replace one
                    that cannot be found.
                  </Text>
                  <View style={{ height: spacing.sm }} />
                  <ScrollView
                    style={s.packingScroll}
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled
                  >
                    {unissuedItems.map((item) => (
                      <PackingRow
                        key={`${item.oplName}-${item.bucket}`}
                        item={item}
                        onReplace={() => openReplace(item)}
                      />
                    ))}
                  </ScrollView>
                </>
              )}

              {/* Summary of buckets already issued (collapsible). */}
              {issuedCount > 0 ? (
                <>
                  <Pressable
                    style={s.issuedHeader}
                    onPress={() => setShowIssued((v) => !v)}
                    hitSlop={6}
                  >
                    <Text style={s.issuedHeaderText}>Issued ({issuedCount})</Text>
                    <Text style={s.issuedToggle}>{showIssued ? 'Hide ▲' : 'Show ▼'}</Text>
                  </Pressable>
                  {showIssued ? (
                    <ScrollView
                      style={s.packingScroll}
                      showsVerticalScrollIndicator={false}
                      nestedScrollEnabled
                    >
                      {issuedItems.map((item) => (
                        <PackingRow key={`issued-${item.oplName}-${item.bucket}`} item={item} />
                      ))}
                    </ScrollView>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </Card>
      ) : null}

      {selectedOpl ? (
        <Card title="Scan bucket">
          <ScanField
            ref={scanRef}
            onScan={onScan}
            autoFocus={unissuedCount > 0 && !submitting}
            editable={unissuedCount > 0 && !submitting}
            placeholder={
              unissuedCount === 0
                ? 'All buckets issued for this order'
                : 'Scan bucket QR'
            }
          />
          {submitting ? <Text style={s.helper}>Submitting…</Text> : null}
        </Card>
      ) : null}

      {lastOutcome?.kind === 'error' ? (
        <Alert tone="danger">{lastOutcome.message}</Alert>
      ) : lastOutcome?.kind === 'success' ? (
        <Card title="Last issued">
          <Row label="Bucket" value={lastOutcome.bucket} />
          {lastOutcome.message ? <Row label="Server" value={lastOutcome.message} /> : null}
        </Card>
      ) : null}
      <ReplacePicker
        sheet={replace}
        onClose={closeReplace}
        onPick={async (c, why) => {
          const res = await confirmReplace(c.bucket, why);
          if (res.ok) showSuccess(res.message);
          else showError(res.message);
        }}
      />
    </Screen>
  );
}

function PackingRow({ item, onReplace }: { item: PackingItem; onReplace?: () => void }) {
  return (
    <View style={[s.packRow, item.isIssued && s.packRowDone]}>
      <View style={s.packLeft}>
        <Text style={[s.packBucket, item.isIssued && s.packBucketDone]}>
          {[item.shelf && `Shelf ${item.shelf}`, item.bucket].filter(Boolean).join(' · ') || '—'}
        </Text>
        <Text style={s.packMeta}>
          {[item.variety, item.stemLength].filter(Boolean).join(' · ') || '—'}
        </Text>
      </View>
      <View style={s.packRight}>
        <Text style={s.packQty}>{item.qty}</Text>
        {item.isIssued ? (
          <View style={s.tagDone}>
            <Text style={s.tagDoneText}>ISSUED</Text>
          </View>
        ) : item.mixed ? (
          <View style={s.tagMixed}>
            <Text style={s.tagMixedText}>MIXED</Text>
          </View>
        ) : null}
        {!item.isIssued && onReplace ? (
          <Pressable onPress={onReplace} hitSlop={6} accessibilityRole="button">
            <Text style={s.replaceLink}>Replace</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
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
  packingScroll: { maxHeight: 320 },

  teamBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  teamLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.6,
  },
  teamValue: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: '#fff' },

  progressHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  progressPct: { fontFamily: fontFamily.bold, fontSize: fontSize.xs, color: COLORS.textSecondary },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.border,
    overflow: 'hidden',
    marginTop: 6,
  },
  progressFill: { height: '100%', backgroundColor: '#16a34a', borderRadius: 4 },

  issuedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  issuedHeaderText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.textSecondary },
  issuedToggle: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.primary },

  packRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  packRowDone: { opacity: 0.55 },
  packLeft: { flex: 1 },
  packRight: { alignItems: 'flex-end', gap: 4 },

  packBucket: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.sm,
    color: COLORS.text,
    letterSpacing: 0.5,
  },
  packBucketDone: { textDecorationLine: 'line-through' },
  packMeta: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  packQty: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: COLORS.text,
  },

  replaceLink: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.xs,
    color: COLORS.primary,
    textDecorationLine: 'underline',
  },
  tagDone: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#dcfce7',
  },
  tagDoneText: {
    fontFamily: fontFamily.bold,
    fontSize: 9,
    color: '#166534',
    letterSpacing: 0.4,
  },
  tagMixed: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#fef3c7',
  },
  tagMixedText: {
    fontFamily: fontFamily.bold,
    fontSize: 9,
    color: '#92400e',
    letterSpacing: 0.4,
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
