import { TurboModuleRegistry, type TurboModule } from 'react-native';

interface PlatformConstantsAndroid extends TurboModule {
  getAndroidID?: () => string;
}

/**
 * The Android ID, read from React Native's own PlatformConstants module (this
 * build has no expo-application, and adding it needs a new APK). The same for
 * every install of this app on one device; null off Android, where
 * PlatformConstants has no `getAndroidID`.
 */
export function androidId(): string | null {
  try {
    const id = TurboModuleRegistry.get<PlatformConstantsAndroid>('PlatformConstants')?.getAndroidID?.();
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}
