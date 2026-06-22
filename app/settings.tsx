import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { Screen } from '@/src/core/ui/Screen';
import { Card } from '@/src/core/ui/Card';
import { Button } from '@/src/core/ui/Button';
import { useToast } from '@/src/core/ui/Toast';
import { useAuthStore } from '@/src/core/auth/store';
import * as Biometric from '@/src/core/biometric';
import { COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';

export default function SettingsScreen() {
  const fullName = useAuthStore((s) => s.fullName);
  const email = useAuthStore((s) => s.email);
  const instanceUrl = useAuthStore((s) => s.instanceUrl);
  const biometricEnabled = useAuthStore((s) => s.biometricEnabled);
  const setBiometricEnabled = useAuthStore((s) => s.setBiometricEnabled);
  const logout = useAuthStore((s) => s.logout);
  const forgetDevice = useAuthStore((s) => s.forgetDevice);
  const { showSuccess, showError } = useToast();

  const [moduleReady, setModuleReady] = useState(false);
  const [hardwareReady, setHardwareReady] = useState(false);
  const [updatesChecking, setUpdatesChecking] = useState(false);

  useEffect(() => {
    setModuleReady(Biometric.isModuleAvailable());
    Biometric.isAvailable().then(setHardwareReady);
  }, []);

  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const runtimeVersion = (Updates.runtimeVersion as string | undefined) || appVersion;

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

  const onCheckUpdates = async () => {
    if (__DEV__) {
      showError('OTA updates are unavailable in development.');
      return;
    }
    setUpdatesChecking(true);
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        showSuccess("You're on the latest version.");
        return;
      }
      const fetched = await Updates.fetchUpdateAsync();
      if (fetched.isNew) {
        Alert.alert('Update ready', 'Reload now to apply it?', [
          { text: 'Later', style: 'cancel' },
          { text: 'Reload', onPress: () => Updates.reloadAsync() },
        ]);
      } else {
        showSuccess("You're on the latest version.");
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not check for updates.');
    } finally {
      setUpdatesChecking(false);
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
              {(fullName || email || '?').slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.userName}>{fullName || email || 'Signed in'}</Text>
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

      <Card title="App">
        <View style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.rowLabel}>Version</Text>
            <Text style={s.rowHint}>
              {appVersion}
              {runtimeVersion && runtimeVersion !== appVersion ? `  ·  runtime ${runtimeVersion}` : ''}
            </Text>
          </View>
        </View>
        <View style={{ height: spacing.md }} />
        <Button
          label={updatesChecking ? 'Checking…' : 'Check for updates'}
          variant="outline"
          onPress={onCheckUpdates}
          loading={updatesChecking}
          iconLeft="cloud-download-outline"
        />
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
  userMeta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
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
