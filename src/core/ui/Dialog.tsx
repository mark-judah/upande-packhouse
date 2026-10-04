import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';

type Tone = 'danger' | 'success' | 'warn' | 'info';

const TONE: Record<Tone, { fg: string; bg: string }> = {
  danger: { fg: COLORS.danger, bg: '#FEF2F2' },
  success: { fg: COLORS.success, bg: '#F0FDF4' },
  warn: { fg: COLORS.warn, bg: '#FFFBEB' },
  info: { fg: COLORS.text, bg: COLORS.surfaceAlt },
};

type DialogProps = {
  visible: boolean;
  /** Back button, backdrop tap and the ✕. Omit to make the dialog undismissable. */
  onClose?: () => void;
  title: string;
  subtitle?: ReactNode;
  /** Round badge above the title. */
  icon?: { name: keyof typeof Ionicons.glyphMap; tone?: Tone };
  /** Shows a ✕ in the corner (pickers and long dialogs; confirms use their Cancel). */
  closeButton?: boolean;
  /** Lays the title out left-aligned for list-style dialogs; confirms stay centred. */
  align?: 'center' | 'left';
  /** Body scrolls inside the card once it outgrows the screen. */
  children?: ReactNode;
  /** Footer row, usually <Button>s with flex. */
  actions?: ReactNode;
  /** Ignore backdrop / back while something is in flight. */
  busy?: boolean;
};

/** The app's centred dialog: dimmed backdrop, white rounded card, optional icon
 *  badge, title, scrollable body and an action row. Every small modal (confirms,
 *  results, pickers) uses it so they look and behave the same. */
export function Dialog({
  visible,
  onClose,
  title,
  subtitle,
  icon,
  closeButton,
  align = 'center',
  children,
  actions,
  busy,
}: DialogProps) {
  const dismiss = busy ? undefined : onClose;
  const tone = TONE[icon?.tone ?? 'info'];
  const left = align === 'left';
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss ?? (() => {})} statusBarTranslucent>
      <View style={s.wrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
        <View style={s.card}>
          {closeButton && onClose ? (
            <Pressable onPress={dismiss} hitSlop={10} style={s.close} accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={COLORS.textSecondary} />
            </Pressable>
          ) : null}
          {icon ? (
            <View style={[s.icon, { backgroundColor: tone.bg }, left && s.selfStart]}>
              <Ionicons name={icon.name} size={26} color={tone.fg} />
            </View>
          ) : null}
          <Text style={[s.title, left && s.textLeft, closeButton && s.titleWithClose]}>{title}</Text>
          {subtitle ? (
            typeof subtitle === 'string' ? (
              <Text style={[s.subtitle, left && s.textLeft]}>{subtitle}</Text>
            ) : (
              subtitle
            )
          ) : null}
          {children ? (
            <ScrollView
              style={s.body}
              contentContainerStyle={s.bodyContent}
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              {children}
            </ScrollView>
          ) : null}
          {actions ? <View style={s.actions}>{actions}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

/** Label / value line for a dialog's detail list. Renders nothing without a value. */
export function DialogRow({ label, value }: { label: string; value?: ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

/** Grey rounded box grouping DialogRows. */
export function DialogList({ children }: { children: ReactNode }) {
  return <View style={s.list}>{children}</View>;
}

/** A step that slides up from the bottom over the screen it belongs to (pick a
 *  row, then answer in the sheet instead of scrolling to the end of the page). */
export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  busy,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  /** Ignore backdrop / back / ✕ while something is in flight. */
  busy?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const dismiss = busy ? undefined : onClose;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={dismiss ?? (() => {})} statusBarTranslucent>
      <KeyboardAvoidingView style={s.sheetWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={s.sheetBackdrop} onPress={dismiss} />
        <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <View style={s.flex}>
              <Text style={s.sheetTitle} numberOfLines={1}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={s.sheetSubtitle} numberOfLines={2}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={dismiss} hitSlop={10} style={s.headerClose} accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={COLORS.textSecondary} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" bounces={false} contentContainerStyle={s.sheetBody}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Header for a full-screen modal (search pickers): title on the left, ✕ on the
 *  right, clear of the status bar. */
export function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.header, { paddingTop: Math.max(insets.top, spacing.md) }]}>
      <Text style={s.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <Pressable onPress={onClose} hitSlop={10} style={s.headerClose} accessibilityLabel="Close">
        <Ionicons name="close" size={20} color={COLORS.textSecondary} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '88%',
    backgroundColor: COLORS.surface,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  close: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  selfStart: { alignSelf: 'flex-start' },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.lg,
    color: COLORS.text,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  titleWithClose: { paddingHorizontal: spacing.xl },
  textLeft: { textAlign: 'left', paddingHorizontal: 0, paddingRight: spacing.xl },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: spacing.xs,
    alignSelf: 'stretch',
  },
  body: { alignSelf: 'stretch', marginTop: spacing.md, flexGrow: 0 },
  bodyContent: { paddingBottom: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignSelf: 'stretch', marginTop: spacing.lg },
  list: {
    alignSelf: 'stretch',
    borderRadius: borderRadius.md,
    backgroundColor: COLORS.surfaceAlt,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  rowLabel: { flexShrink: 0, maxWidth: '50%', fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.textMuted },
  rowValue: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text, textAlign: 'right' },
  flex: { flex: 1 },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: COLORS.overlay },
  sheet: {
    maxHeight: '88%',
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingTop: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: spacing.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  sheetTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: COLORS.text },
  sheetSubtitle: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textSecondary, marginTop: 2 },
  sheetBody: { padding: spacing.lg, gap: spacing.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  headerTitle: { flex: 1, fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: COLORS.text },
  headerClose: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: COLORS.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.md,
  },
});
