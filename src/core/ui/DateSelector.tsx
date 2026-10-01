import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { formatDayLabel, shiftISO, todayISO } from '@/src/core/date';
import { COLORS, borderRadius, fontFamily, fontSize, spacing } from '@/src/core/theme';

/** Day stepper for picking a date. Steps one day at a time with a quick-reset
 *  button. Capped at `maxDate` (default today; pass null to allow future dates).
 *  Value/onChange use YYYY-MM-DD. */
export function DateSelector({
  value,
  onChange,
  label = 'Date',
  maxDate = todayISO(),
  resetTo,
  resetLabel = 'Today',
  compact = false,
}: {
  value: string;
  onChange: (iso: string) => void;
  label?: string;
  /** Furthest selectable date; null = no upper bound (future allowed). */
  maxDate?: string | null;
  /** Date the quick-reset button jumps to (default today). */
  resetTo?: string;
  resetLabel?: string;
  /** One short full-width row: arrows at the ends, the label as a small
   *  caption over the date between them. For cards where the stepper is
   *  secondary. */
  compact?: boolean;
}) {
  const reset = resetTo ?? todayISO();
  const atMax = maxDate != null && value >= maxDate;

  return (
    <View style={compact ? s.wrapCompact : s.wrap}>
      {compact ? null : <Text style={s.label}>{label}</Text>}
      <View style={s.row}>
        <Pressable
          style={[s.btn, compact && s.btnCompact]}
          onPress={() => onChange(shiftISO(value, -1))}
          hitSlop={6}
        >
          <MaterialCommunityIcons name="chevron-left" size={22} color={COLORS.text} />
        </Pressable>

        {compact ? (
          <View style={s.center}>
            <Text style={s.labelInline} numberOfLines={1}>
              {label}
            </Text>
            <Text style={s.dateTextCompact} numberOfLines={1}>
              {formatDayLabel(value)}
            </Text>
          </View>
        ) : (
          <View style={s.center}>
            <Text style={s.dateText}>{formatDayLabel(value)}</Text>
            <Text style={s.dateSub}>{value}</Text>
          </View>
        )}

        <Pressable
          style={[s.btn, compact && s.btnCompact, atMax && s.btnDisabled]}
          disabled={atMax}
          onPress={() => onChange(shiftISO(value, 1))}
          hitSlop={6}
        >
          <MaterialCommunityIcons
            name="chevron-right"
            size={22}
            color={atMax ? COLORS.textMuted : COLORS.text}
          />
        </Pressable>

        {value !== reset ? (
          <Pressable
            style={[s.todayBtn, compact && s.btnCompactHeight]}
            onPress={() => onChange(reset)}
            hitSlop={6}
          >
            <Text style={s.todayText}>{resetLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  wrapCompact: { marginBottom: spacing.xs },
  labelInline: {
    fontFamily: fontFamily.semiBold,
    fontSize: 9,
    lineHeight: 11,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  dateTextCompact: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    lineHeight: 18,
    color: COLORS.text,
  },
  btnCompact: { width: 32, height: 32 },
  btnCompactHeight: { height: 32 },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: COLORS.text,
    marginBottom: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  btn: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.4 },
  center: { flex: 1, alignItems: 'center' },
  dateText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  dateSub: { fontFamily: fontFamily.regular, fontSize: 10, color: COLORS.textMuted, marginTop: 1 },
  todayBtn: {
    paddingHorizontal: spacing.md,
    height: 40,
    borderRadius: borderRadius.sm,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: COLORS.textOnPrimary },
});
