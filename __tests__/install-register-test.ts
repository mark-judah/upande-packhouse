import { StorageKeys } from '@/src/core/storage';
const mockApi = jest.fn();
const mockStore = new Map<string, string>();
let mockVersion = '1.1.15';

jest.mock('@/src/core/api/client', () => ({ api: (...args: unknown[]) => mockApi(...args) }));
jest.mock('@/src/core/storage', () => ({
  StorageKeys: jest.requireActual('@/src/core/storage').StorageKeys,
  storage: {
    get: async (k: string) => mockStore.get(k) ?? null,
    set: async (k: string, v: string) => void mockStore.set(k, v),
    remove: async (k: string) => void mockStore.delete(k),
  },
}));
jest.mock('@/src/core/version', () => ({
  get APP_VERSION() {
    return mockVersion;
  },
}));
jest.mock('expo-updates', () => ({ runtimeVersion: '101.1' }));
let mockAndroidId: string | null = null;
jest.mock('@/src/core/version/device-key', () => ({ androidId: () => mockAndroidId }));

type Register = typeof import('@/src/core/version/install-register');

function load(): Register {
  let mod: Register | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('@/src/core/version/install-register');
  });
  return mod as Register;
}

beforeEach(() => {
  mockApi.mockReset().mockResolvedValue({ message: { tracked: true } });
  mockStore.clear();
  mockVersion = '1.1.15';
  mockAndroidId = null;
});

describe('reportInstall', () => {
  it('sends the app, reason and facts, and keeps one install id', async () => {
    const reg = load();
    await reg.reportInstall({ reason: 'login', user: 'a@x.com' });
    await reg.reportInstall({ reason: 'login', user: 'a@x.com' });
    expect(mockApi).toHaveBeenCalledTimes(2);
    const body = mockApi.mock.calls[0][0].data;
    expect(body).toMatchObject({ app: 'Upande Packhouse', reason: 'login', app_version: '1.1.15', runtime_version: '101.1' });
    expect(mockApi.mock.calls[1][0].data.install_id).toBe(body.install_id);
  });

  it('throttles a relaunch inside the hour for the same version', async () => {
    await load().reportInstall({ reason: 'launch', user: 'a@x.com' });
    await load().reportInstall({ reason: 'launch', user: 'a@x.com' });
    expect(mockApi).toHaveBeenCalledTimes(1);
  });

  it('reports a relaunch at once when the version changed (OTA applied)', async () => {
    await load().reportInstall({ reason: 'launch', user: 'a@x.com' });
    mockVersion = '1.1.16';
    await load().reportInstall({ reason: 'launch', user: 'a@x.com' });
    expect(mockApi).toHaveBeenCalledTimes(2);
    expect(mockApi.mock.calls[1][0].data.app_version).toBe('1.1.16');
  });

  it('throttles per server: a relaunch on another server reports at once', async () => {
    mockStore.set(StorageKeys.instanceUrl, 'https://a.upande.com');
    await load().reportInstall({ reason: 'launch', user: 'a@x.com' });
    mockStore.set(StorageKeys.instanceUrl, 'https://B.upande.com/');
    await load().reportInstall({ reason: 'launch', user: 'a@x.com' });
    mockStore.set(StorageKeys.instanceUrl, 'https://b.upande.com');
    await load().reportInstall({ reason: 'launch', user: 'a@x.com' });
    expect(mockApi).toHaveBeenCalledTimes(2);
  });

  it('throttles foreground reports', async () => {
    const reg = load();
    await reg.reportInstall({ reason: 'foreground', user: 'a@x.com' });
    await reg.reportInstall({ reason: 'foreground', user: 'a@x.com' });
    expect(mockApi).toHaveBeenCalledTimes(1);
    expect(mockApi.mock.calls[0][0].data.reason).toBe('foreground');
  });

  it('sends the Android ID as the device key', async () => {
    mockAndroidId = 'a1b2c3d4e5f60718';
    await load().reportInstall({ reason: 'login', user: 'a@x.com' });
    expect(mockApi.mock.calls[0][0].data).toHaveProperty('device_key', 'a1b2c3d4e5f60718');
  });

  it('sends a null device key when there is no Android ID', async () => {
    await load().reportInstall({ reason: 'login' });
    expect(mockApi.mock.calls[0][0].data).toHaveProperty('device_key', null);
  });

  it('remembers the row the server filed the device under', async () => {
    mockApi.mockResolvedValue({ message: { tracked: true, install_id: 'older-row-id' } });
    const reg = load();
    expect(await reg.getRegisteredRowId()).toBeNull();
    await reg.reportInstall({ reason: 'login', user: 'a@x.com' });
    expect(await reg.getRegisteredRowId()).toBe('older-row-id');
  });

  it('never rejects when the server fails', async () => {
    mockApi.mockRejectedValue(new Error('offline'));
    await expect(load().reportInstall({ reason: 'login' })).resolves.toBeNull();
  });
});
