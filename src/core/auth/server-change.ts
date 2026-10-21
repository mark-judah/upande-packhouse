import { storage, StorageKeys } from '@/src/core/storage';
import { instanceKey } from './known-instances';

/**
 * One server at a time. Everything below belongs to the server it was written
 * on, so it goes when the server changes: a station, roles or saved labels of
 * one site mean nothing on another, and the password must never be replayed
 * (biometric sign-in) against a different server.
 */
export const SERVER_SCOPED_KEYS: readonly string[] = [
  StorageKeys.cookie,
  StorageKeys.instanceUrl,
  StorageKeys.fullName,
  StorageKeys.passwordBackup,
  StorageKeys.userRoles,
  StorageKeys.userStation,
  StorageKeys.versionLastReportedOn,
  StorageKeys.boxLabelsHistory,
  StorageKeys.dispatchLocation,
];

/** The server the app is on: signed in, or last signed in to. */
export async function currentServerUrl(): Promise<string | null> {
  const [url, backup] = await Promise.all([
    storage.get(StorageKeys.instanceUrl),
    storage.get(StorageKeys.instanceUrlBackup),
  ]);
  return url || backup || null;
}

/** True when `url` is another server than the one the app was on. */
export async function isOtherServer(url: string): Promise<boolean> {
  const current = instanceKey(await currentServerUrl());
  return !!current && current !== instanceKey(url);
}

export async function clearServerData(): Promise<void> {
  await Promise.all(SERVER_SCOPED_KEYS.map((k) => storage.remove(k)));
}

/** Sign out and make `url` the login screen's server, with `email` (the one
 *  last used there, if any) in its account field. */
export async function setLoginServer(url: string, email: string | null): Promise<void> {
  await clearServerData();
  await storage.set(StorageKeys.instanceUrlBackup, url);
  if (email) await storage.set(StorageKeys.emailBackup, email);
  else await storage.remove(StorageKeys.emailBackup);
}
