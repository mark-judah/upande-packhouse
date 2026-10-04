import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScanField } from '@/src/core/scanning/ScanField';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';
import { Button } from '@/src/core/ui/Button';
import { showDialog } from '@/src/core/ui/DialogHost';
import { Segmented } from '@/src/core/ui/Segmented';
import {
  useKarenPackingQualityStore,
  type DefectCategory,
  type QualityBucket,
  type QualityCandidate,
  type QualityScope,
} from '@/src/tenants/karen/state/karen-packing-quality-store';

const CATEGORY_ORDER: DefectCategory[] = ['Wrong stem length', 'Disease', 'Pest', 'Other'];
const SCOPES = [
  { value: 'bucket' as const, label: 'Whole bucket' },
  { value: 'stems' as const, label: 'Some stems' },
];

/** A bucket id out of a scan: bare id, {"bucket_id": …}, or {"<id>": "bucket"}. */
function bucketFromScan(raw: string): string {
  const text = raw.trim();
  if (!text.startsWith('{')) return text;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (typeof parsed.bucket_id === 'string') return parsed.bucket_id.trim();
    const entry = Object.entries(parsed).find(([, v]) => v === 'bucket');
    return entry ? entry[0] : '';
  } catch {
    return '';
  }
}

function lengthLabel(v: string | null | undefined): string {
  if (!v) return '';
  return /^\d+(\.\d+)?$/.test(v) ? `${v}cm` : v;
}

/**
 * Quality issue found while packing: which bucket on the line, what is wrong
 * with it (wrong stem length, a disease, a pest), whole bucket or some stems,
 * then the replacement. The sales farm's buckets come first, the best one
 * recommended; only when it has none is a remote farm's offered, and that one
 * comes on the next truck as ASAP. The bad stems go to Rejects either way.
 */
type SheetProps = {
  /** The variety on screen: its buckets are listed first and preselected. */
  currentItemCode: string | null;
  /** After a successful report: show the message and reload the order. */
  onDone: (message: string) => void;
};

export function QualityIssueSheet(props: SheetProps) {
  const open = useKarenPackingQualityStore((st) => st.open);
  const oplName = useKarenPackingQualityStore((st) => st.oplName);
  const close = useKarenPackingQualityStore((st) => st.close);
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={s.backdrop} onPress={close} />
      {/* Remounted per opening: every report starts from a blank form. */}
      {open ? <QualityIssueForm key={oplName ?? ''} {...props} /> : null}
    </Modal>
  );
}

