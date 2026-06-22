import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, borderRadius, fontFamily, fontSize, spacing } from '@/src/core/theme';
import { useNetworkStore } from '@/src/core/network/store';

/** Sticky banner shown at the top of every screen when offline. */
export function OfflineBanner() {
  const online = useNetworkStore((s) => s.online);
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: online ? 0 : 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [online, anim]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        s.wrap,
        {
          paddingTop: insets.top + 4,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [-(insets.top + 56), 0],
              }),
            },
          ],
          opacity: anim,
        },
      ]}
    >
      <View style={s.banner}>
        <Ionicons name="cloud-offline-outline" size={16} color={COLORS.textOnPrimary} />
        <Text style={s.text} numberOfLines={1}>
          You&apos;re offline — check your network connection
        </Text>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5000,
    elevation: 16,
    alignItems: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: '#1F2937',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    maxWidth: '90%',
  },
  text: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.xs,
    color: COLORS.textOnPrimary,
    flexShrink: 1,
  },
});
