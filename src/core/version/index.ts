import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api, mapAxiosError } from '@/src/core/api/client';
import { storage, StorageKeys } from '@/src/core/storage';

export const APP_VERSION: string = Constants.expoConfig?.version ?? '1.0.0';

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
