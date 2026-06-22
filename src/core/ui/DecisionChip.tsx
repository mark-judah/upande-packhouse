import { Pressable, StyleSheet, Text } from 'react-native';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';

type Props = {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress?: () => void;
};

export function DecisionChip({ label, selected, disabled, onPress }: Props) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        s.chip,
        selected ? s.chipSelected : null,
        disabled ? s.chipDisabled : null,
        pressed && !disabled && { opacity: 0.85 },
      ]}
    >
      <Text style={[s.label, selected ? s.labelSelected : null]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  chip: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    minHeight: 44,
  },
  chipSelected: { borderColor: COLORS.text, backgroundColor: COLORS.text },
  chipDisabled: { opacity: 0.4 },
  label: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.textMuted },
  labelSelected: { fontFamily: fontFamily.semiBold, color: COLORS.textOnPrimary },
});
