import { useEffect, useRef } from 'react';
import { Animated, Easing, type DimensionValue, type ViewStyle } from 'react-native';
import { borderRadius as radii, COLORS } from '@/src/core/theme';

/** A grey placeholder block that pulses while content loads. Size it like the
 *  thing it stands in for, so the layout does not jump when data arrives. */
export function Skeleton({
  width = '100%',
  height = 14,
  radius = radii.sm,
  style,
}: {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: ViewStyle;
}) {
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius, backgroundColor: COLORS.border, opacity: pulse }, style]}
    />
  );
}
