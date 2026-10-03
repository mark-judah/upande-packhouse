import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';
import { api, mapAxiosError } from '@/src/core/api/client';
import { storage, StorageKeys } from '@/src/core/storage';

type OtaExtra = { expoClient?: { version?: string }; appVersion?: string };
const otaExtra = (Updates.manifest as { extra?: OtaExtra } | null)?.extra;

/**
 * The running version. Under an OTA bundle that is the bundle's own, read from
 * its manifest: bundles published before `extra.expoClient` was added leave
 * `Constants.expoConfig` reporting the APK's version.
 */
export const APP_VERSION: string =
  otaExtra?.expoClient?.version ?? otaExtra?.appVersion ?? Constants.expoConfig?.version ?? '1.0.0';

/** Version of the installed APK (the native build), which OTA updates never change. */
export const INSTALLED_APK_VERSION: string = Constants.nativeAppVersion ?? APP_VERSION;
/** Android versionCode of the installed APK. */
export const INSTALLED_APK_BUILD: string | null = Constants.nativeBuildVersion ?? null;

const ENDPOINT = '/api/method/upande_packhouse.mobile.api.reportAppVersion';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function reportVersionIfDue(): Promise<void> {
  try {
    const today = todayISO();
    const last = await storage.get(StorageKeys.versionLastReportedOn);
    if (last === today) return;

    await api({
      method: 'POST',
      url: ENDPOINT,
      data: {
        app_version: APP_VERSION,
        platform: Platform.OS,
        device_model: Platform.OS === 'ios' ? 'iOS device' : 'Android device',
      },
    });

    await storage.set(StorageKeys.versionLastReportedOn, today);
  } catch (err) {
    // version reporting must never block the app; swallow but keep the error visible in logs
    console.warn('[version-report] failed', mapAxiosError(err).message);
  }
}
