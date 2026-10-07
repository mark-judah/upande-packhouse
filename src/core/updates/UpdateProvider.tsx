import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as Updates from 'expo-updates';
import {
  autoCheckForApk,
  checkForApk,
  type ApkCheck,
  type UpdateErrorKind,
} from './releases';
import {
  canInstallInApp,
  downloadApk,
  findDownloadedApk,
  InstallError,
  launchInstaller,
  openInBrowser,
  type DownloadProgress,
  type InstallErrorKind,
} from './install-apk';

/**
 * App-wide state for the APK channel: is a newer native build on GitHub, and
 * the download/install of it.
 *
 * It also applies JS updates (OTA) when the app is opened: checked on launch
 * and, once downloaded, restarted into straight away -- in the first seconds
 * after opening, while nothing is in progress. A download that only finishes
 * after that is kept for the next opening rather than restarting the app
 * under someone mid-task. Without this, expo-updates' own ON_LOAD check
 * applied an update only on the NEXT cold start, so a fix took two openings
 * to reach a phone. The Settings "Check for updates" button still works too.
 *
 * The download is started by the user, never automatically: an APK is tens of
 * MB, and phones here are often on metered data. A finished download is kept
 * and the button becomes "Install"; the installer opens on that tap, and a
 * dismissed installer can be reopened without downloading again. The check itself runs silently
 * once a day so the Settings screen already knows the answer when opened.
 */

/** A bundle downloaded within this long of opening is applied by an immediate
 *  restart. Later than that the user is working, so it waits for the next
 *  opening instead -- the app never restarts under someone mid-task. */
const OTA_OPEN_WINDOW_MS = 20 * 1000;
const LAUNCHED_AT = Date.now();

/** Still in the first moments after opening, when a restart interrupts nothing. */
const justOpened = () => Date.now() - LAUNCHED_AT < OTA_OPEN_WINDOW_MS;

type UpdateState = {
  check: ApkCheck | null;
  checking: boolean;
  checkError: { kind: UpdateErrorKind; message: string } | null;
  downloading: boolean;
  progress: DownloadProgress | null;
  /** The version whose APK is fully downloaded and waiting to be installed. */
  downloaded: string | null;
  installError: { kind: InstallErrorKind | null; message: string } | null;
  /** Ask GitHub now, ignoring the daily throttle. */
  refresh: () => Promise<ApkCheck | null>;
  /** Download the newest APK, or — once it is downloaded — open the installer.
   *  Resolves true when that step succeeded (or the browser fallback was
   *  reached). Pass the result of a `refresh()` made in the same tick, before
   *  state has caught up. */
  install: (target?: ApkCheck | null) => Promise<boolean>;
};

const UpdateContext = createContext<UpdateState | null>(null);

/** What the person sees when an install fails: the app's own message, never a
 *  raw system error (that one is logged). */
