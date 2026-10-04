import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/src/core/ui/Button';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';
import {
  REPLACE_REASONS,
  type IssuedOfflineInfo,
  type ReplaceReason,
  type ReplaceSheet,
  type ReplacementCandidate,
} from '@/src/tenants/karen/state/karen-issuing-store';

/**
 * Pick a bucket to stand in for one that cannot be found at issuing -- the
 * same sheet the Quality app's remote-transfer requests use: why, then the
 * matching buckets, best match first. The replacement is issued afterwards by
 * scanning it like any other bucket. "Issued offline" first checks which line the
 * bucket already went to: this OPL's own line marks it issued, nothing replaced.
 */
export function ReplacePicker({
  sheet,
  onClose,
  onPick,
  onCheckIssued,
  onMarkIssued,
}: {
  sheet: ReplaceSheet | null;
  onClose: () => void;
  onPick: (c: ReplacementCandidate, reason: ReplaceReason) => void;
  onCheckIssued: () => Promise<IssuedOfflineInfo>;
  /** `line`: the line (team) it was issued to, for the confirmation. */
  onMarkIssued: (line: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState<ReplaceReason>('Missing');
  const candidates = sheet?.candidates ?? [];
  // Default to the best match each time the sheet opens for a bucket.
  const firstId = candidates[0]?.bucket ?? null;
  const item = sheet?.item;
  useEffect(() => {
    setSelected(firstId);
    setReason('Missing');
  }, [item, firstId]);

  // "Issued offline": look up once per bucket where it was issued.
  const issueKey = item && reason === 'Issued offline' ? item : null;
  const [issueRes, setIssueRes] = useState<{ key: object; info: IssuedOfflineInfo } | null>(null);
  useEffect(() => {
    if (!issueKey || issueRes?.key === issueKey) return;
    let live = true;
    onCheckIssued().then((info) => live && setIssueRes({ key: issueKey, info }));
    return () => {
      live = false;
    };
  }, [issueKey, issueRes, onCheckIssued]);
  const issued = issueKey && issueRes?.key === issueKey ? issueRes.info : null;
  const issuedLoading = !!issueKey && !issued;
  const issuedOk = issued?.kind === 'ok' ? issued : null;
  const sameLine = !!issuedOk?.sameLine;
  const issuedWhere = issuedOk
    ? issuedOk.issuedTo.map((r) => `${r.team || 'no team'} (${r.orderName})`).join(', ')
    : '';

  // Issued offline to this OPL's own line: it is marked issued, never replaced.
  const offlineHere = reason === 'Issued offline' && sameLine;

  const chosen = candidates.find((c) => c.bucket === selected) ?? null;
  const needed = sheet?.neededQty ?? (item ? Number(item.qty) || null : null);

  return (
    <Modal visible={!!sheet} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.sheetBackdrop} onPress={onClose} />
      <View style={s.sheet}>
        <View style={s.sheetHandle} />
        <Text style={s.sheetTitle}>Replace {item?.bucket}</Text>
        <Text style={s.sheetSub} numberOfLines={2}>
          {[
            [item?.variety, item?.stemLength].filter(Boolean).join(' · '),
            needed != null ? `${Math.round(needed)} stems needed` : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        <View style={s.reasonRow}>
          {REPLACE_REASONS.map((r) => (
            <Pressable
              key={r}
              onPress={() => setReason(r)}
              style={[s.reasonChip, reason === r && s.reasonChipOn]}
              accessibilityRole="radio"
              accessibilityState={{ selected: reason === r }}
            >
              <Text style={[s.reasonText, reason === r && s.reasonTextOn]}>{r}</Text>
            </Pressable>
          ))}
        </View>
        {reason === 'Issued offline' ? (
          <Text style={[s.issuedNote, sameLine && s.issuedNoteSame]}>
            {issuedLoading
              ? 'Checking where it was issued…'
              : issued?.kind === 'error'
                ? issued.message
                : issuedWhere
                  ? `Issued to ${issuedWhere}.${
                      sameLine ? ' Same line: mark it issued, nothing to replace.' : ' Another line: replace it.'
                    }`
                  : 'Not issued to any line yet. Replace it instead.'}
          </Text>
        ) : null}

        {sheet?.loading ? (
          <Text style={s.repNone}>Finding matching buckets…</Text>
        ) : (
          <>
            {candidates.length && sheet?.message ? (
              // Nothing at the sales farm: these come from remote farms by truck.
              <View style={s.remoteNote}>
                <Ionicons name="bus-outline" size={14} color={COLORS.text} />
                <Text style={s.remoteNoteText}>{sheet.message}</Text>
              </View>
            ) : null}
            {candidates.length && sheet?.warning ? (
              <View style={[s.remoteNote, s.warnNote]}>
                <Ionicons name="warning-outline" size={14} color="#B54708" />
                <Text style={[s.remoteNoteText, s.warnNoteText]}>{sheet.warning}</Text>
              </View>
            ) : null}
            <Text style={s.repCount}>
              {candidates.length} matching bucket{candidates.length === 1 ? '' : 's'}
            </Text>
            <ScrollView style={s.sheetList} contentContainerStyle={{ paddingBottom: spacing.sm }}>
              {candidates.map((c, i) => {
                const on = c.bucket === selected;
                return (
                  <Pressable
                    key={`${c.bucket}-${i}`}
                    onPress={() => setSelected(c.bucket)}
                    disabled={offlineHere}
                    style={[s.repRow, on && s.repRowOn, offlineHere && s.repRowOff]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                  >
                    <Ionicons
                      name={on ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={on ? COLORS.text : COLORS.textMuted}
                    />
                    <View style={{ flex: 1 }}>
                      <View style={s.repTop}>
                        <Text style={s.repId}>{c.bucket}</Text>
                        {i === 0 ? (
                          <View style={s.repBest}>
                            <Text style={s.repBestText}>Best match</Text>
                          </View>
                        ) : null}
                        {c.farm ? (
                          <View style={s.repFarm}>
                            <Text style={s.repFarmText}>{c.farm}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={s.repMeta} numberOfLines={1}>
                        {[
                          c.stemLength
                            ? /^\d+(\.\d+)?$/.test(c.stemLength)
                              ? `${c.stemLength}cm`
                              : c.stemLength
                            : '',
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
              })}
            </ScrollView>
            {!candidates.length ? (
              <Text style={s.repNone}>{sheet?.message || `No bucket matches ${item?.bucket}.`}</Text>
            ) : null}
          </>
        )}

        <View style={s.repActions}>
          <Button label="Cancel" variant="outline" size="sm" singleLine onPress={onClose} style={{ flex: 1 }} />
          {candidates.length ? (
            <Button
              size="sm"
              singleLine
              label={chosen ? `Replace with ${chosen.bucket}` : 'Replace'}
              iconLeft="swap-horizontal"
              onPress={() => chosen && onPick(chosen, reason)}
              // Issued offline to this same line: nothing to replace, so Replace is greyed out.
              disabled={!chosen || sheet?.submitting || offlineHere || (reason === 'Issued offline' && issuedLoading)}
              loading={sheet?.submitting && !offlineHere}
              style={{ flex: 2 }}
            />
          ) : null}
        </View>
        {offlineHere ? (
          <View style={s.repActions}>
            <Button
              size="sm"
              singleLine
              label="Mark as issued"
              iconLeft="checkmark-done-outline"
              onPress={() =>
                onMarkIssued(issuedOk?.issuedTo.find((r) => r.sameLine)?.team || issuedOk?.line || '')
              }
              disabled={sheet?.submitting}
              loading={sheet?.submitting}
              style={{ flex: 1 }}
            />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '80%',
    backgroundColor: COLORS.surface ?? '#fff',
    borderTopLeftRadius: borderRadius.lg ?? 16,
    borderTopRightRadius: borderRadius.lg ?? 16,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: spacing.sm,
  },
  sheetTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: COLORS.text },
  sheetSub: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  reasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  reasonChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  reasonChipOn: { backgroundColor: COLORS.text, borderColor: COLORS.text },
  reasonText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: COLORS.text },
  reasonTextOn: { color: '#fff' },
  issuedNote: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.xs,
    color: COLORS.textSecondary,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceAlt,
  },
  issuedNoteSame: { color: '#067647', backgroundColor: '#ECFDF3' },
  sheetList: { marginTop: spacing.sm },
  repCount: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.xs,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: spacing.md,
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
  repRowOff: { opacity: 0.45 },
  repRowOn: { borderColor: COLORS.text, backgroundColor: COLORS.surfaceAlt },
  repTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  repId: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: COLORS.text },
  repBest: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: '#ECFDF3' },
  repFarm: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: '#EFF8FF' },
  repFarmText: { fontFamily: fontFamily.semiBold, fontSize: 10, color: '#175CD3' },
  remoteNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceAlt,
  },
  remoteNoteText: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.text },
  warnNote: { backgroundColor: '#FFFAEB' },
  warnNoteText: { color: '#B54708' },
  repBestText: { fontFamily: fontFamily.semiBold, fontSize: 10, color: '#067647' },
  repMeta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textSecondary, marginTop: 2 },
  repShelf: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  repShelfText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted, flexShrink: 1 },
  repNone: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: COLORS.textMuted,
    marginVertical: spacing.sm,
  },
  repActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
});
