import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Downloading a release APK and handing it to Android's package installer.
 *
 * Android will not install from a `file://` path (FileUriExposedException since
 * Nougat), so the download is exposed through Expo's FileProvider as a
 * `content://` URI with read access granted to the installer intent.
 *
 * The legacy expo-file-system entry point is deliberate: the new `File` API has
 * no download-with-progress and no content-URI helper.
 *
 * ── Older APKs ──────────────────────────────────────────────────────────────
 *
 * expo-intent-launcher is a native module, and an OTA update can deliver this
 * JS to an APK built before it was added. Importing it there would throw at
 * load time and take the whole app down, so it is only required once the
 * native side is known to exist. Without it the APK URL is opened in the
 * browser instead, which downloads it and offers to install — slower, but the
 * update still reaches the phone.
 */

type IntentLauncher = typeof import('expo-intent-launcher');

let launcher: IntentLauncher | null | undefined;
function intentLauncher(): IntentLauncher | null {
  if (launcher !== undefined) return launcher;
  try {
    launcher = requireOptionalNativeModule('ExpoIntentLauncher')
      ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- must not load without the native module
        (require('expo-intent-launcher') as IntentLauncher)
      : null;
  } catch {
    launcher = null;
  }
  return launcher;
}

/** True when this build can download and open the installer in-app. */
export function canInstallInApp(): boolean {
  return Platform.OS === 'android' && intentLauncher() !== null;
}

/** FLAG_GRANT_READ_URI_PERMISSION — without it the installer cannot read the file. */
const FLAG_GRANT_READ_URI_PERMISSION = 1;
const VIEW_ACTION = 'android.intent.action.VIEW';
const INSTALL_ACTION = 'android.intent.action.INSTALL_PACKAGE';
const UNKNOWN_SOURCES_SETTINGS = 'android.settings.MANAGE_UNKNOWN_APP_SOURCES';
const APK_MIME = 'application/vnd.android.package-archive';

/** A dropped connection is normal for a file this size; one failure is not final. */
const DOWNLOAD_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500;

export type InstallErrorKind = 'download' | 'blocked' | 'failed';

export class InstallError extends Error {
  kind: InstallErrorKind;
  constructor(message: string, kind: InstallErrorKind = 'failed', cause?: unknown) {
    super(message);
    this.name = 'InstallError';
    this.kind = kind;
    (this as { cause?: unknown }).cause = cause;
  }
}

export type DownloadProgress = { fraction: number | null; written: number; total: number | null };

/**
 * Open the per-app "Install unknown apps" screen. Android grants that per
 * installing-app and has no dialog for it, so landing them on the toggle is
 * the most that can be done.
 */
export async function openUnknownAppSourcesSettings(): Promise<void> {
  const il = intentLauncher();
  if (!il) {
    await Linking.openSettings();
    return;
  }
  const pkg = Constants.expoConfig?.android?.package;
  await il.startActivityAsync(UNKNOWN_SOURCES_SETTINGS, pkg ? { data: `package:${pkg}` } : {});
}

/** Hand the APK URL to the browser. The fallback for builds without the
 *  intent launcher, and for anyone who would rather download it there. */
export async function openInBrowser(url: string): Promise<void> {
  await Linking.openURL(url);
}

/**
 * Download `url` into the app's files directory and return the local URI.
 *
 * Kept separate from launching the installer because Android 10+ refuses to
 * start an activity from the background: a download that lands while the app
 * is not visible must be held and the installer opened on the next foreground.
 *
 * Files directory, not cache: Android evicts cache under storage pressure,
 * mid-write, which surfaces as a bare IOException.
 */
