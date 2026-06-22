import { forwardRef } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';

type Props = TextInputProps & {
  label?: string;
  error?: string | null;
};

export const Input = forwardRef<TextInput, Props>(function Input(
  { label, error, style, ...rest },
  ref,
) {
  return (
    <View style={s.wrap}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={COLORS.textMuted}
        style={[s.input, error ? s.inputError : null, style]}
        {...rest}
      />
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
});

const s = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.sm,
    color: COLORS.text,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: COLORS.text,
    backgroundColor: COLORS.bg,
  },
  inputError: { borderColor: COLORS.danger },
  error: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.danger, marginTop: spacing.xs },
});