function QualityIssueForm({ currentItemCode, onDone }: SheetProps) {
  const {
    open,
    loading,
    error,
    salesFarm,
    defects,
    buckets,
    options,
    submitting,
    close,
    loadOptions,
    clearOptions,
    submit,
  } = useKarenPackingQualityStore();

  const [pickedBucket, setBucketId] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [category, setCategory] = useState<DefectCategory>('Disease');
  const [defect, setDefect] = useState<string | null>(null);
  const [scope, setScope] = useState<QualityScope>('bucket');
  const [stemsText, setStemsText] = useState('');
  // The packer's own picks, remembered against the options they were made on;
  // until then the defaults below apply.
  const [choice, setChoice] = useState<{ key: string; bucket: string } | null>(null);
  const [remoteToggle, setRemoteToggle] = useState<{ key: string; open: boolean } | null>(null);
  const [notes, setNotes] = useState('');

  // The line on screen's first bucket, until another is picked or scanned.
  const firstOnLine = buckets.find((b) => b.itemCode === currentItemCode) ?? buckets[0];
  const bucketId = pickedBucket ?? (firstOnLine ? `${firstOnLine.bucket}|${firstOnLine.saleOrderItem}` : null);

  const bucket: QualityBucket | null =
    buckets.find((b) => `${b.bucket}|${b.saleOrderItem}` === bucketId) ?? null;
  const maxStems = bucket ? Math.floor(bucket.stems) : 0;
  const stems = scope === 'bucket' ? maxStems : Math.min(parseInt(stemsText || '0', 10) || 0, maxStems);

  // Replacement options follow the bucket and the stem count (debounced while typing).
  useEffect(() => {
    if (!open || !bucket || stems <= 0) {
      clearOptions();
      return;
    }
    const t = setTimeout(() => loadOptions(bucket, stems), scope === 'stems' ? 400 : 0);
    return () => clearTimeout(t);
  }, [open, bucket, stems, scope, loadOptions, clearOptions]);

  const local = options?.salesFarmCandidates ?? [];
  const remote = options?.remoteCandidates ?? [];
  // These options: a pick made on other ones (another bucket or stem count) no longer applies.
  const optionsKey = `${bucketId}|${options?.needed ?? ''}|${options?.loading ? 'loading' : 'ready'}`;
  // Best match by default: the sales farm's recommended one, else the first remote one.
  const chosen =
    choice && choice.key === optionsKey ? choice.bucket : (local[0]?.bucket ?? remote[0]?.bucket ?? null);
  const setChosen = (b: string) => setChoice({ key: optionsKey, bucket: b });
  // Remote farms open by default only when the sales farm has nothing.
  const showRemote = remoteToggle && remoteToggle.key === optionsKey ? remoteToggle.open : local.length === 0;
  const setShowRemote = (next: boolean) => setRemoteToggle({ key: optionsKey, open: next });

  const replacement: QualityCandidate | null =
    [...local, ...remote].find((c) => c.bucket === chosen) ?? null;

  const byCategory = useMemo(() => {
    const map: Record<DefectCategory, string[]> = { 'Wrong stem length': [], Disease: [], Pest: [], Other: [] };
    for (const d of defects) map[d.category].push(d.defect);
    return map;
  }, [defects]);
  const categories = CATEGORY_ORDER.filter((c) => byCategory[c].length);

  const onScanBucket = (raw: string) => {
    const id = bucketFromScan(raw).toUpperCase();
    const match = buckets.find((b) => b.bucket.toUpperCase() === id);
    if (match) {
      setBucketId(`${match.bucket}|${match.saleOrderItem}`);
      setScanError(null);
    } else {
      setScanError(id ? `${id} is not issued to this order.` : 'Not a bucket QR code.');
    }
  };

  const canSubmit = !!bucket && !!defect && stems > 0 && !submitting && !options?.loading;
  const actionLabel = !replacement
    ? `Reject ${stems} stems`
    : replacement.remote
      ? `Reject & request ${replacement.bucket} ASAP`
      : `Reject & replace with ${replacement.bucket}`;

  const onSubmit = () => {
    if (!bucket || !defect) return;
    const what = scope === 'bucket' ? `all ${stems} stems of ${bucket.bucket}` : `${stems} stems of ${bucket.bucket}`;
    const then = !replacement
      ? 'No replacement will be allocated.'
      : replacement.remote
        ? `${replacement.bucket} will be requested from ${replacement.farm} and put on the next truck as ASAP.`
        : `${replacement.bucket} (shelf ${replacement.shelf ?? '—'}) will be issued to this line now.`;
    showDialog('Report quality issue?', `${defect}: ${what} go to Rejects.\n${then}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Report',
        style: 'destructive',
        onPress: async () => {
          const res = await submit({ bucket, defect, scope, stems, replacement, notes });
          if (res.ok) {
            close();
            onDone(res.message);
          } else {
            showDialog('Could not report', res.message);
          }
        },
      },
    ]);
  };

  const renderCandidate = (c: QualityCandidate) => {
    const on = c.bucket === chosen;
    return (
      <Pressable
        key={`${c.farm}-${c.bucket}`}
        onPress={() => setChosen(c.bucket)}
        style={[s.repRow, on && s.repRowOn]}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
      >
        <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? COLORS.text : COLORS.textMuted} />
        <View style={{ flex: 1 }}>
          <View style={s.repTop}>
            <Text style={s.repId}>{c.bucket}</Text>
            {c.recommended ? (
              <View style={s.badgeGood}>
                <Text style={s.badgeGoodText}>Recommended</Text>
              </View>
            ) : null}
            {c.remote ? (
              <View style={s.badgeAsap}>
                <Text style={s.badgeAsapText}>ASAP · {c.farm}</Text>
              </View>
            ) : null}
          </View>
          <Text style={s.repMeta} numberOfLines={1}>
            {[
              lengthLabel(c.stemLength),
              c.availableQty != null ? `${Math.round(c.availableQty)} stems` : '',
              c.harvestDate ? `Harvested ${c.harvestDate}` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {c.shelf ? (
            <View style={s.repShelf}>
              <Ionicons name="location-outline" size={12} color={COLORS.textMuted} />
              <Text style={s.repShelfText} numberOfLines={1}>
                {c.shelf}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={s.sheet}>
        <View style={s.handle} />
        <Text style={s.title}>Quality issue</Text>
        <Text style={s.sub}>Reject the bad stems and replace them — from {salesFarm || 'the sales farm'} first.</Text>

        {loading ? (
          <Text style={s.muted}>Loading buckets on this order…</Text>
        ) : error ? (
          <Text style={s.muted}>{error}</Text>
        ) : (
          <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: spacing.md }} keyboardShouldPersistTaps="handled">
            {/* 1 · Bucket */}
            <Text style={s.step}>1 · Bucket</Text>
            <ScanField onScan={onScanBucket} placeholder="Scan the bucket QR (or pick below)" />
            {scanError ? <Text style={s.errorText}>{scanError}</Text> : null}
            <View style={s.chips}>
              {buckets.map((b) => {
                const key = `${b.bucket}|${b.saleOrderItem}`;
                const on = key === bucketId;
                return (
                  <Pressable key={key} onPress={() => setBucketId(key)} style={[s.chip, on && s.chipOn]}>
                    <Text style={[s.chipText, on && s.chipTextOn]}>{b.bucket}</Text>
                    <Text style={[s.chipSub, on && s.chipTextOn]} numberOfLines={1}>
                      {[b.itemCode, lengthLabel(b.stemLength), `${Math.round(b.stems)} st`].filter(Boolean).join(' · ')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* 2 · What is wrong */}
            <Text style={s.step}>2 · Quality issue</Text>
            <View style={s.chips}>
              {categories.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => {
                    setCategory(c);
                    setDefect(byCategory[c].length === 1 ? byCategory[c][0] : null);
                  }}
                  style={[s.catChip, category === c && s.catChipOn]}
                >
                  <Text style={[s.chipText, category === c && s.chipTextOn]}>{c}</Text>
                </Pressable>
              ))}
            </View>
            <View style={s.chips}>
              {(byCategory[category] ?? []).map((d) => (
                <Pressable key={d} onPress={() => setDefect(d)} style={[s.defChip, defect === d && s.defChipOn]}>
                  <Text style={[s.defText, defect === d && s.chipTextOn]}>{d}</Text>
                </Pressable>
              ))}
            </View>

            {/* 3 · How much */}
            <Text style={s.step}>3 · Replace</Text>
            <Segmented value={scope} options={SCOPES} onChange={setScope} />
            {scope === 'stems' ? (
              <TextInput
                value={stemsText}
                onChangeText={(t) => {
                  const digits = t.replace(/[^0-9]/g, '');
                  setStemsText(digits ? String(Math.min(parseInt(digits, 10), maxStems)) : '');
                }}
                keyboardType="number-pad"
                placeholder={`Bad stems (max ${maxStems})`}
                placeholderTextColor={COLORS.textMuted}
                style={s.input}
              />
            ) : (
              <Text style={s.muted}>
                {bucket ? `All ${maxStems} stems of ${bucket.bucket} on this line are rejected.` : 'Pick a bucket.'}
              </Text>
            )}

            {/* 4 · Replacement */}
            <Text style={s.step}>4 · Replacement</Text>
            {!bucket || stems <= 0 ? (
              <Text style={s.muted}>Pick the bucket and how many stems first.</Text>
            ) : options?.loading ? (
              <Text style={s.muted}>Finding buckets for {stems} stems…</Text>
            ) : (
              <>
                <Text style={s.groupHead}>
                  {options?.salesFarm || salesFarm || 'Sales farm'} · {local.length} bucket{local.length === 1 ? '' : 's'}
                </Text>
                {local.length ? local.map(renderCandidate) : (
                  <Text style={s.muted}>Nothing matching at {options?.salesFarm || 'the sales farm'}.</Text>
                )}
                {remote.length ? (
                  <>
                    <Pressable style={s.remoteToggle} onPress={() => setShowRemote(!showRemote)}>
                      <Ionicons name="bus-outline" size={14} color={COLORS.text} />
                      <Text style={s.remoteToggleText}>
                        Remote farms · {remote.length} bucket{remote.length === 1 ? '' : 's'} — next truck, ASAP
                      </Text>
                      <Ionicons name={showRemote ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textMuted} />
                    </Pressable>
                    {showRemote ? remote.map(renderCandidate) : null}
                  </>
                ) : null}
                {options?.warning && replacement?.remote ? (
                  <View style={s.warn}>
                    <Ionicons name="warning-outline" size={14} color="#B54708" />
                    <Text style={s.warnText}>{options.warning}</Text>
                  </View>
                ) : null}
                {!local.length && !remote.length ? (
                  <Text style={s.muted}>{options?.message || 'No bucket can replace these stems.'}</Text>
                ) : null}
              </>
            )}

            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes (optional)"
              placeholderTextColor={COLORS.textMuted}
              style={[s.input, { marginTop: spacing.md }]}
              multiline
            />
          </ScrollView>
        )}

        <View style={s.actions}>
          <Button label="Cancel" variant="outline" size="sm" singleLine onPress={close} style={{ flex: 1 }} />
          <Button
            size="sm"
            singleLine
            label={actionLabel}
            iconLeft={replacement?.remote ? 'bus-outline' : 'swap-horizontal'}
            onPress={onSubmit}
            disabled={!canSubmit}
            loading={submitting}
            style={{ flex: 2 }}
          />
        </View>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '90%',
    backgroundColor: COLORS.surface ?? '#fff',
    borderTopLeftRadius: borderRadius.lg ?? 16,
    borderTopRightRadius: borderRadius.lg ?? 16,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: spacing.sm,
  },
  title: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: COLORS.text },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, marginTop: 2 },
  body: { marginTop: spacing.sm },
  step: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.xs,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  muted: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, marginVertical: spacing.xs },
  errorText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.danger, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    maxWidth: '100%',
  },
  chipOn: { backgroundColor: COLORS.text, borderColor: COLORS.text },
  chipText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: COLORS.text },
  chipSub: { fontFamily: fontFamily.regular, fontSize: 10, color: COLORS.textSecondary },
  chipTextOn: { color: '#fff' },
  catChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  catChipOn: { backgroundColor: COLORS.text, borderColor: COLORS.text },
  defChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceAlt,
  },
  defChipOn: { backgroundColor: '#B42318' },
  defText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.text },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    marginTop: spacing.sm,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: COLORS.text,
  },
  groupHead: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.xs,
    color: COLORS.text,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  repRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: spacing.sm,
  },
  repRowOn: { borderColor: COLORS.text, backgroundColor: COLORS.surfaceAlt },
  repTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  repId: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: COLORS.text },
  badgeGood: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: '#ECFDF3' },
  badgeGoodText: { fontFamily: fontFamily.semiBold, fontSize: 10, color: '#067647' },
  badgeAsap: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: '#FEE4E2' },
  badgeAsapText: { fontFamily: fontFamily.semiBold, fontSize: 10, color: '#B42318' },
  repMeta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textSecondary, marginTop: 2 },
  repShelf: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  repShelfText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted, flexShrink: 1 },
  remoteToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: spacing.sm,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceAlt,
    marginVertical: spacing.xs,
  },
  remoteToggleText: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.text },
  warn: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    padding: spacing.sm,
    borderRadius: 8,
    backgroundColor: '#FFFAEB',
    marginTop: spacing.xs,
  },
  warnText: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: '#B54708' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
});
