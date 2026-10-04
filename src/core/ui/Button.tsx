import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, borderRadius, fontFamily, fontSize, spacing } from '@/src/core/theme';

type Props = {
  label: string;
  onPress?: () => void;
  color?: string;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'outline' | 'ghost';
  iconLeft?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
  /** 'sm': a compact pill for secondary actions inside a card. */
  size?: 'md' | 'sm';
  /** Keep the label on one line, shrinking it a little to fit, instead of wrapping. */
  singleLine?: boolean;
};

export function Button({
  label,
  onPress,
  color = COLORS.primary,
  disabled,
  loading,
  variant = 'primary',
  iconLeft,
  style,
  size = 'md',
  singleLine,
}: Props) {
  const sm = size === 'sm';
  const isDisabled = !!disabled || !!loading;
  const isOutline = variant === 'outline';
  const isGhost = variant === 'ghost';
  const bg = isOutline || isGhost ? 'transparent' : color;
  const fg = isOutline || isGhost ? color : COLORS.textOnPrimary;
  const borderColor = isGhost ? 'transparent' : color;

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        s.btn,
        sm ? s.btnSm : null,
        {
          backgroundColor: bg,
          borderColor,
          opacity: isDisabled ? 0.45 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={s.inner}>
          {iconLeft ? <Ionicons name={iconLeft} size={sm ? 14 : 18} color={fg} /> : null}
          <Text
            style={[s.label, sm ? s.labelSm : null, { color: fg }]}
            // Small buttons have a fixed height, so they always keep one line.
            numberOfLines={singleLine || sm ? 1 : undefined}
            adjustsFontSizeToFit={singleLine || sm}
            minimumFontScale={0.75}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: {
    borderRadius: borderRadius.full,
    borderWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Small: one fixed height, so side-by-side buttons always line up.
  btnSm: { paddingVertical: 6, paddingHorizontal: spacing.md, minHeight: 34, height: 34 },
  inner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, maxWidth: '100%' },
  label: { fontFamily: fontFamily.bold, fontSize: fontSize.md, flexShrink: 1, textAlign: 'center' },
  labelSm: { fontFamily: fontFamily.regular, fontSize: fontSize.sm },
});
