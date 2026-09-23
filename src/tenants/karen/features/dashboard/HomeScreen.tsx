import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Screen } from '@/src/core/ui/Screen';
import { COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';
import { useAuthStore } from '@/src/core/auth/store';
import { useNetworkStore } from '@/src/core/network/store';
import { useKarenDashboardStore } from '@/src/tenants/karen/state/karen-dashboard-store';
import { PackhouseDashboard } from '@/src/tenants/karen/features/dashboard/PackhouseDashboard';

export function KarenHomeScreen() {
  const fullName = useAuthStore((s) => s.fullName);
  const email = useAuthStore((s) => s.email);
  const firstName = (fullName || email || 'there').split(' ')[0];

  const load = useKarenDashboardStore((s) => s.load);
  const initNetwork = useNetworkStore((s) => s.init);

  useEffect(() => {
    initNetwork();
    load();
  }, [initNetwork, load]);

  return (
    <Screen title="Packhouse" onRefresh={load}>
      <Text style={s.greeting}>Welcome back, {firstName}</Text>
      <PackhouseDashboard />
    </Screen>
  );
}

const s = StyleSheet.create({
  greeting: {
    fontFamily: fontFamily.semiBold,
    fontSize: fontSize.lg,
    color: COLORS.text,
    marginBottom: spacing.md,
  },
});
