import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';
import { Screen } from '@/src/core/ui/Screen';
import { Segmented } from '@/src/core/ui/Segmented';
import { useDebugLogStore, type DebugLogEntry } from './debugLogStore';

type Filter = 'all' | 'network' | 'local' | 'errors';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'network', label: 'Network' },
  { value: 'local', label: 'Local' },
  { value: 'errors', label: 'Errors' },
];

function matches(entry: DebugLogEntry, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'errors') return entry.status === 'error';
  return entry.kind === filter;
}

function timeLabel(at: number): string {
  const d = new Date(at);
  return d.toLocaleTimeString(undefined, { hour12: false });
}

function statusColor(status: DebugLogEntry['status']): string {
  if (status === 'error') return COLORS.danger;
  if (status === 'success') return COLORS.success;
  return COLORS.warn;
}

function pretty(value: unknown): string {
  if (value === undefined) return '(none)';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** In-app viewer for every API call (payload + response/error, whether it
 *  succeeded or failed) and every local validation rejection, newest first.
 *  Exists because console.log (see core/api/log.ts) only reaches a terminal
 *  attached to Metro -- no help once packing is being tested on a real
 *  device, or a toast's message is too short to show the full reason. */
export function DebugLogScreen() {
  const entries = useDebugLogStore((s) => s.entries);
  const clear = useDebugLogStore((s) => s.clear);
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => entries.filter((e) => matches(e, filter)), [entries, filter]);

  return (
    <Screen
      title="Debug Log"
      hideMenu
      headerRight={
        <Pressable onPress={() => router.back()} hitSlop={10} style={s.headerBtn} accessibilityLabel="Close">
          <Ionicons name="close" size={22} color={COLORS.text} />
        </Pressable>
      }
    >
      <Segmented value={filter} options={FILTERS} onChange={setFilter} />

      {entries.length > 0 ? (
        <Pressable onPress={clear} style={s.clearBtn}>
          <Ionicons name="trash-outline" size={14} color={COLORS.textMuted} />
          <Text style={s.clearText}>Clear log ({entries.length})</Text>
        </Pressable>
      ) : null}

      {filtered.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="pulse-outline" size={28} color={COLORS.textMuted} />
          <Text style={s.emptyText}>
            {entries.length === 0
              ? 'Nothing logged yet — scan or submit something and it will show up here.'
              : 'No entries match this filter.'}
          </Text>
        </View>
      ) : (
        filtered.map((entry) => {
          const isOpen = expanded === entry.id;
          return (
            <Pressable
              key={entry.id}
              onPress={() => setExpanded(isOpen ? null : entry.id)}
              style={s.row}
            >
              <View style={s.rowHead}>
                <Ionicons
                  name={entry.kind === 'network' ? 'cloud-outline' : 'phone-portrait-outline'}
                  size={16}
                  color={COLORS.textMuted}
                />
                <View style={[s.dot, { backgroundColor: statusColor(entry.status) }]} />
                <Text style={s.title} numberOfLines={isOpen ? undefined : 1}>
                  {entry.title}
                </Text>
                <Ionicons
                  name={isOpen ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={COLORS.textMuted}
                />
              </View>
              <View style={s.metaRow}>
                <Text style={s.meta}>{timeLabel(entry.at)}</Text>
                {entry.httpStatus !== undefined ? (
                  <Text style={s.meta}>HTTP {entry.httpStatus}</Text>
                ) : null}
                {entry.durationMs !== undefined ? (
                  <Text style={s.meta}>{entry.durationMs}ms</Text>
                ) : null}
              </View>

              {isOpen ? (
                <View style={s.detail}>
                  {entry.kind === 'network' ? (
                    <>
                      <Text style={s.detailLabel}>Payload</Text>
                      <Text style={s.detailBody} selectable>{pretty(entry.payload)}</Text>
                      <Text style={s.detailLabel}>Response</Text>
                      <Text style={s.detailBody} selectable>{pretty(entry.response)}</Text>
                    </>
                  ) : (
                    <>
                      <Text style={s.detailLabel}>Context</Text>
                      <Text style={s.detailBody} selectable>{pretty(entry.context)}</Text>
                    </>
                  )}
                </View>
              ) : null}
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  headerBtn: { width: 32, alignItems: 'center', justifyContent: 'center', padding: 4 },
  clearBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    alignSelf: 'flex-start', marginBottom: spacing.md,
  },
  clearText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  emptyText: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, textAlign: 'center' },
  row: {
    backgroundColor: COLORS.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  title: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.text },
  metaRow: { flexDirection: 'row', gap: spacing.md, marginTop: 4, marginLeft: 24 },
  meta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  detail: { marginTop: spacing.sm, gap: spacing.xs },
  detailLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: COLORS.textMuted, marginTop: spacing.xs },
  detailBody: {
    fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.text,
    backgroundColor: COLORS.bgMuted, borderRadius: borderRadius.sm, padding: spacing.sm,
  },
});
