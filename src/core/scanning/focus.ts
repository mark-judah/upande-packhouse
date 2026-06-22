import { InteractionManager } from 'react-native';
import type { RefObject } from 'react';
import type { ScanFieldHandle } from './ScanField';

/**
 * Focus a ScanField once the screen transition is complete.
 *
 * Calling `focus()` immediately after mount on Android often gets dropped
 * because the navigation animation hasn't settled and the TextInput's native
 * node hasn't attached yet. Waiting for the InteractionManager queue plus a
 * single animation frame resolves both timing issues without arbitrary sleeps.
 *
 * Use this in every Honeywell-driven screen so operators never have to tap.
 */
export function focusWhenReady(ref: RefObject<ScanFieldHandle | null>): void {
  InteractionManager.runAfterInteractions(() => {
    requestAnimationFrame(() => ref.current?.focus());
  });
}
