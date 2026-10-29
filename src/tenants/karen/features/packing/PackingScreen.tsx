import { audio } from '@/src/core/audio';
import { tomorrowISO } from '@/src/core/date';
import { ScanField, type ScanFieldHandle } from '@/src/core/scanning/ScanField';
import { focusWhenReady } from '@/src/core/scanning/focus';
import { followDevHost } from '@/src/core/api/dev-host';
import { storage, StorageKeys } from '@/src/core/storage';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';
import { Button } from '@/src/core/ui/Button';
import { Alert, Card } from '@/src/core/ui/Card';
import { DateSelector } from '@/src/core/ui/DateSelector';
import { Dropdown } from '@/src/core/ui/Dropdown';
import { ItemGroupFilter } from '@/src/core/ui/ItemGroupFilter';
import { Screen } from '@/src/core/ui/Screen';
import { useToast } from '@/src/core/ui/Toast';
import {
  issuedRoom,
  packedStemsTotal,
  stemsPerBunch,
  useKarenPackingStore,
  type PickListLine,
} from '@/src/tenants/karen/state/karen-packing-store';
import { useKarenTeamsStore } from '@/src/tenants/karen/state/karen-teams-store';
import { useKarenPackingQualityStore } from '@/src/tenants/karen/state/karen-packing-quality-store';
import { QualityIssueSheet } from './QualityIssueSheet';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

const COLOUR_HEX: Record<string, string> = {
  red: '#dc2626', white: '#f3f4f6', pink: '#ec4899', yellow: '#eab308',
  orange: '#f97316', cream: '#fde68a', peach: '#fca5a5', purple: '#9333ea',
  lavender: '#a78bfa', green: '#16a34a', bicolor: '#8b5cf6', cerise: '#db2777',
};
function colourHex(name?: string): string {
  return COLOUR_HEX[(name || '').trim().toLowerCase()] || '#9ca3af';
}

/** Matches the store's own key() — identifies one pick-list line. */
function lineKey(item: Pick<PickListLine, 'itemCode' | 'uom' | 'stemLength'>): string {
  return `${item.itemCode}|${item.uom}|${item.stemLength}`;
}

