import { audio } from '@/src/core/audio';
import { tomorrowISO } from '@/src/core/date';
import { getSavedBoxLabels, recordSavedBoxLabels, type SavedBoxLabels } from '@/src/core/pdf/boxLabelsHistory';
import { previewPdf, writeBase64PdfToFile } from '@/src/core/pdf/pdfDownload';
import { SavedBoxLabelsSheet } from '@/src/core/pdf/SavedBoxLabelsSheet';
import { ScanField, type ScanFieldHandle } from '@/src/core/scanning/ScanField';
import { focusWhenReady } from '@/src/core/scanning/focus';
import { storage, StorageKeys } from '@/src/core/storage';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';
import { Button } from '@/src/core/ui/Button';
import { Alert, Card } from '@/src/core/ui/Card';
import { DateSelector } from '@/src/core/ui/DateSelector';
import { Dropdown } from '@/src/core/ui/Dropdown';
import { FAB } from '@/src/core/ui/FAB';
import { Input } from '@/src/core/ui/Input';
import { ItemGroupFilter } from '@/src/core/ui/ItemGroupFilter';
import { Screen } from '@/src/core/ui/Screen';
import { useToast } from '@/src/core/ui/Toast';
import {
  stemsPerBunch,
  useKarenPackingStore,
  type PickListLine,
} from '@/src/tenants/karen/state/karen-packing-store';
import { useKarenTeamsStore } from '@/src/tenants/karen/state/karen-teams-store';
import { useKarenPackingQualityStore } from '@/src/tenants/karen/state/karen-packing-quality-store';
import { QualityIssueSheet } from './QualityIssueSheet';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Matches FAB's own FAB_SIZE + its bottom offset formula (insets.bottom +
 *  8) -- used to stack the Saved Labels button directly above the Print
 *  button rather than overlapping it. */
const FAB_SIZE = 56;
const FAB_STACK_GAP = 12;

/** Box Label's own print format defaults to A4 (see box_label.json) --
 *  matched here so the dialog opens on the size that already prints
 *  correctly, with room to override for a different label stock. */
