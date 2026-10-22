import { TurboModuleRegistry } from 'react-native';
import { androidId } from '@/src/core/version/device-key';

afterEach(() => jest.restoreAllMocks());

const withConstants = (mod: unknown) =>
  jest.spyOn(TurboModuleRegistry, 'get').mockImplementation((name: string) => (name === 'PlatformConstants' ? mod : null) as never);

describe('androidId', () => {
  it("reads Android's PlatformConstants.getAndroidID", () => {
    withConstants({ getAndroidID: () => 'a1b2c3d4e5f60718' });
    expect(androidId()).toBe('a1b2c3d4e5f60718');
  });

  it('is null where PlatformConstants has no getAndroidID, or it fails', () => {
    withConstants({ getConstants: () => ({}) });
    expect(androidId()).toBeNull();
    withConstants({
      getAndroidID: () => {
        throw new Error('no');
      },
    });
    expect(androidId()).toBeNull();
    withConstants({ getAndroidID: () => '' });
    expect(androidId()).toBeNull();
  });
});