export async function downloadApk(
  url: string,
  opts: { fileName?: string; expectedBytes?: number | null; onProgress?: (p: DownloadProgress) => void } = {},
): Promise<string> {
  if (Platform.OS !== 'android') throw new InstallError('APK installation is only possible on Android.');
  if (!url) throw new InstallError('No download link for this release.');

  const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!dir) throw new InstallError('No storage is available for the download.');
  const target = `${dir}${opts.fileName || url.split('/').pop() || 'update.apk'}`;

  // Sweep every APK first: a partial file would be rejected as corrupt, and the
  // files directory is never reclaimed by Android. Deleting after launching is
  // unsafe because the installer reads the file asynchronously.
  try {
    for (const entry of await FileSystem.readDirectoryAsync(dir)) {
      if (entry.toLowerCase().endsWith('.apk')) {
        await FileSystem.deleteAsync(`${dir}${entry}`, { idempotent: true }).catch(() => {});
      }
    }
  } catch {
    // An unreadable directory is no reason to refuse the download.
  }

  // Say "not enough space" up front rather than a generic write error halfway.
  try {
    const free = await FileSystem.getFreeDiskStorageAsync();
    const needed = (opts.expectedBytes || 80 * 1024 * 1024) * 1.1;
    if (free != null && free < needed) {
      throw new InstallError(
        `Not enough free space for the update — about ${Math.ceil(needed / 1048576)} MB is ` +
          `needed and ${Math.floor(free / 1048576)} MB is free.`,
        'download',
      );
    }
  } catch (err) {
    if (err instanceof InstallError) throw err;
  }

  const report = (p: FileSystem.DownloadProgressData) => {
    if (!opts.onProgress) return;
    const written = p.totalBytesWritten;
    // Android reports -1 when there is no Content-Length.
    const total = p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : null;
    opts.onProgress({ fraction: total ? written / total : null, written, total });
  };

  // Each attempt starts clean; `resumeAsync` only resumes from `pauseAsync`
  // state, so after an error it would restart anyway — and risk appending.
  let result: FileSystem.FileSystemDownloadResult | undefined;
  let lastError: unknown;
  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      if (attempt > 1) {
        await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt - 1)));
      }
      result = await FileSystem.createDownloadResumable(url, target, {}, report).downloadAsync();
      if (result?.uri) break;
    } catch (err) {
      lastError = err;
      if (__DEV__) console.warn(`[update] download attempt ${attempt}/${DOWNLOAD_ATTEMPTS} failed:`, err);
    }
  }

  if (!result?.uri) {
    const reason = lastError instanceof Error && lastError.message ? ` (${lastError.message})` : '';
    throw new InstallError(
      `The download failed after ${DOWNLOAD_ATTEMPTS} attempts${reason}. Check your connection and try again.`,
      'download',
      lastError,
    );
  }
  if (result.status && (result.status < 200 || result.status >= 300)) {
    throw new InstallError(`The server returned ${result.status} for the update file.`, 'download');
  }

  // An HTML error page saved under a .apk name is still a "successful" download.
  const info = await FileSystem.getInfoAsync(result.uri);
  if (!info.exists || !info.size) throw new InstallError('The downloaded file is empty.', 'download');

  return result.uri;
}

/**
 * Open Android's installer for a downloaded APK. Must be called with the app
 * in the foreground. Android still shows its own "Update this app?" screen —
 * silent installs are reserved for privileged installers — and offers no
 * callback for whether the user accepted.
 */
export async function launchInstaller(fileUri: string): Promise<void> {
  const il = intentLauncher();
  if (!il) throw new InstallError('This build cannot open the installer. Download it in the browser instead.');

  let contentUri: string;
  try {
    contentUri = await FileSystem.getContentUriAsync(fileUri);
  } catch (err) {
    throw new InstallError('Could not prepare the update for installation.', 'failed', err);
  }

  // ACTION_VIEW first — what a file manager does when you tap an APK. The
  // deprecated INSTALL_PACKAGE is a fallback for launchers that don't resolve it.
  let lastError: unknown;
  for (const action of [VIEW_ACTION, INSTALL_ACTION]) {
    try {
      await il.startActivityAsync(action, {
        data: contentUri,
        type: APK_MIME,
        flags: FLAG_GRANT_READ_URI_PERMISSION,
      });
      return;
    } catch (err) {
      lastError = err;
    }
  }
  // Both failing points at "Install unknown apps" being off for this app.
  throw new InstallError(
    'Android would not open the installer. Allow this app to install unknown apps, then try again.',
    'blocked',
    lastError,
  );
}
