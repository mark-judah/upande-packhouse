import { DevSettings } from 'react-native';
import { StorageKeys } from '@/src/core/storage';
import { consumeInstanceSwitched, restartForInstance } from '@/src/core/auth/restart';

const mockStore = new Map<string, string>();
const mockReload = jest.fn();

jest.mock('@/src/core/storage', () => ({
  StorageKeys: jest.requireActual('@/src/core/storage').StorageKeys,
  storage: {
    get: async (k: string) => mockStore.get(k) ?? null,
    set: async (k: string, v: string) => void mockStore.set(k, v),
    remove: async (k: string) => void mockStore.delete(k),
  },
}));
jest.mock('expo-updates', () => ({ reloadAsync: () => mockReload() }));

beforeEach(() => {
  mockStore.clear();
  mockReload.mockReset().mockResolvedValue(undefined);
  jest.spyOn(DevSettings, 'reload').mockImplementation(() => {
    throw new Error('no dev menu');
  });
});

describe('instance switch flag', () => {
  it('a switched sign-in skips the lock once, on that server only', async () => {
    expect(await restartForInstance('https://B.upande.com/')).toBe(true);
    expect(mockStore.get(StorageKeys.instanceSwitched)).toBe('b.upande.com');
    expect(await consumeInstanceSwitched('https://b.upande.com')).toBe(true);
    expect(await consumeInstanceSwitched('https://b.upande.com')).toBe(false);
  });

  it('never skips the lock on another server', async () => {
    await restartForInstance('https://b.upande.com');
    expect(await consumeInstanceSwitched('https://a.upande.com')).toBe(false);
    expect(mockStore.has(StorageKeys.instanceSwitched)).toBe(false);
  });

  it('a server change that signs out sets no flag', async () => {
    await restartForInstance();
    expect(mockStore.has(StorageKeys.instanceSwitched)).toBe(false);
  });

  it('drops the flag when the restart fails', async () => {
    mockReload.mockRejectedValue(new Error('not supported'));
    expect(await restartForInstance('https://b.upande.com')).toBe(false);
    expect(mockStore.has(StorageKeys.instanceSwitched)).toBe(false);
  });
});
