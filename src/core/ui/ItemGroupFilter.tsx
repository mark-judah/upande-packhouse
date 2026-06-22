import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { COLORS, borderRadius, fontFamily, fontSize, spacing } from '@/src/core/theme';

export type ItemGroupOption = { name: string; count: number };

/** Horizontal, scrollable chip row for filtering a picker by item group. An
 *  "All" chip clears the filter; each group chip shows its count. Tapping the
 *  active group again clears it back to "All". Shared by the issuing and
 *  packing screens. */
export function ItemGroupFilter({
  label = 'Item group',
  groups,
  totalCount,
  selected,
  onSelect,
}: {
  label?: string;
  groups: ItemGroupOption[];
  totalCount: number;
  selected: string | null;
  onSelect: (group: string | null) => void;
}) {
  return (
    <View style={s.wrap}>
      <Text style={s.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
        <Chip label="All" count={totalCount} active={selected === null} onPress={() => onSelect(null)} />
        {groups.map((g) => (
          <Chip
            key={g.name}
            label={g.name}
            count={g.count}
            active={selected === g.name}
            onPress={() => onSelect(selected === g.name ? null : g.name)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function Chip({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.chip, active && s.chipActive]}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
      <View style={[s.chipBadge, active && s.chipBadgeActive]}>
        <Text style={[s.chipBadgeText, active && s.chipBadgeTextActive]}>{count}</Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: COLORS.text,
    marginBottom: spacing.sm,
  },
  row: { gap: spacing.sm, paddingRight: spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: {
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: COLORS.textSecondary,
  },
  chipTextActive: { color: COLORS.textOnPrimary, fontFamily: fontFamily.semiBold },
  chipBadge: {
    minWidth: 18,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: borderRadius.full,
    backgroundColor: COLORS.surfaceAlt,
    alignItems: 'center',
  },
  chipBadgeActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
  chipBadgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    color: COLORS.textMuted,
  },
  chipBadgeTextActive: { color: COLORS.textOnPrimary },
});