function installErrorFor(err: unknown): { kind: InstallErrorKind | null; message: string } {
  if (err instanceof InstallError) return { kind: err.kind, message: err.message };
  if (__DEV__) console.warn('[update] install failed:', err);
  return { kind: null, message: "The update couldn't be installed. Try again." };
}

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [check, setCheck] = useState<ApkCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<UpdateState['checkError']>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [downloaded, setDownloaded] = useState<string | null>(null);
  const [installError, setInstallError] = useState<UpdateState['installError']>(null);

  const busy = useRef(false);
  /** The finished download, read synchronously by `install`. */
  const ready = useRef<{ version: string; uri: string } | null>(null);

  /* ── OTA: the JS bundle inside the same runtime, applied on opening ───── */

  const otaApplied = useRef(false);

  /** Restart into a downloaded bundle -- only right after opening. Once per
   *  process: the native ON_LOAD download and the check below can both
   *  report the same bundle. */
  const applyOtaOnOpen = useCallback(async () => {
    if (otaApplied.current || !justOpened()) return;
    otaApplied.current = true;
    try {
      await Updates.reloadAsync();
    } catch {
      // A failed reload leaves the bundle installed for the next opening.
      otaApplied.current = false;
    }
  }, []);

  // On opening: ask the update server for a newer bundle and apply it. Every
  // failure is swallowed -- this runs unattended, and the next opening simply
  // tries again.
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    (async () => {
      try {
        const found = await Updates.checkForUpdateAsync();
        if (!found.isAvailable) return;
        await Updates.fetchUpdateAsync();
        await applyOtaOnOpen();
      } catch {
        // Nothing to tell the user; the next opening retries.
      }
    })();
  }, [applyOtaOnOpen]);

  // expo-updates' own ON_LOAD download lands here; apply it now (if still
  // just opened) rather than on the next cold start.
  const { isUpdatePending } = Updates.useUpdates();
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled || !isUpdatePending) return;
    applyOtaOnOpen();
  }, [isUpdatePending, applyOtaOnOpen]);

  // An APK downloaded before (in this run or an earlier one) is offered for
  // install straight away instead of being fetched again.
  useEffect(() => {
    const apk = check?.available ? check.apk : null;
    if (!apk || ready.current?.version === apk.version) return;
    let cancelled = false;
    findDownloadedApk(apk.downloadUrl, { fileName: apk.assetName, expectedBytes: apk.sizeBytes }).then((uri) => {
      if (cancelled || !uri) return;
      ready.current = { version: apk.version, uri };
      setDownloaded(apk.version);
    });
    return () => {
      cancelled = true;
    };
  }, [check]);

  useEffect(() => {
    let cancelled = false;
    autoCheckForApk().then((result) => {
      if (!cancelled && result) setCheck((current) => current ?? result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    setChecking(true);
    setCheckError(null);
    try {
      const result = await checkForApk();
      setCheck(result);
      return result;
    } catch (err) {
      const e = err as { kind?: UpdateErrorKind; message?: string };
      setCheckError({ kind: e?.kind ?? 'failed', message: e?.message ?? 'The check could not be completed.' });
      return null;
    } finally {
      setChecking(false);
    }
  }, []);

  const install = useCallback(async (target?: ApkCheck | null) => {
    const apk = (target ?? check)?.apk;
    if (!apk || busy.current) return false;

    setInstallError(null);
    if (!canInstallInApp()) {
      // Older APK without the intent launcher: the browser does the download.
      try {
        await openInBrowser(apk.downloadUrl);
        return true;
      } catch {
        setInstallError({ kind: null, message: 'Could not open the download link.' });
        return false;
      }
    }

    busy.current = true;
    try {
      if (ready.current?.version === apk.version) {
        // Still complete on disk? Otherwise fall through and fetch the rest.
        const uri = apk.sizeBytes
          ? await findDownloadedApk(apk.downloadUrl, { fileName: apk.assetName, expectedBytes: apk.sizeBytes })
          : ready.current.uri;
        if (uri) {
          await launchInstaller(uri);
          return true;
        }
        ready.current = null;
        setDownloaded(null);
      }

      setDownloading(true);
      setProgress(null);
      try {
        const uri = await downloadApk(apk.downloadUrl, {
          fileName: apk.assetName,
          expectedBytes: apk.sizeBytes,
          onProgress: setProgress,
        });
        ready.current = { version: apk.version, uri };
        setDownloaded(apk.version);
        return true;
      } finally {
        setDownloading(false);
        setProgress(null);
      }
    } catch (err) {
      setInstallError(installErrorFor(err));
      return false;
    } finally {
      busy.current = false;
    }
  }, [check]);

  const value = useMemo(
    () => ({ check, checking, checkError, downloading, progress, downloaded, installError, refresh, install }),
    [check, checking, checkError, downloading, progress, downloaded, installError, refresh, install],
  );

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>;
}

/** Safe outside the provider: returns a quiet default. */
export function useApkUpdate(): UpdateState {
  return (
    useContext(UpdateContext) ?? {
      check: null,
      checking: false,
      checkError: null,
      downloading: false,
      progress: null,
      downloaded: null,
      installError: null,
      refresh: async () => null,
      install: async () => false,
    }
  );
}
