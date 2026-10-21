import { StorageKeys } from '@/src/core/storage';
import { clearServerData, isOtherServer, setLoginServer } from '@/src/core/auth/server-change';

const mockStore = new Map<string, string>();

jest.mock('@/src/core/storage', () => {
  const actual = jest.requireActual('@/src/core/storage');
  return {
    StorageKeys: actual.StorageKeys,
    storage: {
      get: async (k: string) => mockStore.get(k) ?? null,
      set: async (k: string, v: string) => void mockStore.set(k, v),
      remove: async (k: string) => void mockStore.delete(k),
    },
  };
});

const A = 'https://a.upande.com';

function signedInToA() {
  mockStore.set(StorageKeys.cookie, 'sid=a');
  mockStore.set(StorageKeys.instanceUrl, A);
  mockStore.set(StorageKeys.instanceUrlBackup, A);
  mockStore.set(StorageKeys.emailBackup, 'a@x.com');
  mockStore.set(StorageKeys.passwordBackup, 'pw');
  mockStore.set(StorageKeys.userRoles, '["Packer"]');
  mockStore.set(StorageKeys.userStation, '{"userFarm":"Karen"}');
  mockStore.set(StorageKeys.knownInstances, '[]');
  mockStore.set(StorageKeys.biometricEnabled, '1');
}

beforeEach(() => mockStore.clear());

describe('server change', () => {
  it('tells another server from the current one, however the URL is written', async () => {
    signedInToA();
    expect(await isOtherServer('A.upande.com/')).toBe(false);
    expect(await isOtherServer('https://b.upande.com')).toBe(true);
  });

  it('is never "another server" on a device not signed in before', async () => {
    expect(await isOtherServer(A)).toBe(false);
  });

  it('setLoginServer signs out and points the login screen at the new server', async () => {
    signedInToA();
    await setLoginServer('https://b.upande.com', 'b@x.com');
    for (const k of [
      StorageKeys.cookie,
      StorageKeys.instanceUrl,
      StorageKeys.passwordBackup,
      StorageKeys.userRoles,
      StorageKeys.userStation,
    ]) {
      expect(mockStore.has(k)).toBe(false);
    }
    expect(mockStore.get(StorageKeys.instanceUrlBackup)).toBe('https://b.upande.com');
    expect(mockStore.get(StorageKeys.emailBackup)).toBe('b@x.com');
    // Device-wide settings stay.
    expect(mockStore.get(StorageKeys.knownInstances)).toBe('[]');
    expect(mockStore.get(StorageKeys.biometricEnabled)).toBe('1');
  });

  it('clearServerData keeps the login screen on the old server', async () => {
    signedInToA();
    await clearServerData();
    expect(mockStore.get(StorageKeys.instanceUrlBackup)).toBe(A);
    expect(mockStore.has(StorageKeys.cookie)).toBe(false);
  });
});
