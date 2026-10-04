import type { RefObject } from 'react';
import type { ScanFieldHandle } from './ScanField';

/**
 * Focus a ScanField once the screen transition is complete.
 *
 * Calling `focus()` immediately after mount on Android often gets dropped
 * because the navigation animation hasn't settled and the TextInput's native
 * node hasn't attached yet. Waiting until the JS thread is idle (the
 * transition's work is done) plus a single animation frame resolves both
 * timing issues without arbitrary sleeps. `requestIdleCallback` replaces
 * InteractionManager.runAfterInteractions, deprecated in React Native 0.80+.
 *
 * Use this in every Honeywell-driven screen so operators never have to tap.
 */
export function focusWhenReady(ref: RefObject<ScanFieldHandle | null>): void {
  const focus = () => requestAnimationFrame(() => ref.current?.focus());
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
    .requestIdleCallback;
  // The timeout keeps a busy JS thread from holding the focus back for long.
  if (idle) idle(focus, { timeout: 500 });
  else setTimeout(focus, 0);
}