const DEFAULT_BOX_LABEL_WIDTH_MM = '210';
const DEFAULT_BOX_LABEL_HEIGHT_MM = '297';

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
  const [boxLabelsOpen, setBoxLabelsOpen] = useState(false);
  // Shown inside the Print Box Labels modal: a toast would sit behind it.
  const [boxLabelsError, setBoxLabelsError] = useState<string | null>(null);
  const [labelWidthMm, setLabelWidthMm] = useState(DEFAULT_BOX_LABEL_WIDTH_MM);
  const [labelHeightMm, setLabelHeightMm] = useState(DEFAULT_BOX_LABEL_HEIGHT_MM);
  // Saved label PDFs, for the OPL they were read for.
  const [savedFor, setSavedFor] = useState<{ opl: string; entries: SavedBoxLabels[] } | null>(null);
  const [savedLabelsSheetOpen, setSavedLabelsSheetOpen] = useState(false);
  const insets = useSafeAreaInsets();
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
    boxLabelsGenerating,
    loadPicklists,
    setDate,
    setItemGroup,
    setTeam,
    selectOpl,
    selectPackItem,
    setBox,
    submitScan,
    submitManual,
    loadUnderPackReasons,
    submitUnderPackReason,
    loadPackingBypassReasons,
    submitBypass,
    generateBoxLabels,
    reset,
  } = useKarenPackingStore();

  const openQualityIssue = useKarenPackingQualityStore((s) => s.openFor);
  const qualityIssueOpen = useKarenPackingQualityStore((s) => s.open);

  const savedLabels = savedFor && savedFor.opl === selectedOpl ? savedFor.entries : [];

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
          : baseUrl.replace(/\/$/, '') + encodeURI(specImage);

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
      availablePicklists.filter(
        (o) =>
          (!selectedItemGroup || o.itemGroup === selectedItemGroup) &&
          (!selectedTeam || o.team === selectedTeam),
      ),
    [availablePicklists, selectedItemGroup, selectedTeam],
  );

  // Label shows customer + variety + stem length per OPL, same as the
  // issuing screen; order name + stems shown below as the sublabel.
  const orderOptions = filteredPicklists.map((o) => ({
    label:
      [o.customer, o.varieties.join(', '), o.stemLengths.join(', ')]
        .filter(Boolean)
        .join(' · ') || o.orderName || o.oplName,
    value: o.oplName,
    sublabel: [o.orderName, o.qty ? `${o.qty} stems` : null].filter(Boolean).join(' · ') || undefined,
  }));

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
    return Math.min(orderRemaining, boxRemaining);
  }, [standardLine, packedBunchesTally, packingGuide, varietyStemsInBox, currentBoxId, closedBoxes]);

  // A value the operator already typed is capped if the ceiling drops under it
  // (switching to a box with less room left, or a tally refresh) — the field
  // never shows more than what's actually still packable.
  const manualQtyShown = (() => {
    if (!manualQty) return manualQty;
    const n = parseInt(manualQty, 10);
    return Number.isFinite(n) && n > standardMax ? String(Math.max(0, standardMax)) : manualQty;
  })();

  // Which PDFs are already on record for this OPL — drives the Saved Labels
  // button's visibility, so a re-print doesn't require regenerating one just
  // to look at it again.
  useEffect(() => {
    if (!selectedOpl) return;
    let cancelled = false;
    getSavedBoxLabels(selectedOpl).then((entries) => {
      if (!cancelled) setSavedFor({ opl: selectedOpl, entries });
    });
    return () => {
      cancelled = true;
    };
  }, [selectedOpl]);

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

  const onGenerateBoxLabels = async () => {
    const width = parseFloat(labelWidthMm);
    const height = parseFloat(labelHeightMm);
    setBoxLabelsError(null);
    const outcome = await generateBoxLabels(
      Number.isFinite(width) && width > 0 ? width : undefined,
      Number.isFinite(height) && height > 0 ? height : undefined,
    );
    if (!outcome.success) {
      setBoxLabelsError(outcome.message);
      return;
    }
    if (!selectedOpl) return;
    try {
      const path = await writeBase64PdfToFile(outcome.base64, outcome.filename);
      setBoxLabelsOpen(false);
      // The OS print/preview sheet renders the PDF for real on both
      // platforms (react-native-webview's local-file PDF support is
      // unreliable, especially on Android's system WebView) and already
      // carries its own save/share/print destinations.
      await previewPdf(path);
      const entry: SavedBoxLabels = {
        path,
        filename: outcome.filename,
        count: outcome.count,
        savedAt: Date.now(),
      };
      await recordSavedBoxLabels(selectedOpl, entry);
      const opl = selectedOpl;
      setSavedFor((prev) => ({ opl, entries: [entry, ...(prev && prev.opl === opl ? prev.entries : [])] }));
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not open the PDF preview.');
    }
  };

  const onSelectSavedEntry = async (entry: SavedBoxLabels) => {
    setSavedLabelsSheetOpen(false);
    try {
      await previewPdf(entry.path);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not open the PDF preview.');
    }
  };

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
          {boxClosed ? (
            <Alert tone="warn">
              {boxFull
                ? `Box ${currentBoxId} is full — pick another box to keep scanning.`
                : `Box ${currentBoxId} is closed (under-packed) — pick another box to keep scanning.`}
            </Alert>
          ) : null}
          <View style={{ opacity: boxClosed ? 0.45 : 1 }}>
            <ScanField
              ref={scanRef}
              onScan={onScan}
              autoFocus={!submitting && !boxClosed}
              editable={!submitting && !boxClosed}
              placeholder={boxClosed ? `Box ${currentBoxId} is closed` : 'Scan bunch QR'}
            />
          </View>
          {submitting ? <Text style={s.helper}>Submitting…</Text> : null}
        </Card>
      ) : null}

      {showTable && isStandardRoses && standardLine ? (
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

      {showTable && packingGuide && (!boxClosed || selectedOpl) ? (
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

    <FAB
      icon="print-outline"
      onPress={() => {
        setBoxLabelsError(null);
        setBoxLabelsOpen(true);
      }}
      visible={showTable && !!selectedOpl}
    />

    <FAB
      icon="albums-outline"
      onPress={() => setSavedLabelsSheetOpen(true)}
      visible={showTable && !!selectedOpl && savedLabels.length > 0}
      color={COLORS.surface}
      style={{ bottom: insets.bottom + 8 + FAB_SIZE + FAB_STACK_GAP, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border }}
    />

    <QualityIssueSheet
      currentItemCode={selectedItemKey ? selectedItemKey.split('|')[0] : null}
      onDone={(message) => {
        showSuccess(message);
        // The line now holds the replacement (or waits for it): reload the order.
        if (selectedOpl) selectOpl(selectedOpl);
      }}
    />

    {selectedOpl ? (
      <SavedBoxLabelsSheet
        visible={savedLabelsSheetOpen}
        oplName={selectedOpl}
        entries={savedLabels}
        onClose={() => setSavedLabelsSheetOpen(false)}
        onSelect={onSelectSavedEntry}
      />
    ) : null}

    <Modal
      visible={boxLabelsOpen}
      transparent
      animationType="fade"
      onRequestClose={() => setBoxLabelsOpen(false)}
    >
      <View style={s.modalBackdrop}>
        <View style={s.modalCard}>
          <Text style={s.modalTitle}>Print Box Labels</Text>
          <Text style={s.modalHint}>
            Consolidates every box packed so far on this Order Pick List into one PDF.
          </Text>
          <View style={s.modalRow}>
            <View style={s.modalInput}>
              <Input
                label="Width (mm)"
                value={labelWidthMm}
                onChangeText={setLabelWidthMm}
                keyboardType="numeric"
              />
            </View>
            <View style={s.modalInput}>
              <Input
                label="Height (mm)"
                value={labelHeightMm}
                onChangeText={setLabelHeightMm}
                keyboardType="numeric"
              />
            </View>
          </View>
          {boxLabelsError ? (
            <View style={s.modalError}>
              <Ionicons name="alert-circle-outline" size={16} color={COLORS.danger} />
              <Text style={s.modalErrorText}>{boxLabelsError}</Text>
            </View>
          ) : null}
          <Button
            label="Generate"
            onPress={onGenerateBoxLabels}
            loading={boxLabelsGenerating}
            iconLeft="print-outline"
            style={{ alignSelf: 'stretch', marginTop: spacing.sm }}
          />
          <Button
            label="Cancel"
            variant="ghost"
            onPress={() => setBoxLabelsOpen(false)}
            disabled={boxLabelsGenerating}
            style={{ alignSelf: 'stretch' }}
          />
        </View>
      </View>
    </Modal>
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
  debugBtn: { width: 32, alignItems: 'center', justifyContent: 'center', padding: 4 },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.lg,
  },
  modalCard: {
    width: '100%', maxWidth: 360, backgroundColor: COLORS.surface,
    borderRadius: borderRadius.lg, padding: spacing.lg, gap: spacing.xs,
  },
  modalTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: COLORS.text },
  modalHint: {
    fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted,
    marginBottom: spacing.sm,
  },
  modalRow: { flexDirection: 'row', gap: spacing.md },
  modalError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: 8,
    backgroundColor: '#FEF3F2',
  },
  modalErrorText: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.danger },
  modalInput: { flex: 1 },
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
