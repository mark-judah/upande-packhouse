import { useCallback, useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { Button } from '@/src/core/ui/Button';
import { useToast } from '@/src/core/ui/Toast';
import { COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';
import { formatBytes, RELEASES_PAGE_URL } from './releases';
import { openInBrowser, openUnknownAppSourcesSettings } from './install-apk';
import { useApkUpdate } from './UpdateProvider';
import { showDialog } from '@/src/core/ui/DialogHost';
import { useNetworkStore } from '@/src/core/network/store';

/**
 * The one "Check for updates" button in Settings → App. A new APK is checked
 * first, on GitHub Releases: it carries a new runtime, so it supersedes any OTA
 * bundle. Only when the APK is current does it ask expo-updates for a JS patch
 * on the installed runtime. With an APK available the same button downloads it.
 */
export function ApkUpdateSection() {
  const { check, checking, checkError, downloading, progress, downloaded, installError, refresh, install } =
    useApkUpdate();
  const apk = check?.apk ?? null;
  const available = !!check?.available;
  const ready = available && !!apk && downloaded === apk.version;
  const { showSuccess, showError } = useToast();
  const [otaChecking, setOtaChecking] = useState(false);
  const online = useNetworkStore((st) => st.online);

  const label = useMemo(() => {
    if (downloading) {
      const written = formatBytes(progress?.written) ?? '0.0 MB';
      if (progress?.fraction == null) return `Downloading… ${written}`;
      return `Downloading ${Math.round(progress.fraction * 100)}% · ${written} of ${formatBytes(progress.total)}`;
    }
    if (checking || otaChecking) return 'Checking for updates…';
    if (ready && apk) return `Install v${apk.version}`;
    if (available && apk) {
      const size = formatBytes(apk.sizeBytes);
      return `Download v${apk.version}${size ? ` (${size})` : ''}`;
    }
    return 'Check for updates';
  }, [downloading, progress, checking, otaChecking, ready, available, apk]);

  /** A JS patch for the runtime this APK already has, through `updates.url`. */
  const checkOta = useCallback(async (apkChecked: boolean) => {
    if (__DEV__) {
      showSuccess('This APK is up to date. OTA updates are off in development.');
      return;
    }
    setOtaChecking(true);
    try {
      const result = await Updates.checkForUpdateAsync();
      const fetched = result.isAvailable ? await Updates.fetchUpdateAsync() : null;
      if (!fetched?.isNew) {
        // Without the APK check there may still be a newer APK; don't claim otherwise.
        showSuccess(apkChecked ? "You're on the latest version." : 'No JS update available.');
        return;
      }
      showDialog(
        'Update ready',
        'Reload now to apply it?',
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Reload', onPress: () => Updates.reloadAsync() },
        ],
        { name: 'cloud-download-outline', tone: 'success' },
      );
    } catch (err) {
      // No manifest for this runtime yet (a fresh APK, before its first OTA):
      // nothing newer exists, so that is "up to date", not a failure.
      if (/\b404\b/.test(String((err as Error)?.message ?? err))) {
        showSuccess(apkChecked ? "You're on the latest version." : 'No JS update available.');
        return;
      }
      // expo-updates' own text ("Call to function … rejected → Caused by: …") is
      // for the logs; the person gets a plain sentence.
      if (__DEV__) console.warn('[update] JS update check failed:', err);
      showError("Couldn't check for updates. Try again in a moment.");
    } finally {
      setOtaChecking(false);
    }
  }, [showSuccess, showError]);

  const onPress = useCallback(async () => {
    if (downloading || checking || otaChecking) return;
    if (available) {
      // Failures surface through `installError` below.
      await install();
      return;
    }
    // No internet: say so, without trying -- "could not reach" is for a phone that
    // is online but cannot get to the update page.
    if (!online) {
      showError("You're offline. Connect to the internet to check for updates.");
      return;
    }
    const result = await refresh();
    // A newer APK turns this button into its download; the status line says so.
    if (result?.available) return;
    await checkOta(result !== null);
  }, [downloading, checking, otaChecking, available, install, refresh, checkOta, online, showError]);

  const onInstallErrorHelp = useCallback(() => {
    if (!installError) return;
    const blocked = installError.kind === 'blocked';
    showDialog(
      'Update failed',
      installError.message,
      [
        { text: 'Close', style: 'cancel' },
        blocked
          ? { text: 'Allow installs', onPress: () => openUnknownAppSourcesSettings().catch(() => {}) }
          : {
              text: 'Open in browser',
              onPress: () => openInBrowser(apk?.downloadUrl ?? RELEASES_PAGE_URL).catch(() => {}),
            },
      ],
      { name: 'alert-circle-outline', tone: 'warn' },
    );
  }, [installError, apk]);

  let status: string | null = null;
  if (check) {
    // Only news is shown: being up to date needs no line of its own.
    if (ready && apk) status = `v${apk.version} is downloaded and ready to install.`;
    else if (available && apk) status = `v${apk.version} is available as a new APK.`;
  }

  return (
    <View>
      {status ? <Text style={[s.hint, available && s.accent]}>{status}</Text> : null}
      {checkError && !(checkError.kind === 'offline' && !online) ? (
        <Text style={s.error}>
          {checkError.message}
          {checkError.kind === 'rate_limited' ? (
            <Text style={s.link} onPress={() => Linking.openURL(RELEASES_PAGE_URL)}>
              {'  '}Open releases
            </Text>
          ) : null}
        </Text>
      ) : null}
      {installError ? (
        <Text style={s.error} onPress={onInstallErrorHelp}>
          {installError.message} <Text style={s.link}>What now?</Text>
        </Text>
      ) : null}
      <View style={{ height: spacing.sm }} />
      <Button
        label={label}
        variant={available || downloading ? 'primary' : 'outline'}
        onPress={onPress}
        loading={checking || otaChecking}
        disabled={downloading}
        iconLeft={ready ? 'checkmark-circle-outline' : available ? 'download-outline' : 'cloud-download-outline'}
      />
    </View>
  );
}

const s = StyleSheet.create({
  hint: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, marginTop: spacing.sm },
  accent: { fontFamily: fontFamily.semiBold, color: COLORS.primary },
  error: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.danger, marginTop: spacing.sm },
  link: { fontFamily: fontFamily.semiBold, color: COLORS.primary, textDecorationLine: 'underline' },
});
