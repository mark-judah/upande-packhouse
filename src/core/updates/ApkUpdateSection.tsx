import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { Button } from '@/src/core/ui/Button';
import { COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';
import { formatBytes, RELEASES_PAGE_URL } from './releases';
import { openInBrowser, openUnknownAppSourcesSettings } from './install-apk';
import { useApkUpdate } from './UpdateProvider';
import { APP_VERSION, INSTALLED_APK_BUILD, INSTALLED_APK_VERSION } from '@/src/core/version';
import { fetchServerVersions, type ServerVersions } from '@/src/core/version/server';

/** The JS bundle running now: the one built into the APK, or an OTA update's short id and date. */
function bundleLabel(): string {
  if (Updates.isEmbeddedLaunch || !Updates.updateId) return 'built in';
  const when = Updates.createdAt ? Updates.createdAt.toISOString().slice(0, 16).replace('T', ' ') : '';
  return `OTA ${Updates.updateId.slice(0, 8)}${when ? ` · ${when}` : ''}`;
}

/**
 * The "Download latest APK" part of Settings → App. One button, three jobs in
 * the order they happen: check, then download, then report progress.
 *
 * Sits under the OTA "Check for updates" button, which is unchanged: OTA
 * covers JS patches, this covers a new native build.
 */
export function ApkUpdateSection() {
  const { check, checking, checkError, downloading, progress, installError, refresh, install } =
    useApkUpdate();
  const apk = check?.apk ?? null;
  const available = !!check?.available;
  const [server, setServer] = useState<ServerVersions | null>(null);
  const [serverFailed, setServerFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetchServerVersions()
      .then((v) => live && setServer(v))
      .catch(() => live && setServerFailed(true));
    return () => {
      live = false;
    };
  }, []);

  const serverValue = (v: string | null | undefined) =>
    serverFailed ? 'unavailable' : server ? (v ? `v${v}` : 'not installed') : '…';

  const label = useMemo(() => {
    if (downloading) {
      const written = formatBytes(progress?.written) ?? '0.0 MB';
      if (progress?.fraction == null) return `Downloading… ${written}`;
      return `Downloading ${Math.round(progress.fraction * 100)}% · ${written} of ${formatBytes(progress.total)}`;
    }
    if (checking) return 'Checking GitHub…';
    if (available && apk) {
      const size = formatBytes(apk.sizeBytes);
      return `Download v${apk.version}${size ? ` (${size})` : ''}`;
    }
    return 'Check for new APK';
  }, [downloading, progress, checking, available, apk]);

  const onPress = useCallback(async () => {
    if (downloading) return;
    if (!available) {
      await refresh();
      return;
    }
    // Failures surface through `installError` below.
    await install();
  }, [downloading, available, refresh, install]);

  const onInstallErrorHelp = useCallback(() => {
    if (!installError) return;
    const blocked = installError.kind === 'blocked';
    Alert.alert('Update failed', installError.message, [
      { text: 'Close', style: 'cancel' },
      blocked
        ? { text: 'Allow installs', onPress: () => openUnknownAppSourcesSettings().catch(() => {}) }
        : {
            text: 'Open in browser',
            onPress: () => openInBrowser(apk?.downloadUrl ?? RELEASES_PAGE_URL).catch(() => {}),
          },
    ]);
  }, [installError, apk]);

  let status: string | null = null;
  if (check) {
    if (available && apk) status = `v${apk.version} is available as a new APK.`;
    else if (apk) status = `Latest APK is v${apk.version}. This APK is up to date.`;
    else status = 'No APK has been published yet.';
  }

  return (
    <View>
      <View style={s.versions}>
        <VersionRow label="Installed APK" value={`v${INSTALLED_APK_VERSION}${INSTALLED_APK_BUILD ? ` (build ${INSTALLED_APK_BUILD})` : ''}`} />
        <VersionRow label="App" value={`v${APP_VERSION} · ${bundleLabel()}`} />
        <VersionRow label="ERPNext" value={serverValue(server?.erpnext)} />
        <VersionRow label="Frappe" value={serverValue(server?.frappe)} />
      </View>
      {status ? <Text style={[s.hint, available && s.accent]}>{status}</Text> : null}
      {checkError ? (
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
        loading={checking}
        disabled={downloading}
        iconLeft="download-outline"
      />
    </View>
  );
}

function VersionRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.vRow}>
      <Text style={s.vLabel}>{label}</Text>
      <Text style={s.vValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  versions: { marginTop: spacing.md, gap: 4 },
  vRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  vLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  vValue: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: COLORS.text, flexShrink: 1, textAlign: 'right' },
  hint: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, marginTop: spacing.sm },
  accent: { fontFamily: fontFamily.semiBold, color: COLORS.primary },
  error: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.danger, marginTop: spacing.sm },
  link: { fontFamily: fontFamily.semiBold, color: COLORS.primary, textDecorationLine: 'underline' },
});
