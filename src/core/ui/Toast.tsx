import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';
import { audio } from '@/src/core/audio';

type ToastKind = 'success' | 'error' | 'info';

type ToastState = { kind: ToastKind; message: string } | null;

type ToastContextValue = {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ToastState>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const present = useCallback((next: ToastState) => {
    if (timer.current) clearTimeout(timer.current);
    setState(next);
    Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const ms = next?.kind === 'error' ? 5000 : 2600;
    timer.current = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
        setState(null);
      });
    }, ms);
  }, [anim]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const value: ToastContextValue = {
    showSuccess: (message) => { audio.submit(); present({ kind: 'success', message }); },
    showError:   (message) => { audio.error();  present({ kind: 'error',   message }); },
    showInfo:    (message) => { present({ kind: 'info', message }); },
  };

  const iconName: keyof typeof Ionicons.glyphMap =
    state?.kind === 'success' ? 'checkmark-circle' :
    state?.kind === 'error'   ? 'alert-circle' :
                                'information-circle';
  const tint =
    state?.kind === 'success' ? COLORS.success :
    state?.kind === 'error'   ? COLORS.danger :
                                COLORS.primary;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {state ? (
        <SafeAreaView pointerEvents="none" style={styles.wrap} edges={['top']}>
          <Animated.View
            style={[
              styles.toast,
              {
                opacity: anim,
                transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
              },
            ]}
          >
            <Ionicons name={iconName} size={18} color={tint} />
            <Text style={styles.text} numberOfLines={4}>{state.message}</Text>
          </Animated.View>
        </SafeAreaView>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', zIndex: 9999 },
  toast: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: COLORS.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    maxWidth: '90%',
  },
  text: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.text, flexShrink: 1 },
});
