import { tomorrowISO } from '@/src/core/date';
import { getSavedBoxLabels, recordSavedBoxLabels, type SavedBoxLabels } from '@/src/core/pdf/boxLabelsHistory';
import { previewPdf, writeBase64PdfToFile } from '@/src/core/pdf/pdfDownload';
import { SavedBoxLabelsSheet } from '@/src/core/pdf/SavedBoxLabelsSheet';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';
import { Button } from '@/src/core/ui/Button';
import { Alert, Card } from '@/src/core/ui/Card';
import { DateSelector } from '@/src/core/ui/DateSelector';
import { Dropdown } from '@/src/core/ui/Dropdown';
import { Screen } from '@/src/core/ui/Screen';
import { Skeleton } from '@/src/core/ui/Skeleton';
import { useToast } from '@/src/core/ui/Toast';
import { useKarenBoxLabelsStore, type BoxLabelOrder } from '@/src/tenants/karen/state/karen-box-labels-store';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export function KarenBoxLabelsScreen() {
  const { showError, showSuccess } = useToast();
  const {
    selectedDate,
    orders,
    ordersLoading,
    ordersError,
    formats,
    defaultFormat,
    formatsLoading,
    formatsError,
    generating,
    setDate,
    loadOrders,
    loadFormats,
    generate,
    reset,
  } = useKarenBoxLabelsStore();

  // Saved PDFs on this phone, by OPL -- for the per-order badge and the sheet.
  const [saved, setSaved] = useState<Record<string, SavedBoxLabels[]>>({});
  const [selected, setSelected] = useState<BoxLabelOrder | null>(null);
  const [savedSheetOpen, setSavedSheetOpen] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [chosenFormat, setFormat] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void loadOrders();
    }, [loadOrders]),
  );
  useEffect(() => () => reset(), [reset]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(orders.map(async (o) => [o.oplName, await getSavedBoxLabels(o.oplName)] as const)).then((entries) => {
      if (!cancelled) setSaved(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [orders]);

  // Formats are fetched when an order's dialog opens; `format` is the operator's
  // choice if still offered, else the server's default.
  useEffect(() => {
    if (selected) void loadFormats();
  }, [selected, loadFormats]);
  const format = useMemo(
    () => (chosenFormat && formats.includes(chosenFormat) ? chosenFormat : defaultFormat ?? formats[0] ?? null),
    [chosenFormat, formats, defaultFormat],
  );

  const formatOptions = useMemo(
    () => formats.map((f) => ({ label: f, value: f, sublabel: f === defaultFormat ? 'Default' : undefined })),
    [formats, defaultFormat],
  );

  const openOrder = (o: BoxLabelOrder) => {
    setDialogError(null);
    setSelected(o);
  };
  const closeOrder = () => setSelected(null);

  // One sample label (the first box) in the chosen format, so it can be
  // checked before the whole order is printed. Opened in the OS preview sheet;
  // kept out of the saved list, and the dialog stays open to adjust and print.
  const onPreview = async () => {
    if (!selected) return;
    setDialogError(null);
    setPreviewing(true);
    try {
      const outcome = await generate(selected.oplName, { printFormat: format ?? undefined, preview: true });
      if (!outcome.success) {
        setDialogError(outcome.message);
        return;
      }
      const path = await writeBase64PdfToFile(outcome.base64, outcome.filename);
      await previewPdf(path);
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : 'Could not open the PDF preview.');
    } finally {
      setPreviewing(false);
    }
  };

  const onGenerate = async () => {
    if (!selected) return;
    const opl = selected.oplName;
    setDialogError(null);
    const outcome = await generate(opl, { printFormat: format ?? undefined });
    if (!outcome.success) {
      setDialogError(outcome.message);
      return;
    }
    try {
      // Stamped, so a re-generation after packing more boxes is its own saved file
      // rather than overwriting the last one the saved list still points at.
      const filename = outcome.filename.replace(/\.pdf$/i, `-${Date.now()}.pdf`);
      const path = await writeBase64PdfToFile(outcome.base64, filename);
      const entry: SavedBoxLabels = { path, filename, count: outcome.count, savedAt: Date.now() };
      await recordSavedBoxLabels(opl, entry);
      setSaved((prev) => ({ ...prev, [opl]: [entry, ...(prev[opl] ?? [])] }));
      closeOrder();
      // Download only: the PDF is opened from Saved PDFs when wanted.
      showSuccess(`Downloaded ${outcome.count} box label${outcome.count === 1 ? '' : 's'}.`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not save the PDF.');
    }
  };

  const onSelectSaved = async (entry: SavedBoxLabels) => {
    setSavedSheetOpen(false);
    try {
      await previewPdf(entry.path);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not open the PDF preview.');
    }
  };

  const savedForSelected = selected ? saved[selected.oplName] ?? [] : [];
  const busy = generating || previewing;

  return (
    <>
      <Screen title="Box Labels" onRefresh={loadOrders}>
        <Card title="Delivery date">
          <DateSelector
            value={selectedDate}
            onChange={setDate}
            label="Delivery date"
            maxDate={null}
            resetTo={tomorrowISO()}
            resetLabel="Tomorrow"
          />
        </Card>

        {ordersError ? <Alert tone="danger">{ordersError}</Alert> : null}

        {ordersLoading && orders.length === 0 ? (
          <Skeleton height={72} />
        ) : orders.length === 0 && !ordersError ? (
          <Alert tone="info">No orders with box labels for this delivery date.</Alert>
        ) : (
          orders.map((o) => {
            const savedCount = (saved[o.oplName] ?? []).length;
            const allPrinted = o.boxes > 0 && o.printed >= o.boxes;
            return (
              <Pressable
                key={o.oplName}
                onPress={() => openOrder(o)}
                style={({ pressed }) => [s.row, pressed && s.rowPressed]}
              >
                <View style={s.rowText}>
                  <Text style={s.rowTitle} numberOfLines={1}>{o.customer || o.orderName}</Text>
                  <Text style={s.rowSub} numberOfLines={1}>{o.orderName} · {o.oplName}</Text>
                  <View style={s.badges}>
                    <Text style={s.badge}>{o.boxes} box{o.boxes === 1 ? '' : 'es'}</Text>
                    <Text style={[s.badge, allPrinted ? s.badgeDone : s.badgeTodo]}>
                      {allPrinted ? 'All printed' : `${o.printed}/${o.boxes} printed`}
                    </Text>
                    {savedCount > 0 ? (
                      <Text style={s.badge}>{savedCount} saved PDF{savedCount === 1 ? '' : 's'}</Text>
                    ) : null}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
              </Pressable>
            );
          })
        )}
      </Screen>

      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={closeOrder}>
        <Pressable style={s.backdrop} onPress={busy ? undefined : closeOrder}>
          <Pressable style={s.card} onPress={() => {}}>
            <Text style={s.cardTitle} numberOfLines={1}>{selected?.customer || selected?.orderName}</Text>
            <Text style={s.cardHint}>
              {selected?.orderName} · {selected?.boxes} box{selected?.boxes === 1 ? '' : 'es'}. Downloads every box
              label on this order as one PDF.
            </Text>
            <Dropdown
              label="Print format"
              value={format}
              options={formatOptions}
              placeholder={formatsLoading ? 'Loading…' : formatOptions.length === 0 ? 'Server default' : 'Select print format'}
              iconName="file-document-outline"
              onChange={setFormat}
              disabled={busy || formatOptions.length === 0}
            />
            {formatsError ? (
              <Text style={s.cardHint}>
                Couldn’t load print formats ({formatsError}). The server’s default will be used.
              </Text>
            ) : null}
            {dialogError ? (
              <View style={s.error}>
                <Ionicons name="alert-circle-outline" size={16} color={COLORS.danger} />
                <Text style={s.errorText}>{dialogError}</Text>
              </View>
            ) : null}
            <Button
              label="Preview sample"
              variant="outline"
              onPress={onPreview}
              loading={previewing}
              disabled={busy}
              iconLeft="eye-outline"
              style={{ alignSelf: 'stretch', marginTop: spacing.sm }}
            />
            <Button
              label="Download"
              onPress={onGenerate}
              loading={generating && !previewing}
              disabled={busy}
              iconLeft="download-outline"
              style={{ alignSelf: 'stretch' }}
            />
            {savedForSelected.length > 0 ? (
              <Button
                label={`Saved PDFs (${savedForSelected.length})`}
                variant="outline"
                onPress={() => setSavedSheetOpen(true)}
                disabled={busy}
                iconLeft="albums-outline"
                style={{ alignSelf: 'stretch' }}
              />
            ) : null}
            <Button label="Close" variant="ghost" onPress={closeOrder} disabled={busy} style={{ alignSelf: 'stretch' }} />
          </Pressable>
        </Pressable>
      </Modal>

      <SavedBoxLabelsSheet
        visible={savedSheetOpen}
        oplName={selected?.oplName ?? ''}
        entries={savedForSelected}
        onClose={() => setSavedSheetOpen(false)}
        onSelect={onSelectSaved}
      />
    </>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: COLORS.surface,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowPressed: { opacity: 0.7 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: COLORS.text },
  rowSub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  badge: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: COLORS.textMuted,
    backgroundColor: COLORS.bg,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  badgeDone: { color: '#166534', backgroundColor: '#F0FDF4' },
  badgeTodo: { color: '#92400E', backgroundColor: '#FFFBEB' },

  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.lg,
  },
  card: {
    width: '100%', maxWidth: 360, backgroundColor: COLORS.surface,
    borderRadius: borderRadius.lg, padding: spacing.lg, gap: spacing.xs,
  },
  cardTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: COLORS.text },
  cardHint: {
    fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted,
    marginBottom: spacing.sm,
  },
  error: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    marginTop: spacing.sm, padding: spacing.sm, borderRadius: 8, backgroundColor: '#FEF3F2',
  },
  errorText: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.danger },
});
