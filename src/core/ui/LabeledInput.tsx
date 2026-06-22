import { forwardRef } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';

type Props = TextInputProps & {
  label: string;
  /** MaterialCommunityIcons glyph name — kept on MCI for backwards-compat with
   *  the many feature screens that pass MCI names. New code targeting fresh
   *  apps should prefer Ionicons via the new primitives. */
  iconName?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
};

export const LabeledInput = forwardRef<TextInput, Props>(function LabeledInput(
  { label, iconName, style, ...rest },
  ref,
) {
  return (
    <View style={s.wrap}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <View style={s.field}>
        {iconName ? (
          <MaterialCommunityIcons
            name={iconName}
            size={18}
            color={COLORS.textMuted}
            style={{ marginLeft: spacing.md }}
          />
        ) : null}
        <TextInput
          ref={ref}
          placeholderTextColor={COLORS.textMuted}
          style={[s.input, !iconName && { paddingLeft: spacing.md }, style]}
          {...rest}
        />
      </View>
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
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  input: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: COLORS.text,
    padding: spacing.md,
  },
});
