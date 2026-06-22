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
}: Props) {
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
          {iconLeft ? <Ionicons name={iconLeft} size={18} color={fg} /> : null}
          <Text style={[s.label, { color: fg }]}>{label}</Text>
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
  inner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { fontFamily: fontFamily.bold, fontSize: fontSize.md },
});
