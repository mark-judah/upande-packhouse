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

/** A dropped connection is normal for a file this size: it is resumed, and only
 *  this many failures in a row without progress are final. */
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

/** Where a release's APK lands: the files directory, not the cache — Android
 *  evicts cache under storage pressure, mid-write, which surfaces as a bare
 *  IOException. */
function apkPath(url: string, fileName?: string | null): string | null {
  const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
  if (!dir) return null;
  return `${dir}${fileName || url.split('/').pop() || 'update.apk'}`;
}

async function sizeOf(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && !info.isDirectory ? info.size ?? 0 : 0;
  } catch {
    return 0;
  }
}

/**
 * The local URI of a release that is already fully downloaded, or null. Only
 * trusted when the release's exact size is known — a partial file looks like
 * a whole one otherwise.
 */
export async function findDownloadedApk(
  url: string,
  opts: { fileName?: string | null; expectedBytes?: number | null } = {},
): Promise<string | null> {
  if (Platform.OS !== 'android' || !url || !opts.expectedBytes) return null;
  const target = apkPath(url, opts.fileName);
  if (!target) return null;
  return (await sizeOf(target)) === opts.expectedBytes ? target : null;
}

/**
 * Download `url` into the app's files directory and return the local URI.
 *
 * Kept separate from launching the installer: the APK is kept once complete,
 * so the installer can be opened (and reopened, after a dismissed installer)
 * without fetching it again.
 *
 * A dropped connection resumes from the bytes already on disk (an HTTP Range
 * request) instead of starting over, and so does a download cut off by the
 * app being closed. Resuming needs the release's exact size, which is also
 * what proves the result complete.
 */
export async function downloadApk(
  url: string,
  opts: { fileName?: string; expectedBytes?: number | null; onProgress?: (p: DownloadProgress) => void } = {},
): Promise<string> {
  if (Platform.OS !== 'android') throw new InstallError('APK installation is only possible on Android.');
  if (!url) throw new InstallError('No download link for this release.');

  const target = apkPath(url, opts.fileName);
  if (!target) throw new InstallError('No storage is available for the download.');
  const dir = target.slice(0, target.lastIndexOf('/') + 1);
  const expected = opts.expectedBytes || null;

  const done = await findDownloadedApk(url, opts);
  if (done) {
    opts.onProgress?.({ fraction: 1, written: expected ?? 0, total: expected });
    return done;
  }

  // Sweep every other APK: the files directory is never reclaimed by Android.
  // This release's partial file stays, to be resumed. Deleting after launching
  // is unsafe because the installer reads the file asynchronously.
  try {
    for (const entry of await FileSystem.readDirectoryAsync(dir)) {
      if (entry.toLowerCase().endsWith('.apk') && `${dir}${entry}` !== target) {
        await FileSystem.deleteAsync(`${dir}${entry}`, { idempotent: true }).catch(() => {});
      }
    }
  } catch {
    // An unreadable directory is no reason to refuse the download.
  }
  if (!expected) await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});

  // Say "not enough space" up front rather than a generic write error halfway.
  try {
    const free = await FileSystem.getFreeDiskStorageAsync();
    const needed = ((expected ?? 80 * 1024 * 1024) - (await sizeOf(target))) * 1.1;
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
    const total = expected ?? (p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : null);
    opts.onProgress({ fraction: total ? Math.min(written / total, 1) : null, written, total });
  };

  // Attempts that moved the download forward don't count against the limit:
  // only DOWNLOAD_ATTEMPTS failures in a row without a new byte give up.
  let lastError: unknown;
  let stalled = 0;
  while (stalled < DOWNLOAD_ATTEMPTS) {
    let have = expected ? await sizeOf(target) : 0;
    if (expected && have > expected) {
      // The server ignored the Range and appended a whole copy: start clean.
      await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
      have = 0;
    }
    if (expected && have === expected) return target;
    if (stalled > 0) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * stalled));

    try {
      const result = await FileSystem.createDownloadResumable(
        url,
        target,
        {},
        report,
        have > 0 ? String(have) : undefined,
      ).downloadAsync();
      if (result?.status && (result.status < 200 || result.status >= 300)) {
        // An error page may have been appended to the partial file.
        await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
        if (__DEV__) console.warn(`[update] update file answered ${result.status}`);
        throw new InstallError("The update file isn't available right now. Try again later.", 'download');
      }
      if (result?.uri && !expected) {
        // An HTML error page saved under a .apk name is still a "successful" download.
        if (!(await sizeOf(result.uri))) {
          throw new InstallError("The update didn't download properly. Try again.", 'download');
        }
        return result.uri;
      }
    } catch (err) {
      if (err instanceof InstallError) throw err;
      lastError = err;
      if (__DEV__) console.warn('[update] download interrupted:', err);
    }
    if (!expected || (await sizeOf(target)) <= have) stalled += 1;
    else stalled = 0;
  }

  // The system's own error text is for the logs, not the person updating.
  if (__DEV__) console.warn('[update] download failed:', lastError);
  throw new InstallError(
    "The update couldn't be downloaded. Check your connection and try again.",
    'download',
    lastError,
  );
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
