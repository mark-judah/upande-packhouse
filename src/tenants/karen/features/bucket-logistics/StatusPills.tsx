import { StyleSheet, Text, View } from 'react-native';
import { borderRadius, COLORS, fontFamily, fontSize } from '@/src/core/theme';
import type { TripStatusPill } from '@/src/tenants/karen/state/karen-bucket-logistics-store';

const PILL_COLOR: Record<TripStatusPill['key'], string> = {
  awaiting: '#D97706',
  loaded: '#7C3AED',
  in_transit: '#2563EB',
  shelved: COLORS.success,
};

export function StatusPills({ pills }: { pills: TripStatusPill[] }) {
  if (!pills.length) {
    return (
      <View style={s.row}>
        <Text style={s.empty}>No transfer activity yet</Text>
      </View>
    );
  }
  return (
    <View style={s.row}>
      {pills.map((p) => (
        <View key={p.key} style={[s.pill, { backgroundColor: PILL_COLOR[p.key] }]}>
          <Text style={s.pillTxt}>{p.label} {p.count}</Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  pill: { borderRadius: borderRadius.full, paddingHorizontal: 9, paddingVertical: 3 },
  pillTxt: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: '#fff' },
  empty: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
});
