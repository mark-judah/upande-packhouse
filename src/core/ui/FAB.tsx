import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  TouchableOpacity,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, shadow } from '@/src/core/theme';

interface FABProps {
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  visible?: boolean;
  /** When true, morph into a top-right × close affordance. */
  expanded?: boolean;
  color?: string;
  style?: ViewStyle;
  /** Optional Y for the expanded "close" position. Defaults to ~12% from top. */
  expandedTopY?: number | null;
}

const FAB_SIZE = 56;

/** Floating action button — 56×56 round, anchored bottom-right. When expanded
 *  it morphs into the top-right close button of an open sheet (translate +
 *  rotate 45° + scale + white surface fade). */
export function FAB({
  icon = 'add',
  onPress,
  visible = true,
  expanded = false,
  color,
  style,
  expandedTopY,
}: FABProps) {
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: expanded ? 1 : 0,
      duration: 380,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [expanded, progress]);

  if (!visible) return null;

  const bottom = insets.bottom + 8;
  const screenH = Dimensions.get('window').height;
  const fallbackTop = Math.max(insets.top + 16, screenH * 0.12);
  const cornerTop = (expandedTopY ?? fallbackTop) + 12;
  const restingTop = screenH - bottom - FAB_SIZE;
  const translateYDelta = cornerTop - restingTop;

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, translateYDelta],
  });
  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });
  const scale = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 0.92, 0.8],
  });
  const surfaceOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const iconColor = expanded ? COLORS.text : COLORS.textOnPrimary;

  return (
    <Animated.View
      style={[
        s.fab,
        {
          backgroundColor: color ?? COLORS.primary,
          bottom,
          transform: [{ translateY }, { rotate }, { scale }],
        },
        style,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, s.surfaceLayer, { opacity: surfaceOpacity }]}
      />
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={s.touch}>
        <Ionicons name={icon} size={26} color={iconColor} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.md,
    zIndex: 1000,
    elevation: 12,
  },
  surfaceLayer: {
    backgroundColor: COLORS.surface,
    borderRadius: FAB_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  touch: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: FAB_SIZE / 2,
  },
});
