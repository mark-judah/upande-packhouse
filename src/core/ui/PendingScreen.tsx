import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from './Screen';
import { Card } from './Card';
import { COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';
import type { Tenant } from '@/src/core/tenant/instance-mapper';

type Props = {
  feature: string;
  // Kept so existing callers compile; the tenant name is no longer rendered.
  tenant?: Tenant | null;
};

export function PendingScreen({ feature }: Props) {
  return (
    <Screen title={feature}>
      <Card>
        <View style={s.wrap}>
          <View style={s.iconCircle}>
            <Ionicons name="construct-outline" size={28} color={COLORS.textMuted} />
          </View>
          <Text style={s.title}>Coming soon</Text>
        </View>
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  iconCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: COLORS.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, textAlign: 'center' },
});
