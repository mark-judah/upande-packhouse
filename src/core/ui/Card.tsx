import { type ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';

export function Card({
  title,
  children,
  style,
}: {
  title?: string;
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[s.card, style]}>
      {title ? <Text style={s.title}>{title}</Text> : null}
      {children}
    </View>
  );
}

type AlertTone = 'info' | 'success' | 'warn' | 'danger';

const TONE_BG: Record<AlertTone, string> = {
  info: '#EEF2FF',
  success: '#F0FDF4',
  warn: '#FFFBEB',
  danger: '#FEF2F2',
};
const TONE_FG: Record<AlertTone, string> = {
  info: '#3730A3',
  success: '#166534',
  warn: '#92400E',
  danger: '#991B1B',
};
const TONE_ICON: Record<AlertTone, keyof typeof Ionicons.glyphMap> = {
  info: 'information-circle-outline',
  success: 'checkmark-circle-outline',
  warn: 'warning-outline',
  danger: 'alert-circle-outline',
};

export function Alert({
  tone = 'info',
  children,
}: {
  tone?: AlertTone;
  children: ReactNode;
}) {
  return (
    <View style={[s.alert, { backgroundColor: TONE_BG[tone] }]}>
      <Ionicons name={TONE_ICON[tone]} size={16} color={TONE_FG[tone]} style={{ marginTop: 1 }} />
      <Text style={[s.alertText, { color: TONE_FG[tone] }]}>{children}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: COLORS.text,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: spacing.md,
  },
  alert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
  },
  alertText: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    lineHeight: 19,
  },
});
