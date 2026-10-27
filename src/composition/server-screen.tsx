import { useCallback, type ComponentType } from 'react';
import { useFocusEffect } from 'expo-router';
import { useServerFeatures } from '@/src/core/api/server-features';
import { PendingScreen } from '@/src/core/ui/PendingScreen';

/** A screen that shows Coming soon once the site turns out not to have a method it calls. */
export function serverScreen(feature: string, Screen: ComponentType) {
  function ServerScreen() {
    const missing = useServerFeatures((s) => !!s.missing[feature]);
    // Set while rendering, so the screen's first requests (its mount effects run first) are its own.
    useServerFeatures.getState().focus(feature);
    useFocusEffect(useCallback(() => useServerFeatures.getState().focus(feature), []));
    if (missing) return <PendingScreen feature={feature} />;
    return <Screen />;
  }
  ServerScreen.displayName = `ServerScreen(${feature})`;
  return ServerScreen;
}
