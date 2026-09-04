import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { storage, StorageKeys } from '@/src/core/storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
import { useKarenPackingStore, stemsPerBunch } from '@/src/tenants/karen/state/karen-packing-store';
import { audio } from '@/src/core/audio';
import { COLORS, fontFamily, fontSize, spacing, borderRadius } from '@/src/core/theme';

const COLOUR_HEX: Record<string, string> = {
  red: '#dc2626', white: '#f3f4f6', pink: '#ec4899', yellow: '#eab308',
  orange: '#f97316', cream: '#fde68a', peach: '#fca5a5', purple: '#9333ea',
  lavender: '#a78bfa', green: '#16a34a', bicolor: '#8b5cf6', cerise: '#db2777',
};
function colourHex(name?: string): string {
  return COLOUR_HEX[(name || '').trim().toLowerCase()] || '#9ca3af';
}

export function KarenPackingScreen() {
  const scanRef = useRef<ScanFieldHandle>(null);
  const [manualQty, setManualQty] = useState('');
  const { showSuccess, showError } = useToast();

  const {
    picklistsLoading,
    availablePicklists,
    selectedDate,
    selectedItemGroup,
    selectedTeam,
    guideLoading,
    showTable,
    selectedOpl,
    pickListItems,
    packingGuide,
    packedBunchesTally,
    varietyStemsInBox,
    currentBoxId,
    lastScannedKey,
    submitting,
    loadPicklists,
    setDate,
    setItemGroup,
    setTeam,
    selectOpl,
    setBox,
    submitScan,
    submitManual,
    reset,
  } = useKarenPackingStore();

  useEffect(() => {
    loadPicklists();
    return () => reset();
  }, [loadPicklists, reset]);

  const isStandardRoses = packingGuide?.itemGroup === 'Standard Roses';

  // Guide image is a (possibly private) Frappe file — needs base URL + session cookie.
  const [imgBase, setImgBase] = useState<string | null>(null);
  const [imgCookie, setImgCookie] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      setImgBase((await storage.get(StorageKeys.instanceUrl)) || null);
      setImgCookie((await storage.get(StorageKeys.cookie)) || null);
    })();
  }, []);

  const bouquetImage = useMemo(() => {
    const p = packingGuide?.specImage;
    if (!p || !imgBase) return null;
    const uri = p.startsWith('http') ? p : imgBase.replace(/\/$/, '') + encodeURI(p);
    return imgCookie ? { uri, headers: { Cookie: imgCookie } } : { uri };
  }, [packingGuide?.specImage, imgBase, imgCookie]);

  const totalPerBunch = useMemo(
    () => (packingGuide?.bouquetGuide ?? []).reduce((n, b) => n + b.stemsPerBunch, 0),
    [packingGuide?.bouquetGuide],
  );

  // Spray/mixed roses scan against bunch QRs; standard roses are entered
  // manually. Hand focus to the scanner when we're in scan mode.
  useFocusEffect(
    useCallback(() => {
      if (showTable && !isStandardRoses && !submitting) focusWhenReady(scanRef);
    }, [showTable, isStandardRoses, submitting]),
  );

  // Item groups present across the available picklists, with how many each
  // one covers. Drives the filter chips above the picklist picker.
  const itemGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of availablePicklists) {
      if (o.itemGroup) counts.set(o.itemGroup, (counts.get(o.itemGroup) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));
  }, [availablePicklists]);

  // Teams present across the available picklists, with how many each covers.
  // Drives the team filter chips (each team should see only its own orders).
  const teams = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of availablePicklists) {
      if (o.team) counts.set(o.team, (counts.get(o.team) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count }));
  }, [availablePicklists]);

  const filteredPicklists = useMemo(
    () =>
      availablePicklists.filter(
        (o) =>
          (!selectedItemGroup || o.itemGroup === selectedItemGroup) &&
          (!selectedTeam || o.team === selectedTeam),
      ),
    [availablePicklists, selectedItemGroup, selectedTeam],
  );

  const orderOptions = filteredPicklists.map((o) => ({
    label: o.orderName || o.oplName,
    value: o.oplName,
    sublabel: o.itemGroup || undefined,
  }));

  const boxOptions = useMemo(() => {
    const n = packingGuide?.plannedBoxes ?? 1;
    return Array.from({ length: Math.max(1, n) }, (_, i) => ({
      label: `Box ${i + 1}`,
      value: String(i + 1),
    }));
  }, [packingGuide?.plannedBoxes]);

  const currentStems = useMemo(
    () =>
      Object.values(varietyStemsInBox).reduce(
        (sum, byBox) => sum + (byBox[currentBoxId] ?? 0),
        0,
      ),
    [varietyStemsInBox, currentBoxId],
  );

  const packrate = packingGuide?.packratePerBox ?? 0;
  const progress = packrate > 0 ? Math.min(1, currentStems / packrate) : 0;
  const boxFull = packrate > 0 && currentStems >= packrate;

  const announce = useCallback(
    (outcome: { kind: string; message?: string }) => {
      if (outcome.kind === 'success') showSuccess(outcome.message || 'Packed successfully');
      else showError(outcome.message || 'Packing failed');
    },
    [showSuccess, showError],
  );

  const onPickOrder = (next: string) => {
    if (!next || next === selectedOpl) return;
    setManualQty('');
    selectOpl(next);
  };

  const onScan = async (raw: string) => {
    const outcome = await submitScan(raw);
    announce(outcome);
    scanRef.current?.clear();
    if (!isStandardRoses) focusWhenReady(scanRef);
  };

  const onPackManual = async () => {
    const qty = parseInt(manualQty.trim(), 10);
    const outcome = await submitManual(Number.isFinite(qty) ? qty : 0);
    announce(outcome);
    if (outcome.kind === 'success') setManualQty('');
  };

  // Changing box (via dropdown or the breakdown buttons) rings a bell.
  const onChangeBox = useCallback(
    (id: number) => {
      if (id !== currentBoxId) audio.beep();
      setBox(id);
    },
    [currentBoxId, setBox],
  );

  const standardLine = isStandardRoses ? pickListItems[0] : undefined;
  // Displayed cap = min(order remaining, room left in the current box) so the
  // operator sees the real limit instead of the whole order quantity.
  const standardMax = useMemo(() => {
    if (!standardLine) return 0;
    const perBunch = stemsPerBunch(standardLine.uom);
    const packed = Math.trunc(
      packedBunchesTally[
        `${standardLine.itemCode}|${standardLine.uom}|${standardLine.stemLength}`
      ] ?? 0,
    );
    const orderRemaining = Math.max(0, Math.trunc(standardLine.qty) - packed);
    let boxRemaining = Infinity;
    if (packingGuide && packingGuide.packratePerBox > 0) {
      const boxStems = Object.values(varietyStemsInBox).reduce(
        (sum, byBox) => sum + (byBox[currentBoxId] ?? 0),
        0,
      );
      boxRemaining = Math.max(0, Math.floor((packingGuide.packratePerBox - boxStems) / perBunch));
    }
    return Math.min(orderRemaining, boxRemaining);
  }, [standardLine, packedBunchesTally, packingGuide, varietyStemsInBox, currentBoxId]);

  // Per-box breakdown: how many stems (and which varieties) are in each box.
  const boxBreakdown = useMemo(() => {
    const count = Math.max(1, packingGuide?.plannedBoxes ?? 1);
    const rate = packingGuide?.packratePerBox ?? 0;
    return Array.from({ length: count }, (_, i) => {
      const boxId = i + 1;
      const varieties: { variety: string; stems: number }[] = [];
      let total = 0;
      for (const [variety, byBox] of Object.entries(varietyStemsInBox)) {
        const stems = byBox[boxId] ?? 0;
        if (stems > 0) {
          varieties.push({ variety, stems });
          total += stems;
        }
      }
      return { boxId, total, rate, varieties };
    });
  }, [packingGuide?.plannedBoxes, packingGuide?.packratePerBox, varietyStemsInBox]);

  // Surface orders that were set up wrongly in the ERP so the operator knows
  // why the box math may be off (missing packrate / box count / bunch size).
  const orderIssues = useMemo(() => {
    if (!showTable || !packingGuide) return [];
    const out: string[] = [];
    if (!(packingGuide.packratePerBox > 0)) {
      out.push('No packrate set on this order — box capacity can’t be enforced.');
    }
    if (!(packingGuide.plannedBoxes > 0)) {
      out.push('No box count on this order.');
    }
    const badUom = new Set<string>();
    for (const it of pickListItems) {
      if (!/\(\d+\)/.test(it.uom)) badUom.add(`${it.itemCode} (${it.uom || 'no UOM'})`);
    }
    for (const u of badUom) {
      out.push(`${u}: UOM has no bunch size — assuming 1 stem/unit.`);
    }
    // Quantities should reconcile: packrate × boxes ≈ planned stems.
    const planned = packingGuide.items.reduce((sum, i) => sum + i.plannedStems, 0);
    const cap = packingGuide.packratePerBox * packingGuide.plannedBoxes;
    if (planned > 0 && cap > 0 && Math.abs(cap - planned) > packingGuide.packratePerBox) {
      out.push(
        `Quantities don’t reconcile: ${planned} stems planned vs ${packingGuide.plannedBoxes} box(es) × ${packingGuide.packratePerBox} = ${cap}.`,
      );
    }
    return out;
  }, [showTable, packingGuide, pickListItems]);

  return (
    <Screen title="Packing Entry">
      <Card title="Order">
        <DateSelector
          value={selectedDate}
          onChange={setDate}
          label="Delivery date"
          maxDate={null}
          resetTo={tomorrowISO()}
          resetLabel="Tomorrow"
        />
        {teams.length > 0 ? (
          <ItemGroupFilter
            label="Team"
            groups={teams}
            totalCount={availablePicklists.length}
            selected={selectedTeam}
            onSelect={setTeam}
          />
        ) : null}
        {itemGroups.length > 0 ? (
          <ItemGroupFilter
            groups={itemGroups}
            totalCount={availablePicklists.length}
            selected={selectedItemGroup}
            onSelect={setItemGroup}
          />
        ) : null}
        <Dropdown
          label="Order Picklist"
          value={selectedOpl}
          options={orderOptions}
          placeholder={picklistsLoading ? 'Loading…' : 'Select an order'}
          iconName="clipboard-text-outline"
          onChange={onPickOrder}
          disabled={picklistsLoading || filteredPicklists.length === 0}
        />
        {showTable && packingGuide ? (
          <>
            <View style={{ height: spacing.sm }} />
            <Dropdown
              label="Box"
              value={String(currentBoxId)}
              options={boxOptions}
              iconName="package-variant-closed"
              onChange={(v) => onChangeBox(parseInt(v, 10) || 1)}
            />
          </>
        ) : null}
        {!showTable ? (
          <Text style={s.helper}>
            {picklistsLoading
              ? 'Loading pick lists…'
              : availablePicklists.length === 0
                ? 'No pick lists available for packing.'
                : guideLoading
                  ? 'Loading order…'
                  : 'Pick an order to start packing.'}
          </Text>
        ) : null}
      </Card>

      {showTable && packingGuide?.isMixedBunch ? (
        <Card title="Bouquet Guide">
          {bouquetImage ? (
            <Image source={bouquetImage} style={s.bouquetImg} resizeMode="contain" />
          ) : packingGuide.specImage ? (
            <Text style={s.helper}>Loading guide image…</Text>
          ) : null}
          <Text style={s.bouquetHint}>Build each bunch to match the photo — per bunch:</Text>
          {packingGuide.bouquetGuide.map((b, i) => (
            <View key={`${b.variety}-${i}`} style={s.recipeRow}>
              <View style={[s.colourDot, { backgroundColor: colourHex(b.colour) }]} />
              <Text style={s.recipeStems}>{b.stemsPerBunch}</Text>
              <Text style={s.recipeStemsLbl}>stems</Text>
              <Text style={s.recipeName} numberOfLines={1}>
                {[b.colour, b.varietyName].filter(Boolean).join(' — ')}
                {b.length ? `  ·  ${b.length}` : ''}
              </Text>
            </View>
          ))}
          <Text style={s.recipeTotal}>
            {totalPerBunch} stems per bunch · {packingGuide.bouquetGuide.length} colour
            {packingGuide.bouquetGuide.length === 1 ? '' : 's'}
          </Text>
        </Card>
      ) : null}

      {orderIssues.length > 0 ? (
        <Alert tone="warn">
          {'Order data issues:\n' + orderIssues.map((i) => `•  ${i}`).join('\n')}
        </Alert>
      ) : null}

      {showTable && packingGuide ? (
        <Card title={`Box ${currentBoxId}`}>
          <View style={s.boxHeader}>
            <Text style={s.boxStems}>
              {currentStems}
              <Text style={s.boxStemsTotal}> / {packrate}</Text>
            </Text>
            <View style={[s.tag, boxFull ? s.tagFull : s.tagActive]}>
              <Text style={s.tagText}>{boxFull ? 'FULL' : 'ACTIVE'}</Text>
            </View>
          </View>
          <View style={s.progressTrack}>
            <View
              style={[
                s.progressFill,
                { width: `${progress * 100}%` },
                boxFull && s.progressFull,
              ]}
            />
          </View>

          {packingGuide.isMixed ? (
            <View style={s.targetBox}>
              <Text style={s.targetTitle}>Target per Box</Text>
              {packingGuide.items.map((it) => {
                const target =
                  packingGuide.plannedBoxes > 0
                    ? Math.round(it.plannedStems / packingGuide.plannedBoxes)
                    : 0;
                const current = varietyStemsInBox[it.itemCode]?.[currentBoxId] ?? 0;
                const done = current >= target;
                return (
                  <View key={it.itemCode} style={s.targetRow}>
                    <MaterialCommunityIcons
                      name={done ? 'check-circle' : 'circle-outline'}
                      size={16}
                      color={done ? '#16a34a' : '#4f46e5'}
                    />
                    <Text style={s.targetName} numberOfLines={1}>
                      {it.itemName}
                    </Text>
                    <Text style={[s.targetQty, done && s.targetQtyDone]}>
                      {current} / {target}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </Card>
      ) : null}

      {showTable && !isStandardRoses ? (
        <Card title="Scan bunch">
          <ScanField
            ref={scanRef}
            onScan={onScan}
            autoFocus={!submitting}
            editable={!submitting}
            placeholder="Scan bunch QR"
          />
          {submitting ? <Text style={s.helper}>Submitting…</Text> : null}
        </Card>
      ) : null}

      {showTable && isStandardRoses && standardLine ? (
        <Card title="Manual entry">
          <Text style={s.manualVariety}>{standardLine.itemCode}</Text>
          <Text style={s.manualMeta}>
            {[standardLine.spec, standardLine.stemLength, standardLine.uom].filter(Boolean).join('  •  ')}
          </Text>
          <View style={{ height: spacing.sm }} />
          <TextInput
            value={manualQty}
            onChangeText={setManualQty}
            keyboardType="number-pad"
            placeholder={`Bunches (max ${standardMax})`}
            placeholderTextColor={COLORS.textMuted}
            style={s.manualInput}
            editable={!submitting}
          />
          <View style={{ height: spacing.sm }} />
          <Button
            label={submitting ? 'Packing…' : 'Pack'}
            onPress={onPackManual}
            disabled={submitting || standardMax === 0}
          />
        </Card>
      ) : null}

      {showTable && packingGuide ? (
        <BoxBreakdown boxes={boxBreakdown} currentBoxId={currentBoxId} onSelectBox={onChangeBox} />
      ) : null}

      {showTable ? (
        <Card title="Order lines">
          <View style={[s.tRow, s.tHead]}>
            <Text style={[s.tCell, s.tVariety, s.tHeadText]}>Variety</Text>
            <Text style={[s.tCell, s.tNarrow, s.tHeadText]}>Len</Text>
            <Text style={[s.tCell, s.tUom, s.tHeadText]}>UOM</Text>
            <Text style={[s.tCell, s.tNum, s.tHeadText]}>Req</Text>
            <Text style={[s.tCell, s.tNum, s.tHeadText]}>Pack</Text>
          </View>
          {pickListItems.map((item) => {
            const k = `${item.itemCode}|${item.uom}|${item.stemLength}`;
            const packed = Math.trunc(packedBunchesTally[k] ?? 0);
            const req = Math.trunc(item.qty);
            const full = packed >= req;
            return (
              <View
                key={k}
                style={[
                  s.tRow,
                  lastScannedKey === k ? s.tRowScanned : full ? s.tRowFull : null,
                ]}
              >
                <View style={[s.tVariety, s.tVarietyCell]}>
                  <Text style={s.tVarietyName} numberOfLines={1}>{item.itemCode}</Text>
                  {item.spec ? (
                    <Text style={s.tSpec} numberOfLines={1}>{item.spec}</Text>
                  ) : null}
                </View>
                <Text style={[s.tCell, s.tNarrow]}>{item.stemLength}</Text>
                <Text style={[s.tCell, s.tUom]} numberOfLines={1}>
                  {item.uom}
                </Text>
                <Text style={[s.tCell, s.tNum]}>{req}</Text>
                <Text style={[s.tCell, s.tNum, full ? s.tPackDone : s.tPack]}>
                  {packed}
                </Text>
              </View>
            );
          })}
        </Card>
      ) : null}
    </Screen>
  );
}

function BoxBreakdown({
  boxes,
  currentBoxId,
  onSelectBox,
}: {
  boxes: { boxId: number; total: number; rate: number; varieties: { variety: string; stems: number }[] }[];
  currentBoxId: number;
  onSelectBox: (id: number) => void;
}) {
  return (
    <Card title="Boxes">
      {boxes.map((b) => {
        const p = b.rate > 0 ? Math.min(1, b.total / b.rate) : 0;
        const full = b.rate > 0 && b.total >= b.rate;
        const active = b.boxId === currentBoxId;
        return (
          <Pressable
            key={b.boxId}
            style={[s.bbItem, active && s.bbItemActive]}
            onPress={() => onSelectBox(b.boxId)}
          >
            <View style={s.bbHead}>
              <Text style={[s.bbTitle, active && s.bbTitleActive]}>
                Box {b.boxId}{active ? '  •  current' : ''}
              </Text>
              <Text style={[s.bbCount, full && s.bbCountFull]}>
                {b.total}{b.rate > 0 ? ` / ${b.rate}` : ''} stems
              </Text>
            </View>
            <View style={s.bbTrack}>
              <View style={[s.bbFill, { width: `${p * 100}%` }, full && s.bbFillFull]} />
            </View>
            {b.varieties.length > 0 ? (
              <Text style={s.bbVarieties} numberOfLines={2}>
                {b.varieties.map((v) => `${v.variety} (${v.stems})`).join('  •  ')}
              </Text>
            ) : (
              <Text style={s.bbEmpty}>empty</Text>
            )}
          </Pressable>
        );
      })}
    </Card>
  );
}

const s = StyleSheet.create({
  helper: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: COLORS.textMuted,
    marginTop: spacing.xs,
  },

  bouquetImg: {
    width: '100%',
    height: 220,
    borderRadius: borderRadius.md,
    backgroundColor: '#f3f4f6',
    marginBottom: spacing.sm,
  },
  bouquetHint: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: COLORS.text,
    marginBottom: spacing.xs,
  },
  recipeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  colourDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.25)',
  },
  recipeStems: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.md,
    color: COLORS.text,
    minWidth: 22,
    textAlign: 'right',
  },
  recipeStemsLbl: {
    fontFamily: fontFamily.regular,
    fontSize: 10,
    color: COLORS.textMuted,
  },
  recipeName: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: COLORS.text,
  },
  recipeTotal: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xs,
    color: COLORS.textMuted,
    marginTop: spacing.sm,
  },

  boxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  boxStems: { fontFamily: fontFamily.bold, fontSize: 32, color: COLORS.text },
  boxStemsTotal: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.textMuted },
  tag: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  tagActive: { backgroundColor: COLORS.primary },
  tagFull: { backgroundColor: '#dc2626' },
  tagText: { fontFamily: fontFamily.bold, fontSize: 11, color: '#fff', letterSpacing: 0.5 },

  progressTrack: {
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.border,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  progressFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 7 },
  progressFull: { backgroundColor: '#dc2626' },

  targetBox: {
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: '#eef2ff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#c7d2fe',
  },
  targetTitle: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.xs,
    color: '#4f46e5',
    marginBottom: spacing.xs,
  },
  targetRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  targetName: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.text },
  targetQty: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: COLORS.text },
  targetQtyDone: { color: '#16a34a' },

  manualVariety: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: COLORS.text },
  manualMeta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, marginTop: 2 },
  manualInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.lg,
    color: COLORS.text,
    textAlign: 'center',
  },

  tRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  tHead: { backgroundColor: '#f5f5f5', borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  tHeadText: { fontFamily: fontFamily.bold, color: COLORS.textSecondary },
  tRowScanned: { backgroundColor: '#eff6ff' },
  tRowFull: { backgroundColor: '#f0fdf4' },
  tCell: { fontFamily: fontFamily.regular, fontSize: 11, color: COLORS.text, paddingHorizontal: 4 },
  tVariety: { flex: 2.5 },
  tVarietyCell: { paddingHorizontal: 4 },
  tVarietyName: { fontFamily: fontFamily.regular, fontSize: 11, color: COLORS.text },
  tSpec: { fontFamily: fontFamily.regular, fontSize: 10, color: COLORS.textMuted, marginTop: 1 },
  tNarrow: { flex: 1 },
  tUom: { flex: 1.5 },
  tNum: { flex: 1, textAlign: 'right' },
  tPack: { fontFamily: fontFamily.bold },
  tPackDone: { fontFamily: fontFamily.bold, color: '#166534' },

  bbItem: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  bbItemActive: { backgroundColor: '#eff6ff', borderRadius: borderRadius.sm },
  bbHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bbTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  bbTitleActive: { color: COLORS.primary },
  bbCount: { fontFamily: fontFamily.bold, fontSize: fontSize.xs, color: COLORS.textSecondary },
  bbCountFull: { color: '#16a34a' },
  bbTrack: { height: 6, borderRadius: 3, backgroundColor: COLORS.border, overflow: 'hidden', marginTop: 6 },
  bbFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 3 },
  bbFillFull: { backgroundColor: '#16a34a' },
  bbVarieties: { fontFamily: fontFamily.regular, fontSize: 11, color: COLORS.textMuted, marginTop: 4 },
  bbEmpty: { fontFamily: fontFamily.regular, fontSize: 11, color: COLORS.textMuted, marginTop: 4, fontStyle: 'italic' },
});
