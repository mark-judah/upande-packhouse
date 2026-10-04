import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import { Screen } from '@/src/core/ui/Screen';
import { Card } from '@/src/core/ui/Card';
import { Button } from '@/src/core/ui/Button';
import { useToast } from '@/src/core/ui/Toast';
import { useAuthStore } from '@/src/core/auth/store';
import * as Biometric from '@/src/core/biometric';
import { ApkUpdateSection } from '@/src/core/updates/ApkUpdateSection';
import { useApkUpdate } from '@/src/core/updates/UpdateProvider';
import { compareVersions } from '@/src/core/updates/releases';
import { APP_VERSION, getServerVersions } from '@/src/core/version';
import { COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';
import { displayName, needsRealName } from '@/src/core/auth/roles-api';

export default function SettingsScreen() {
  const fullName = useAuthStore((s) => s.fullName);
  const email = useAuthStore((s) => s.email);
  // Name on top, the email under it: Settings is where the email is shown.
  const name = needsRealName(fullName) ? '' : displayName(fullName);
  const instanceUrl = useAuthStore((s) => s.instanceUrl);
  const biometricEnabled = useAuthStore((s) => s.biometricEnabled);
  const setBiometricEnabled = useAuthStore((s) => s.setBiometricEnabled);
  const logout = useAuthStore((s) => s.logout);
  const forgetDevice = useAuthStore((s) => s.forgetDevice);
  const { showSuccess, showError } = useToast();

  const [moduleReady] = useState(() => Biometric.isModuleAvailable());
  const [hardwareReady, setHardwareReady] = useState(false);
  const [siteApps, setSiteApps] = useState<{ label: string; version: string }[] | null>(null);
  // The newest version known: the newest GitHub release of any kind, or this
  // app once a JS update has put it past that -- so Latest bumps with every
  // update and never trails Installed.
  const newestRelease = useApkUpdate().check?.latestVersion ?? null;
  const latest =
    newestRelease && compareVersions(newestRelease, APP_VERSION) > 0 ? newestRelease : APP_VERSION;

  useEffect(() => {
    Biometric.isAvailable().then(setHardwareReady);
    getServerVersions().then(setSiteApps);
  }, []);

  const otaId = (Updates.updateId ?? '').slice(0, 8);
  const otaChannel = (Updates.channel as string | undefined) ?? '';
  const otaDate = Updates.createdAt ? Updates.createdAt.toISOString().slice(0, 10) : '';
  const codeLine = Updates.isEmbeddedLaunch
    ? 'embedded build'
    : `OTA ${otaId || '—'}${otaDate ? ' · ' + otaDate : ''}${otaChannel ? ' · ' + otaChannel : ''}`;

  const onToggleBiometric = async () => {
    if (!biometricEnabled) {
      if (!moduleReady) {
        Alert.alert('Update needed', 'Install the latest build to enable biometric unlock.');
        return;
      }
      if (!hardwareReady) {
        Alert.alert(
          'Biometric unavailable',
          'Enroll a fingerprint or face in your device settings, then try again.',
        );
        return;
      }
      const res = await Biometric.authenticate({
        promptMessage: 'Confirm biometric unlock',
        cancelLabel: 'Cancel',
        disableDeviceFallback: true,
      });
      if (!res.success) return;
    }
    try {
      await setBiometricEnabled(!biometricEnabled);
      showSuccess(biometricEnabled ? 'Biometric unlock disabled.' : 'Biometric unlock enabled.');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not update setting.');
    }
  };

  const onSignOut = () => {
    Alert.alert('Sign out?', 'You can sign back in with biometrics or your password.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  };

  const onForgetDevice = () => {
    Alert.alert(
      'Forget this device?',
      'Clears your session and disables biometric unlock.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forget',
          style: 'destructive',
          onPress: async () => {
            await forgetDevice();
            router.replace('/login');
          },
        },
      ],
    );
  };

  return (
    <Screen title="Settings">
      <Card>
        <View style={s.avatarRow}>
          <View style={s.avatar}>
            <Text style={s.avatarInitials}>
              {(name || '?').slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.userName}>{name || 'Signed in'}</Text>
            {email ? <Text style={s.userEmail}>{email}</Text> : null}
            {instanceUrl ? <Text style={s.userMeta}>{instanceUrl}</Text> : null}
          </View>
        </View>
      </Card>

      <Card title="Security">
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.rowLabel}>Biometric unlock</Text>
            <Text style={s.rowHint}>
              {!moduleReady
                ? 'Install latest build to enable'
                : !hardwareReady
                  ? 'Enroll fingerprint/face in device settings'
                  : 'Skip the password with fingerprint or face'}
            </Text>
          </View>
          <Toggle value={biometricEnabled} onChange={onToggleBiometric} />
        </View>
      </Card>

      <Card title="App & Server">
        {/* Server first (site, Frappe, ERPNext, the app's own backend), then this app. */}
        <InfoRow label="Site" value={instanceUrl ? instanceUrl.replace(/^https?:\/\//, '') : '—'} />
        {siteApps === null ? (
          <InfoRow label="Apps" value="Loading…" />
        ) : siteApps.length === 0 ? (
          <InfoRow label="Apps" value="Not available" />
        ) : (
          siteApps.map((a) => <InfoRow key={a.label} label={a.label} value={`v${a.version}`} />)
        )}
        <InfoRow label="Installed" value={`v${APP_VERSION}`} />
        <InfoRow label="Latest" value={`v${latest}`} />
        <InfoRow label="Code" value={codeLine} />
        <View style={{ height: spacing.md }} />
        <ApkUpdateSection />
      </Card>

      <Card title="Session">
        <Button label="Sign out" variant="outline" onPress={onSignOut} />
        <View style={{ height: spacing.sm }} />
        <Button
          label="Forget this device"
          variant="outline"
          color={COLORS.danger}
          onPress={onForgetDevice}
          iconLeft="trash-outline"
        />
      </Card>
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <Text style={[s.rowLabel, s.infoLabel]}>{label}</Text>
      <Text style={s.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <TouchableOpacity
      onPress={onChange}
      activeOpacity={0.8}
      style={[s.toggle, value && s.toggleOn]}
    >
      <View style={[s.toggleDot, value && s.toggleDotOn]} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: COLORS.textOnPrimary },
  userName: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  userEmail: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textSecondary, marginTop: 2 },
  userMeta: { fontFamily: fontFamily.bold, fontSize: fontSize.xs, color: COLORS.text, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: spacing.md, paddingVertical: 4,
  },
  infoLabel: { flexShrink: 1 },
  infoValue: { flexShrink: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textSecondary },
  rowLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  rowHint: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, marginTop: 2 },
  toggle: {
    width: 46, height: 26, borderRadius: 13,
    backgroundColor: '#E5E5E5', padding: 3, justifyContent: 'center',
  },
  toggleOn: { backgroundColor: COLORS.text },
  toggleDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.surface },
  toggleDotOn: { transform: [{ translateX: 20 }] },
});
