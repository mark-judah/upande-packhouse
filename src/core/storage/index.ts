import AsyncStorage from '@react-native-async-storage/async-storage';

export const StorageKeys = {
  cookie: 'cookie',
  instanceUrl: 'instanceurl',
  instanceUrlBackup: 'instanceurl_backup',
  emailBackup: 'email_backup',
  fullName: 'fullname',
  userStation: 'userStation',
  versionLastReportedOn: 'versionLastReportedOn',
  userRoles: 'userRoles',
  biometricEnabled: 'biometric_enabled',
  // Password is saved on every successful password login so the biometric
  // flow can re-authenticate by feeding it back to the same login endpoint.
  // Stored in AsyncStorage (not encrypted); access is gated by the OS
  // biometric prompt. On a rooted device this is readable — accept that
  // trade-off or migrate to expo-secure-store with a native rebuild.
  passwordBackup: 'password_backup',
} as const;

export const storage = {
  get: (key: string): Promise<string | null> => AsyncStorage.getItem(key),
  set: (key: string, value: string): Promise<void> => AsyncStorage.setItem(key, value),
  remove: (key: string): Promise<void> => AsyncStorage.removeItem(key),
  async clearExcept(keep: string[]): Promise<void> {
    const allKeys = Object.values(StorageKeys);
    await Promise.all(
      allKeys
        .filter((k) => !keep.includes(k))
        .map((k) => AsyncStorage.removeItem(k)),
    );
  },
};
