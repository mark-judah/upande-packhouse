import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';

interface SpinnerProps {
  label?: string;
  size?: 'small' | 'large';
  inline?: boolean;
  color?: string;
}

/** Standard loading affordance — centred ActivityIndicator with an optional
 *  label below. Use `inline` for a compact row-style spinner. */
export function Spinner({ label, size = 'small', inline, color }: SpinnerProps) {
  const tint = color ?? COLORS.text;
  if (inline) {
    return (
      <View style={s.inline}>
        <ActivityIndicator size={size} color={tint} />
        {label ? <Text style={s.inlineLabel}>{label}</Text> : null}
      </View>
    );
  }
  return (
    <View style={s.block}>
      <ActivityIndicator size={size} color={tint} />
      {label ? <Text style={s.label}>{label}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  block: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  label: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  inlineLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
});
