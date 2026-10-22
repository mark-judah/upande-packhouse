import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { Dialog } from '@/src/core/ui/Dialog';
import { Button } from '@/src/core/ui/Button';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';
import { minimumLoadLine, type BelowMinimum } from '@/src/tenants/karen/state/karen-bucket-logistics-store';

export type MinimumLoadPrompt = { name: string; vehicle: string; info: BelowMinimum; reason: string };

/** The truck is below its minimum load: send anyway with a reason, or keep it here. */
export function MinimumLoadDialog({
  prompt,
  sending,
  onClose,
  onSend,
}: {
  prompt: MinimumLoadPrompt | null;
  sending: boolean;
  onClose: () => void;
  onSend: (reason: string) => void;
}) {
  const [reason, setReason] = useState(prompt?.reason ?? '');
  if (!prompt) return null;
  const ready = !!reason.trim();
  return (
    <Dialog
      visible
      onClose={onClose}
      busy={sending}
      icon={{ name: 'car-outline', tone: 'warn' }}
      title={`Send ${prompt.vehicle} anyway?`}
      subtitle={minimumLoadLine(prompt.info)}
      actions={
        <>
          <Button label="Cancel" variant="outline" onPress={onClose} disabled={sending} style={s.btn} />
          <Button
            label="Send anyway"
            iconLeft="car-outline"
            loading={sending}
            disabled={!ready}
            onPress={() => onSend(reason.trim())}
            style={s.btn}
          />
        </>
      }
    >
      <TextInput
        value={reason}
        onChangeText={setReason}
        placeholder="Reason (required)"
        placeholderTextColor={COLORS.textMuted}
        editable={!sending}
        multiline
        maxLength={300}
        style={s.input}
      />
    </Dialog>
  );
}

const s = StyleSheet.create({
  btn: { flex: 1 },
  input: {
    minHeight: 64, marginTop: spacing.sm, borderWidth: 1, borderColor: COLORS.border, borderRadius: borderRadius.sm,
    padding: spacing.sm, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.text, textAlignVertical: 'top',
  },
});
