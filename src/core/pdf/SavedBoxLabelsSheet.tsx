import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';
import type { SavedBoxLabels } from './boxLabelsHistory';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Dependency-free time label ("14:32") -- Hermes only partially supports
 *  Intl, so this avoids toLocaleTimeString like the rest of core/date.ts. */
function timeLabel(at: number): string {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Props = {
  visible: boolean;
  oplName: string;
  entries: SavedBoxLabels[];
  onClose: () => void;
  onSelect: (entry: SavedBoxLabels) => void;
};

/** Every box-labels PDF already saved for this OPL, newest first -- so a
 *  re-print doesn't have to be regenerated to be looked at again. */
export function SavedBoxLabelsSheet({ visible, oplName, entries, onClose, onSelect }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <View style={s.header}>
            <Text style={s.title} numberOfLines={1}>Saved Labels — {oplName}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={COLORS.text} />
            </Pressable>
          </View>
          <ScrollView style={s.list}>
            {entries.map((entry, i) => (
              <Pressable
                key={`${entry.path}-${i}`}
                onPress={() => onSelect(entry)}
                style={({ pressed }) => [s.row, pressed && s.rowPressed]}
              >
                <Ionicons name="document-text-outline" size={22} color={COLORS.primary} />
                <View style={s.rowText}>
                  <Text style={s.rowFilename} numberOfLines={1}>{entry.filename}</Text>
                  <Text style={s.rowMeta}>
                    {entry.count} label{entry.count === 1 ? '' : 's'} · {timeLabel(entry.savedAt)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.lg,
  },
  card: {
    width: '100%', maxWidth: 400, maxHeight: '70%', backgroundColor: COLORS.surface,
    borderRadius: borderRadius.lg, padding: spacing.lg,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  title: { flex: 1, fontFamily: fontFamily.bold, fontSize: fontSize.md, color: COLORS.text, marginRight: spacing.sm },
  list: { marginTop: spacing.xs },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  rowPressed: { opacity: 0.6 },
  rowText: { flex: 1 },
  rowFilename: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.text },
  rowMeta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, marginTop: 2 },
});
