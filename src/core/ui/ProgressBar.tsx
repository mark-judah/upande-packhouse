import { StyleSheet, View } from 'react-native';
import { COLORS } from '@/src/core/theme';

type Props = {
  /** 0..1+ — values above 1 are clamped visually but the colour reflects "exceeded". */
  value: number;
  exceeded?: boolean;
  height?: number;
};

export function ProgressBar({ value, exceeded, height = 6 }: Props) {
  const clamped = Math.max(0, Math.min(value, 1.5));
  const widthPct = (clamped / 1.5) * 100;
  return (
    <View style={[s.track, { height, borderRadius: height / 2 }]}>
      <View
        style={[
          s.fill,
          { width: `${widthPct}%`, height, borderRadius: height / 2 },
          exceeded ? s.fillExceeded : null,
        ]}
      />
    </View>
  );
}

const s = StyleSheet.create({
  track: { backgroundColor: COLORS.border, overflow: 'hidden' },
  fill: { backgroundColor: COLORS.text },
  fillExceeded: { backgroundColor: COLORS.danger },
});
