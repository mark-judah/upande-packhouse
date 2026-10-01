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
import { AppState } from 'react-native';
import {
  autoCheckForApk,
  checkForApk,
  type ApkCheck,
  type UpdateErrorKind,
} from './releases';
import {
  canInstallInApp,
  downloadApk,
  launchInstaller,
  openInBrowser,
  type DownloadProgress,
  type InstallErrorKind,
} from './install-apk';

/**
 * App-wide state for the APK channel: is a newer native build on GitHub, and
 * the download/install of it.
 *
 * OTA (EAS Update) is deliberately not handled here — it keeps working exactly
 * as before through expo-updates and the Settings "Check for updates" button.
 *
 * The download is started by the user, never automatically: an APK is tens of
 * MB, and phones here are often on metered data. The check itself runs silently
 * once a day so the Settings screen already knows the answer when opened.
 */

type UpdateState = {
  check: ApkCheck | null;
  checking: boolean;
  checkError: { kind: UpdateErrorKind; message: string } | null;
  downloading: boolean;
  progress: DownloadProgress | null;
  installError: { kind: InstallErrorKind | null; message: string } | null;
  /** Ask GitHub now, ignoring the daily throttle. */
  refresh: () => Promise<ApkCheck | null>;
  /** Download the newest APK and open the installer. Resolves true once the
   *  installer (or the browser fallback) was reached. Pass the result of a
   *  `refresh()` made in the same tick, before state has caught up. */
  install: (target?: ApkCheck | null) => Promise<boolean>;
};

const UpdateContext = createContext<UpdateState | null>(null);

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [check, setCheck] = useState<ApkCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<UpdateState['checkError']>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [installError, setInstallError] = useState<UpdateState['installError']>(null);

  const busy = useRef(false);
  /** A finished download waiting for the app to return to the foreground —
   *  Android 10+ will not open the installer from the background. */
  const pending = useRef<string | null>(null);

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
    setDownloading(true);
    setProgress(null);
    try {
      const uri = await downloadApk(apk.downloadUrl, {
        fileName: apk.assetName,
        expectedBytes: apk.sizeBytes,
        onProgress: setProgress,
      });
      if (AppState.currentState !== 'active') {
        pending.current = uri;
        return false;
      }
      await launchInstaller(uri);
      return true;
    } catch (err) {
      const e = err as { kind?: InstallErrorKind; message?: string };
      setInstallError({ kind: e?.kind ?? null, message: e?.message ?? 'The update could not be installed.' });
      return false;
    } finally {
      busy.current = false;
      setDownloading(false);
      setProgress(null);
    }
  }, [check]);

  // Launch a held installer once the app is visible again. Cleared before
  // launching so a failure is not retried on every foreground event.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || !pending.current) return;
      const uri = pending.current;
      pending.current = null;
      launchInstaller(uri).catch((err) => {
        const e = err as { kind?: InstallErrorKind; message?: string };
        setInstallError({ kind: e?.kind ?? null, message: e?.message ?? 'The update could not be installed.' });
      });
    });
    return () => sub.remove();
  }, []);

  const value = useMemo(
    () => ({ check, checking, checkError, downloading, progress, installError, refresh, install }),
    [check, checking, checkError, downloading, progress, installError, refresh, install],
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
      installError: null,
      refresh: async () => null,
      install: async () => false,
    }
  );
}
