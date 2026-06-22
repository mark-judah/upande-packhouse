import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { COLORS, borderRadius, fontFamily, fontSize, spacing } from '@/src/core/theme';

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (next: T) => void;
}

/** Pill-shaped segmented control with a spring-animated indicator pill. */
export function Segmented<T extends string>({ value, options, onChange }: SegmentedProps<T>) {
  const [containerWidth, setContainerWidth] = useState(0);

  const activeIndex = useMemo(
    () => Math.max(0, options.findIndex((o) => o.value === value)),
    [value, options],
  );

  const padding = 4;
  const innerWidth = Math.max(0, containerWidth - padding * 2);
  const segmentWidth = options.length > 0 ? innerWidth / options.length : 0;
  const anim = useRef(new Animated.Value(activeIndex)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: activeIndex,
      useNativeDriver: true,
      friction: 8,
      tension: 60,
    }).start();
  }, [activeIndex, anim]);

  const onLayout = (e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width);

  return (
    <View style={s.container} onLayout={onLayout}>
      {segmentWidth > 0 ? (
        <Animated.View
          style={[
            s.indicator,
            {
              width: segmentWidth,
              transform: [
                {
                  translateX: anim.interpolate({
                    inputRange: options.map((_, i) => i),
                    outputRange: options.map((_, i) => i * segmentWidth),
                  }),
                },
              ],
            },
          ]}
        />
      ) : null}
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.7}
            style={s.btn}
          >
            <Text style={[s.label, active && s.labelActive]} numberOfLines={1}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: borderRadius.full,
    padding: 4,
    marginBottom: spacing.md,
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    backgroundColor: COLORS.surface,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    zIndex: 1,
  },
  label: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.textMuted },
  labelActive: { fontFamily: fontFamily.semiBold, color: COLORS.text },
});
