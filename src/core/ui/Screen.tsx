import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';
import { Button } from './Button';
import { SideMenu } from './SideMenu';

type Props = {
  title?: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRefresh?: () => Promise<void> | void;
  hideMenu?: boolean;
  /** When false, the body is rendered as a flex View (no scroll). Default true. */
  scroll?: boolean;
  contentPadded?: boolean;
  children: ReactNode;
  footer?: ReactNode;
};

export function Screen({
  title,
  loading,
  error,
  onRetry,
  onRefresh,
  hideMenu,
  scroll = true,
  contentPadded = true,
  children,
  footer,
}: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleRefresh = onRefresh
    ? async () => {
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }
    : undefined;

  const padding = contentPadded ? s.content : { padding: 0 };

  let body: ReactNode;
  if (loading) {
    body = (
      <View style={s.center}>
        <ActivityIndicator size="large" color={COLORS.text} />
      </View>
    );
  } else if (error) {
    body = (
      <View style={s.center}>
        <Text style={s.errorTitle}>Something went wrong</Text>
        <Text style={s.errorMsg}>{error}</Text>
        {onRetry ? (
          <Button label="Retry" onPress={onRetry} style={{ marginTop: 16, alignSelf: 'stretch' }} />
        ) : null}
      </View>
    );
  } else if (scroll) {
    body = (
      <ScrollView
        contentContainerStyle={[s.content, padding]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        refreshControl={
          handleRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={COLORS.text}
              colors={[COLORS.text]}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    );
  } else {
    body = <View style={[s.flex, padding]}>{children}</View>;
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      {title ? (
        <View style={s.header}>
          {!hideMenu ? (
            <Pressable
              onPress={() => setMenuOpen(true)}
              hitSlop={10}
              style={s.menuBtn}
              accessibilityLabel="Open menu"
            >
              <Ionicons name="menu-outline" size={24} color={COLORS.text} />
            </Pressable>
          ) : (
            <View style={s.menuBtn} />
          )}
          <Text style={s.title} numberOfLines={1}>{title}</Text>
          {/* Symmetric spacer keeps the title centred */}
          <View style={s.menuBtn} />
        </View>
      ) : null}
      {!hideMenu ? <SideMenu visible={menuOpen} onClose={() => setMenuOpen(false)} /> : null}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.flex}
      >
        {body}
      </KeyboardAvoidingView>
      {footer ? <View style={s.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bgMuted },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  menuBtn: { width: 32, alignItems: 'center', justifyContent: 'center', padding: 4 },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.lg,
    color: COLORS.text,
  },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  errorTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.danger },
  errorMsg: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, textAlign: 'center' },
  footer: {
    padding: spacing.lg,
    backgroundColor: COLORS.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
});
