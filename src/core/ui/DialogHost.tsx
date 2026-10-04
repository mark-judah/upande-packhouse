import { useState } from 'react';
import { create } from 'zustand';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/src/core/theme';
import { Button } from './Button';
import { Dialog } from './Dialog';

/** One button, as for React Native's Alert.alert. */
export type DialogButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void | Promise<void>;
};

type Tone = 'danger' | 'success' | 'warn' | 'info';

type Pending = {
  title: string;
  message?: string;
  buttons: DialogButton[];
  icon?: { name: keyof typeof Ionicons.glyphMap; tone?: Tone };
};

const useDialogStore = create<{ current: Pending | null; set: (p: Pending | null) => void }>((set) => ({
  current: null,
  set: (current) => set({ current }),
}));

/** Drop-in for Alert.alert that shows the app's own Dialog, so every confirm and
 *  notice looks the same. Callable from anywhere (hooks, callbacks); needs
 *  <DialogHost /> mounted once at the root. With no buttons it shows a single OK.
 *  A destructive button gets a red danger icon unless `icon` says otherwise. */
export function showDialog(
  title: string,
  message?: string,
  buttons?: DialogButton[],
  icon?: Pending['icon'],
): void {
  const list = buttons?.length ? buttons : [{ text: 'OK' }];
  const destructive = list.some((b) => b.style === 'destructive');
  useDialogStore.getState().set({
    title,
    message,
    buttons: list,
    icon: icon ?? (destructive ? { name: 'alert-circle-outline', tone: 'danger' } : undefined),
  });
}

/** Renders whatever showDialog asked for. Mount once, inside the providers. */
export function DialogHost() {
  const current = useDialogStore((s) => s.current);
  const close = useDialogStore((s) => s.set);
  const [busy, setBusy] = useState<number | null>(null);
  if (!current) return null;

  const cancel = current.buttons.find((b) => b.style === 'cancel');
  const press = async (b: DialogButton, i: number) => {
    if (busy != null) return;
    if (!b.onPress) return close(null);
    setBusy(i);
    try {
      await b.onPress();
    } finally {
      setBusy(null);
      // The handler may have opened the next dialog; only close this one.
      if (useDialogStore.getState().current === current) close(null);
    }
  };

  return (
    <Dialog
      visible
      onClose={() => (cancel ? press(cancel, current.buttons.indexOf(cancel)) : close(null))}
      busy={busy != null}
      icon={current.icon}
      title={current.title}
      subtitle={current.message}
      actions={
        <>
          {current.buttons.map((b, i) => (
            <Button
              key={`${b.text}-${i}`}
              label={b.text}
              // Slim, single-line, all the same height in every pop-up.
              size="sm"
              singleLine
              variant={b.style === 'cancel' ? 'outline' : 'primary'}
              color={b.style === 'destructive' ? COLORS.danger : undefined}
              loading={busy === i}
              disabled={busy != null && busy !== i}
              onPress={() => press(b, i)}
              style={{ flexGrow: 1, flexBasis: 0, minWidth: 110 }}
            />
          ))}
        </>
      }
    />
  );
}
