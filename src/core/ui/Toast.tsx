import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
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
        // Centred on screen, clear of the title bar; taps pass through.
        <View pointerEvents="none" style={styles.wrap}>
          <Animated.View
            style={[
              styles.toast,
              {
                opacity: anim,
                transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
              },
            ]}
          >
            <Ionicons name={iconName} size={18} color={tint} />
            <Text style={styles.text} numberOfLines={state.kind === 'error' ? 8 : 4}>{state.message}</Text>
          </Animated.View>
        </View>
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
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: COLORS.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 6,
    maxWidth: '90%',
  },
  text: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.text, flexShrink: 1 },
});
