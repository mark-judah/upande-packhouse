import { useCallback, type ComponentType } from 'react';
import { useFocusEffect } from 'expo-router';
import { useServerFeatures } from '@/src/core/api/server-features';
import { PendingScreen } from '@/src/core/ui/PendingScreen';
import { useUserStation } from '@/src/core/tenant/user-station';

/** A screen that shows Coming soon once the site turns out not to have a method it calls. */
export function serverScreen(feature: string, Screen: ComponentType) {
  function ServerScreen() {
    const missing = useServerFeatures((s) => !!s.missing[feature]);
    // Set while rendering, so the screen's first requests (its mount effects run first) are its own.
    useServerFeatures.getState().focus(feature);
    useFocusEffect(useCallback(() => useServerFeatures.getState().focus(feature), []));
    // Another station: the screen starts again, so every list it shows is read afresh for that station.
    const { station, loaded } = useUserStation();
    if (missing) return <PendingScreen feature={feature} />;
    // Mounted once the station is read: its arrival is not a station change, so no second mount.
    if (!loaded) return null;
    return <Screen key={station?.userFarm ?? ''} />;
  }
  ServerScreen.displayName = `ServerScreen(${feature})`;
  return ServerScreen;
}