export function KarenPackingScreen() {
  const scanRef = useRef<ScanFieldHandle>(null);
  const [manualQty, setManualQty] = useState('');
  const [underPackOpen, setUnderPackOpen] = useState(false);
  const [underPackReason, setUnderPackReason] = useState<string | null>(null);
  const [issueSectionOpen, setIssueSectionOpen] = useState(false);
  const [bypassOpen, setBypassOpen] = useState(false);
  const [bypassReason, setBypassReason] = useState<string | null>(null);
  const [bypassQty, setBypassQty] = useState('');
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
    selectedItemKey,
    issueCap,
    packedBunchesTally,
    varietyStemsInBox,
    currentBoxId,
    closedBoxes,
    lastScannedKey,
    submitting,
    underPackReasons,
    underPackReasonsLoading,
    reasonSubmitting,
    packingBypassReasons,
    packingBypassReasonsLoading,
    bypassSubmitting,
    loadPicklists,
    setDate,
    setItemGroup,
    setTeam,
    selectOpl,
    selectPackItem,
    setBox,
    submitScan,
    submitManual,
    fillBox,
    boxFill,
    loadUnderPackReasons,
    submitUnderPackReason,
    loadPackingBypassReasons,
    submitBypass,
    reset,
  } = useKarenPackingStore();

  const openQualityIssue = useKarenPackingQualityStore((s) => s.openFor);
  const qualityIssueOpen = useKarenPackingQualityStore((s) => s.open);


  const canonicalTeams = useKarenTeamsStore((s) => s.teams);
  const loadTeams = useKarenTeamsStore((s) => s.load);

  useEffect(() => {
    loadPicklists();
    loadUnderPackReasons();
    loadPackingBypassReasons();
    loadTeams();
    return () => reset();
  }, [loadPicklists, loadUnderPackReasons, loadPackingBypassReasons, loadTeams, reset]);

  const isStandardRoses = packingGuide?.itemGroup === 'Standard Roses';

  // Guide image is a (possibly private) Frappe file. React Native's <Image>
  // was previously given { uri, headers: { Cookie } } directly -- but RN's
  // native image loader (Fresco/Glide on Android, the platform loader on
  // iOS) doesn't reliably forward custom headers the way a JS-level fetch
  // does, so the auth cookie silently never reached the server and the
  // request came back as an unauthenticated 403 with nothing surfaced to
  // JS -- the image just never appeared. Fetching the bytes ourselves
  // through `fetch` (which DOES send the header correctly -- it's the same
  // mechanism the rest of the app already uses successfully for every other
  // authenticated request) and handing the Image component a self-contained
  // data: URI sidesteps the native loader's header handling entirely.
  const [bouquet, setBouquet] = useState<{ spec: string; uri: string | null; failed: boolean } | null>(null);
  const bouquetCurrent = bouquet && bouquet.spec === packingGuide?.specImage ? bouquet : null;
  const bouquetImageUri = bouquetCurrent?.uri ?? null;
  const bouquetImageFailed = !!bouquetCurrent?.failed;

  useEffect(() => {
    let cancelled = false;
    const specImage = packingGuide?.specImage;
    if (!specImage) return;

    (async () => {
      try {
        const [baseUrl, cookie] = await Promise.all([
          storage.get(StorageKeys.instanceUrl),
          storage.get(StorageKeys.cookie),
        ]);
        if (!baseUrl) throw new Error('No instance URL');
        const uri = specImage.startsWith('http')
          ? specImage
          : followDevHost(baseUrl).replace(/\/$/, '') + encodeURI(specImage);

        const res = await fetch(uri, { headers: cookie ? { Cookie: cookie } : undefined });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const dataUri = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
          reader.onload = () => resolve(String(reader.result));
          reader.readAsDataURL(blob);
        });
        if (!cancelled) setBouquet({ spec: specImage, uri: dataUri, failed: false });
      } catch {
        if (!cancelled) setBouquet({ spec: specImage, uri: null, failed: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [packingGuide?.specImage]);

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

  // Canonical team list (Packing Teams doctype), each showing how many of
  // TODAY's available picklists carry it -- a team with none today still
  // shows up as a choice (count 0), rather than only ever offering whatever
  // team strings happened to appear on already-loaded orders.
  const teams = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of availablePicklists) {
      if (o.team) counts.set(o.team, (counts.get(o.team) ?? 0) + 1);
    }
    return canonicalTeams.map((name) => ({ name, count: counts.get(name) ?? 0 }));
  }, [canonicalTeams, availablePicklists]);

  const filteredPicklists = useMemo(
    () =>
      availablePicklists
        .filter(
          (o) =>
            (!selectedItemGroup || o.itemGroup === selectedItemGroup) &&
            (!selectedTeam || o.team === selectedTeam),
        )
        // Fully packed orders sink to the bottom (stable: the rest keep their order).
        .map((o, i) => [o, i] as const)
        .sort((a, b) => Number(a[0].packedPct >= 100) - Number(b[0].packedPct >= 100) || a[1] - b[1])
        .map(([o]) => o),
    [availablePicklists, selectedItemGroup, selectedTeam],
  );

  // Label shows customer + variety + stem length per OPL, same as the
  // issuing screen; order name + stems shown below as the sublabel.
  const orderOptions = filteredPicklists.map((o) => {
    const varieties = (o.varietyLengths.length ? o.varietyLengths : o.varieties).join(', ');
    const parts: { text: string; bold?: boolean; semi?: boolean }[] = [];
    if (o.orderName) parts.push({ text: o.orderName, bold: true });
    if (varieties) parts.push(...(parts.length ? [{ text: ' · ' }] : []), { text: varieties, semi: true });
    return {
      label: parts.map((p) => p.text).join('') || o.oplName,
      parts,
      value: o.oplName,
      corner: o.schedule
        ? `${o.scheduleTeam || 'Team'} #${o.schedule}`
        : undefined,
      subParts: [
        { text: `${o.oplName} · ` },
        ...(o.customer ? [{ text: `${o.customer} · ` }] : []),
        ...(o.totalBuckets
          ? [
              o.issuedPct >= 100
                ? { text: `100% issued (${o.issuedBuckets}/${o.totalBuckets} bkt)`, bold: true, color: COLORS.success }
                : // Sent to packing before all of it was issued: packing stops at what is issued.
                  { text: `${o.issuedPct}% issued (${o.issuedBuckets}/${o.totalBuckets} bkt)`, bold: true, color: COLORS.warn },
              { text: ' · ' },
            ]
          : []),
        ...(o.shortPct ? [{ text: `short ${o.shortPct}% · `, bold: true, color: COLORS.danger }] : []),
        o.packedPct >= 100
          ? { text: '100% packed', bold: true, color: COLORS.success }
          : { text: `${o.packedPct}% packed` },
      ],
    };
  });
  const selectedPicklist = availablePicklists.find((o) => o.oplName === selectedOpl);
  // Every order line packed (live tally), or the list already says 100%.
  const fullyPacked =
    (selectedPicklist?.packedPct ?? 0) >= 100 ||
    (pickListItems.length > 0 &&
      pickListItems.every((i) => Math.trunc(packedBunchesTally[lineKey(i)] ?? 0) >= Math.trunc(i.qty)));

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
  // Closed via an Under Pack Reason -- short of packrate on purpose, but
  // must be blocked from any further packing exactly like a full box.
  const boxUnderPackClosed = !!closedBoxes[currentBoxId];
  const boxClosed = boxFull || boxUnderPackClosed;
  // Sent to packing before all of it was issued: nothing more to pack until more is issued.
  const packedStems = packedStemsTotal(varietyStemsInBox);
  const issuedLeft = issuedRoom(issueCap, varietyStemsInBox);
  const issuedFull = !!issueCap && issuedLeft <= 0;
  const scanBlocked = boxClosed || issuedFull;

  const announce = useCallback(
    (outcome: { kind: string; message?: string }) => {
      if (outcome.kind === 'success') showSuccess(outcome.message || 'Packed successfully');
      else showError(outcome.message || 'Packing failed');
    },
    [showSuccess, showError],
  );

  // Reads fresh store state (not this render's closure) so it sees the tally
  // the just-finished pack actually left behind, then jumps to the next box
  // once the current one has reached its packrate -- same auto-advance the
  // Shelving screen does when a shelf fills, so the operator never has to
  // manually reach for the box breakdown mid-flow. `force` skips the
  // packrate check entirely -- an Under Pack Reason closes a box on
  // purpose, short of packrate, and must still move on.
  const maybeAdvanceBox = useCallback(
    (force = false) => {
      const st = useKarenPackingStore.getState();
      const guide = st.packingGuide;
      const nextBox = st.currentBoxId + 1;
      const maxBox = Math.max(1, guide?.plannedBoxes ?? 1);
      if (nextBox > maxBox) return;
      if (force) {
        audio.beep();
        setBox(nextBox);
        return;
      }
      if (!guide || !(guide.packratePerBox > 0)) return;
      const stemsInBox = Object.values(st.varietyStemsInBox).reduce(
        (sum, byBox) => sum + (byBox[st.currentBoxId] ?? 0),
        0,
      );
      if (stemsInBox >= guide.packratePerBox) {
        audio.beep();
        setBox(nextBox);
      }
    },
    [setBox],
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
    if (outcome.kind === 'success') maybeAdvanceBox();
    if (!isStandardRoses) focusWhenReady(scanRef);
  };

  const onPackManual = async () => {
    const qty = parseInt(manualQtyShown.trim(), 10);
    const outcome = await submitManual(Number.isFinite(qty) ? qty : 0);
    announce(outcome);
    if (outcome.kind === 'success') {
      setManualQty('');
      maybeAdvanceBox();
    }
  };

  // Mixed bunch/box: the whole box in one entry, every variety at once.
  const onFillBox = async (bunches?: number) => {
    const outcome = await fillBox(bunches);
    announce(outcome);
    if (outcome.kind === 'success') {
      setManualQty('');
      maybeAdvanceBox();
    }
  };

  const onSubmitUnderPack = async () => {
    if (!underPackReason) return;
    const outcome = await submitUnderPackReason(underPackReason);
    announce(outcome);
    if (outcome.kind === 'success') {
      setUnderPackReason(null);
      setUnderPackOpen(false);
      maybeAdvanceBox(true);
    }
  };

  const reasonOptions = useMemo(
    () => underPackReasons.map((r) => ({ label: r.reason, value: r.name, sublabel: r.description || undefined })),
    [underPackReasons],
  );

  const onSubmitBypass = async () => {
    const qty = parseInt(bypassQty.trim(), 10);
    if (!bypassReason || !Number.isFinite(qty) || qty <= 0) return;
    const outcome = await submitBypass(bypassReason, qty);
    announce(outcome);
    if (outcome.kind === 'success') {
      setBypassReason(null);
      setBypassQty('');
      setBypassOpen(false);
      maybeAdvanceBox();
    }
  };

  const bypassReasonOptions = useMemo(
    () =>
      packingBypassReasons.map((r) => ({
        label: r.reason,
        value: r.name,
        sublabel: r.description || undefined,
      })),
    [packingBypassReasons],
  );

  // Changing box (via dropdown or the breakdown buttons) rings a bell.
  const onChangeBox = useCallback(
    (id: number) => {
      if (id !== currentBoxId) audio.beep();
      setBox(id);
    },
    [currentBoxId, setBox],
  );

  // Mixed bunch/box: the box is counted in bunches, whatever the variety.
  const mixedBox = pickListItems.length > 1 && !!(packingGuide?.isMixed || packingGuide?.isMixedBunch);
  const box = boxFill();
  const boxFillBunches = box.lines.reduce((n, f) => n + f.bunches, 0);

  // The line manual entry currently targets — a straight box has just one
  // line, so this is always that one; a mixed bunch/box has several, and the
  // operator switches between them via the variety chips below instead of
  // being stuck on line 0 once it's fully packed.
  const standardLine = isStandardRoses
    ? (pickListItems.find((i) => lineKey(i) === selectedItemKey) ?? pickListItems[0])
    : undefined;
  // Displayed cap = min(order remaining, room left in the current box) so the
  // operator sees the real limit instead of the whole order quantity.
  const standardMax = useMemo(() => {
    if (!standardLine) return 0;
    if (closedBoxes[currentBoxId]) return 0; // closed via Under Pack Reason -- no more room, ever
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
    // Sent to packing before all of it was issued: no more than was issued.
    const issuedRemaining = Math.floor(issuedRoom(issueCap, varietyStemsInBox) / perBunch);
    return Math.min(orderRemaining, boxRemaining, issuedRemaining);
  }, [standardLine, packedBunchesTally, packingGuide, varietyStemsInBox, currentBoxId, closedBoxes, issueCap]);

  // A value the operator already typed is capped if the ceiling drops under it
  // (switching to a box with less room left, or a tally refresh) — the field
  // never shows more than what's actually still packable.
  const manualQtyShown = (() => {
    if (!manualQty) return manualQty;
    const n = parseInt(manualQty, 10);
    return Number.isFinite(n) && n > standardMax ? String(Math.max(0, standardMax)) : manualQty;
  })();

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
    // const badUom = new Set<string>();
    // for (const it of pickListItems) {
    //   if (!/\(\d+\)/.test(it.uom)) badUom.add(`${it.itemCode} (${it.uom || 'no UOM'})`);
    // }
    // for (const u of badUom) {
    //   out.push(`${u}: UOM has no bunch size — assuming 1 stem/unit.`);
    // }
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
    <>
    <Screen
      title="Packing Entry"
      onRefresh={async () => {
        await Promise.all([loadPicklists(), loadUnderPackReasons(), loadPackingBypassReasons()]);
      }}
      headerRight={
        <Pressable
          onPress={() => router.push('/debug-log')}
          hitSlop={10}
          style={s.debugBtn}
          accessibilityLabel="View debug log"
        >
          <MaterialCommunityIcons name="bug-outline" size={22} color={COLORS.textMuted} />
        </Pressable>
      }
    >
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
        {selectedPicklist ? (
          <Text style={s.helper}>
            <Text style={s.bold}>
              {selectedPicklist.schedule
                ? `${selectedPicklist.scheduleTeam || 'Team'} #${selectedPicklist.schedule}`
                : 'Not scheduled'}
            </Text>
            {selectedPicklist.totalBuckets ? (
              <>
                {' · '}
                <Text style={selectedPicklist.issuedPct >= 100 ? s.packedDone : s.shortText}>
                  {`${selectedPicklist.issuedPct}% issued (${selectedPicklist.issuedBuckets}/${selectedPicklist.totalBuckets} buckets)`}
                </Text>
                {selectedPicklist.shortPct ? (
                  <Text style={s.shortText}>{` · short ${selectedPicklist.shortPct}%`}</Text>
                ) : null}
              </>
            ) : null}
            {' · '}
            <Text style={selectedPicklist.packedPct >= 100 ? s.packedDone : undefined}>
              {`${selectedPicklist.packedPct}% packed`}
            </Text>
          </Text>
        ) : null}
        {issueCap ? (
          <View style={s.issuedCapRow}>
            <View style={[s.tag, s.issuedTag]}>
              <Text style={s.tagText}>{`ISSUED ${issueCap.issuedPct}%`}</Text>
            </View>
            <Text style={[s.helper, issuedFull && s.shortText]}>
              {`${Math.trunc(packedStems)} of ${Math.trunc(issueCap.issuedStems)} issued stems packed` +
                (issuedFull ? ' · wait for more stock to be issued' : '')}
            </Text>
          </View>
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
          {bouquetImageUri ? (
            <Image source={{ uri: bouquetImageUri }} style={s.bouquetImg} resizeMode="contain" />
          ) : packingGuide.specImage && !bouquetImageFailed ? (
            <Text style={s.helper}>Loading guide image…</Text>
          ) : packingGuide.specImage && bouquetImageFailed ? (
            <Text style={s.helper}>Could not load guide image.</Text>
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
            <View style={[s.tag, boxClosed ? s.tagFull : s.tagActive]}>
              <Text style={s.tagText}>{boxFull ? 'FULL' : boxUnderPackClosed ? 'CLOSED' : 'ACTIVE'}</Text>
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

          {(packingGuide.isMixed || packingGuide.isMixedBunch) && (packingGuide.boxes[currentBoxId] ?? []).length ? (
            // What this box holds, from the Packing Guide: e.g. 3 Athena, 4 Fireworks.
            <View style={s.targetBox}>
              <Text style={s.targetTitle}>In Box {currentBoxId}</Text>
              {(packingGuide.boxes[currentBoxId] ?? []).map((it) => {
                const per = it.stemsPerBunch || 1;
                const packed = Math.floor((varietyStemsInBox[it.variety]?.[currentBoxId] ?? 0) / per);
                const done = packed >= it.bunches;
                return (
                  <View key={`${it.variety}-${it.length}`} style={s.targetRow}>
                    <MaterialCommunityIcons
                      name={done ? 'check-circle' : 'circle-outline'}
                      size={16}
                      color={done ? '#16a34a' : '#4f46e5'}
                    />
                    <Text style={s.targetName} numberOfLines={1}>
                      {it.bunches} {it.itemName}
                      {it.length ? ` · ${it.length}` : ''}
                    </Text>
                    <Text style={[s.targetQty, done && s.targetQtyDone]}>
                      {packed} / {it.bunches} bunches
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : packingGuide.isMixed ? (
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
          {scanBlocked ? (
            <Alert tone="warn">
              {issuedFull && issueCap
                ? `Only ${issueCap.issuedPct}% is issued — pack the rest once more stock is issued.`
                : boxFull
                  ? `Box ${currentBoxId} is full — pick another box to keep scanning.`
                  : `Box ${currentBoxId} is closed (under-packed) — pick another box to keep scanning.`}
            </Alert>
          ) : null}
          <View style={{ opacity: scanBlocked ? 0.45 : 1 }}>
            <ScanField
              ref={scanRef}
              onScan={onScan}
              autoFocus={!submitting && !scanBlocked}
              editable={!submitting && !scanBlocked}
              placeholder={
                issuedFull ? 'Waiting for more stock to be issued' : boxClosed ? `Box ${currentBoxId} is closed` : 'Scan bunch QR'
              }
            />
          </View>
          {submitting ? <Text style={s.helper}>Submitting…</Text> : null}
        </Card>
      ) : null}

      {/* Mixed bunch/box: what the box takes of each variety and in all, and one button that packs it. */}
      {showTable && isStandardRoses && mixedBox ? (
        <Card title={`Box ${currentBoxId}`}>
          {box.lines.map((l) => (
            <View key={lineKey(l.item)} style={s.boxLine}>
              <Text style={s.boxVariety} numberOfLines={1}>
                {l.item.itemCode}
              </Text>
              <Text style={[s.boxCount, l.inBox >= l.required && s.boxCountDone]}>
                {l.inBox} / {l.required}
              </Text>
            </View>
          ))}
          <View style={[s.boxLine, s.boxTotal]}>
            <Text style={s.boxVariety}>Total</Text>
            <Text style={[s.boxCount, box.packed >= box.required && s.boxCountDone]}>
              {box.packed} / {box.required} bunches
            </Text>
          </View>
          <View style={{ height: spacing.sm }} />
          <Button
            label={
              submitting
                ? 'Packing…'
                : boxFillBunches > 0
                  ? `Fill box · ${boxFillBunches} bunch${boxFillBunches === 1 ? '' : 'es'}`
                  : `Box ${currentBoxId} is full`
            }
            onPress={() => onFillBox()}
            disabled={submitting || boxFillBunches === 0}
          />
        </Card>
      ) : null}

      {showTable && isStandardRoses && standardLine && !mixedBox ? (
        <Card title="Manual entry">
          {pickListItems.length > 1 ? (
            <>
              <Text style={s.varietyPickerLabel}>
                {packingGuide?.isMixedBunch ? 'Bunch component' : 'Variety'}
              </Text>
              <View style={s.varietyChips}>
                {pickListItems.map((line) => {
                  const lk = lineKey(line);
                  const packed = Math.trunc(packedBunchesTally[lk] ?? 0);
                  const required = Math.trunc(line.qty);
                  const done = required > 0 && packed >= required;
                  const active = lk === selectedItemKey;
                  return (
                    <Pressable
                      key={lk}
                      style={[s.varietyChip, active && s.varietyChipActive, done && !active && s.varietyChipDone]}
                      onPress={() => {
                        if (active) return;
                        setManualQty('');
                        selectPackItem(lk);
                      }}
                    >
                      {done ? (
                        <MaterialCommunityIcons
                          name="check-circle"
                          size={13}
                          color={active ? '#fff' : '#16a34a'}
                        />
                      ) : null}
                      <Text style={[s.varietyChipText, active && s.varietyChipTextActive]} numberOfLines={1}>
                        {line.itemCode}
                      </Text>
                      <Text style={[s.varietyChipCount, active && s.varietyChipTextActive]}>
                        {packed}/{required}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={{ height: spacing.sm }} />
            </>
          ) : null}
          <Text style={s.manualVariety}>{standardLine.itemCode}</Text>
          <Text style={s.manualMeta}>
            {[standardLine.spec, standardLine.stemLength, standardLine.uom].filter(Boolean).join('  •  ')}
          </Text>
          <View style={{ height: spacing.sm }} />
          <TextInput
            value={manualQtyShown}
            onChangeText={(t) => {
              // Whole numbers only, clamped to what's actually still packable —
              // typing past the max (or a decimal/letter) can never produce an
              // invalid value, there's nothing to catch at submit time.
              const digits = t.replace(/[^0-9]/g, '');
              if (!digits) {
                setManualQty('');
                return;
              }
              const n = Math.min(parseInt(digits, 10), standardMax);
              setManualQty(String(n));
            }}
            keyboardType="number-pad"
            placeholder={`Bunches (max ${standardMax})`}
            placeholderTextColor={COLORS.textMuted}
            style={s.manualInput}
            editable={!submitting && standardMax > 0}
          />
          <View style={{ height: spacing.sm }} />
          <Button
            label={submitting ? 'Packing…' : 'Pack'}
            onPress={onPackManual}
            disabled={submitting || standardMax === 0 || !manualQtyShown || parseInt(manualQtyShown, 10) <= 0}
          />
        </Card>
      ) : null}

      {showTable && packingGuide && (!boxClosed || selectedOpl) && !fullyPacked ? (
        <Card>
          <Pressable
            style={s.issueHeaderRow}
            onPress={() => setIssueSectionOpen((v) => !v)}
          >
            <Text style={s.issueHeaderLabel}>Packing issue</Text>
            <MaterialCommunityIcons
              name={issueSectionOpen ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={COLORS.textMuted}
            />
          </Pressable>
          {issueSectionOpen ? (
            <>
              <View style={{ height: spacing.sm }} />
              {!boxClosed ? (
                <>
                  <Pressable
                    style={s.bypassCheckRow}
                    onPress={() => setBypassOpen((v) => !v)}
                    disabled={bypassSubmitting}
                  >
                    <MaterialCommunityIcons
                      name={bypassOpen ? 'checkbox-marked' : 'checkbox-blank-outline'}
                      size={22}
                      color={bypassOpen ? COLORS.primary : COLORS.textMuted}
                    />
                    <Text style={s.bypassCheckLabel}>Bypass packing</Text>
                  </Pressable>
                  {bypassOpen ? (
                    <>
                      <Text style={s.helper}>
                        Use this when a bunch can&rsquo;t be scanned (damaged/missing QR, or ungraded) —
                        it still counts toward Box {currentBoxId} and is logged for review.
                      </Text>
                      <View style={{ height: spacing.sm }} />
                      <Dropdown
                        label="Reason"
                        value={bypassReason}
                        options={bypassReasonOptions}
                        placeholder={packingBypassReasonsLoading ? 'Loading…' : 'Select a reason'}
                        iconName="alert-circle-outline"
                        onChange={setBypassReason}
                        disabled={packingBypassReasonsLoading || bypassSubmitting || bypassReasonOptions.length === 0}
                      />
                      <View style={{ height: spacing.sm }} />
                      <TextInput
                        value={bypassQty}
                        onChangeText={(t) => setBypassQty(t.replace(/[^0-9]/g, ''))}
                        keyboardType="number-pad"
                        placeholder="Number of bunches"
                        placeholderTextColor={COLORS.textMuted}
                        style={s.manualInput}
                        editable={!bypassSubmitting}
                      />
                      <View style={{ height: spacing.sm }} />
                      <Button
                        label={bypassSubmitting ? 'Reporting…' : 'Report issue'}
                        onPress={onSubmitBypass}
                        disabled={bypassSubmitting || !bypassReason || !bypassQty || parseInt(bypassQty, 10) <= 0}
                      />
                      <View style={{ height: spacing.md }} />
                    </>
                  ) : null}

                  <Pressable
                    style={s.bypassCheckRow}
                    onPress={() => setUnderPackOpen((v) => !v)}
                    disabled={reasonSubmitting}
                  >
                    <MaterialCommunityIcons
                      name={underPackOpen ? 'checkbox-marked' : 'checkbox-blank-outline'}
                      size={22}
                      color={underPackOpen ? COLORS.primary : COLORS.textMuted}
                    />
                    <Text style={s.bypassCheckLabel}>Report under-pack</Text>
                  </Pressable>
                  {underPackOpen ? (
                    <>
                      <Text style={s.helper}>
                        Closes Box {currentBoxId} short of its packrate — once saved, this box can&rsquo;t be
                        packed further and packing moves on to the next box.
                      </Text>
                      <View style={{ height: spacing.sm }} />
                      <Dropdown
                        label="Reason"
                        value={underPackReason}
                        options={reasonOptions}
                        placeholder={underPackReasonsLoading ? 'Loading…' : 'Select a reason'}
                        iconName="alert-circle-outline"
                        onChange={setUnderPackReason}
                        disabled={underPackReasonsLoading || reasonSubmitting || reasonOptions.length === 0}
                      />
                      <View style={{ height: spacing.sm }} />
                      <Button
                        label={reasonSubmitting ? 'Closing…' : 'Close box as under-packed'}
                        onPress={onSubmitUnderPack}
                        disabled={reasonSubmitting || !underPackReason}
                      />
                      <View style={{ height: spacing.md }} />
                    </>
                  ) : null}
                </>
              ) : null}

              {selectedOpl ? (
                <>
                  {/* Ticked while the replacement modal is open; closing it clears the tick. */}
                  <Pressable
                    style={s.bypassCheckRow}
                    onPress={() => {
                      if (!qualityIssueOpen) {
                        openQualityIssue(selectedOpl, selectedItemKey ? selectedItemKey.split('|')[0] : null);
                      }
                    }}
                  >
                    <MaterialCommunityIcons
                      name={qualityIssueOpen ? 'checkbox-marked' : 'checkbox-blank-outline'}
                      size={22}
                      color={qualityIssueOpen ? COLORS.primary : COLORS.textMuted}
                    />
                    <Text style={s.bypassCheckLabel}>Report quality issue</Text>
                  </Pressable>
                </>
              ) : null}
            </>
          ) : null}
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

    <QualityIssueSheet
      currentItemCode={selectedItemKey ? selectedItemKey.split('|')[0] : null}
      onDone={(message) => {
        showSuccess(message);
        // The line now holds the replacement (or waits for it): reload the order.
        if (selectedOpl) selectOpl(selectedOpl);
      }}
    />

    </>
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
  bold: { fontFamily: fontFamily.bold },
  packedDone: { fontFamily: fontFamily.bold, color: COLORS.success },
  shortText: { fontFamily: fontFamily.bold, color: COLORS.danger },
  issuedCapRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  issuedTag: { backgroundColor: COLORS.warn },
  debugBtn: { width: 32, alignItems: 'center', justifyContent: 'center', padding: 4 },
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
  tagFull: { backgroundColor: '#16a34a' },
  tagText: { fontFamily: fontFamily.bold, fontSize: 11, color: '#fff', letterSpacing: 0.5 },

  progressTrack: {
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.border,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  progressFill: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 7 },
  progressFull: { backgroundColor: '#16a34a' },

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

  varietyPickerLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 10,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.xs,
  },
  varietyChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  varietyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  varietyChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  varietyChipDone: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  varietyChipText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: COLORS.text },
  varietyChipTextActive: { color: '#fff' },
  varietyChipCount: { fontFamily: fontFamily.regular, fontSize: 10, color: COLORS.textMuted },
  boxLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  boxTotal: { borderTopWidth: 1 },
  boxVariety: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  boxCount: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: COLORS.text },
  boxCountDone: { color: '#16a34a' },
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

  issueHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  // Matches the Card title style: this row is the card's only heading.
  issueHeaderLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: COLORS.text,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  bypassCheckRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  bypassCheckLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },

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
