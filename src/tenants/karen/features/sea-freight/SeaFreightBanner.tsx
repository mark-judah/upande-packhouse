import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { borderRadius, fontFamily, fontSize, spacing } from '@/src/core/theme';
import { karenSeaFreightApi } from '@/src/tenants/karen/api/karen-sea-freight-api';

type Marks = { opls: Set<string>; orders: Set<string> };
const EMPTY: Marks = { opls: new Set(), orders: new Set() };
// one read shared by every screen and row that asks within 30 s
let cached: { at: number; marks: Marks } | null = null;
let pending: Promise<Marks> | null = null;
function readMarks(): Promise<Marks> {
  if (cached && Date.now() - cached.at < 30_000) return Promise.resolve(cached.marks);
  if (!pending) {
    pending = karenSeaFreightApi
      .marks()
      .then((m) => {
        cached = { at: Date.now(), marks: { opls: new Set(m.pickLists), orders: new Set(m.salesOrders) } };
        return cached.marks;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

/** The pick lists and sales orders of open sea freight orders, read whenever the screen comes into view. */
export function useSeaFreightMarks(): Marks {
  const [marks, setMarks] = useState<Marks>(cached?.marks ?? EMPTY);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      readMarks()
        .then((m) => {
          if (live) setMarks(m);
        })
        .catch(() => {});
      return () => {
        live = false;
      };
    }, []),
  );
  return marks;
}

/** The Sea Freight banner the Packing screen shows on a sea freight pick list, for every screen after it. */
export function SeaFreightBanner({ compact }: { compact?: boolean }) {
  return (
    <View style={[s.banner, compact && s.compact]}>
      <MaterialCommunityIcons name="ferry" size={compact ? 14 : 18} color="#fff" />
      <Text style={[s.text, compact && s.textCompact]}>SEA FREIGHT</Text>
    </View>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: '#0369A1',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  compact: { alignSelf: 'flex-start', paddingVertical: 2, paddingHorizontal: spacing.sm, gap: 4, marginTop: 4 },
  text: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: '#fff', letterSpacing: 1 },
  textCompact: { fontSize: fontSize.xs },
});
