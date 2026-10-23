import { Dialog } from '@/src/core/ui/Dialog';
import { Button } from '@/src/core/ui/Button';
import { minimumLoadLine, type BelowMinimum } from '@/src/tenants/karen/state/karen-bucket-logistics-store';

export type MinimumLoadPrompt = { name: string; vehicle: string; info: BelowMinimum };

/** The truck is below its minimum load: inform the driver, no override. */
export function MinimumLoadDialog({
  prompt,
  onClose,
}: {
  prompt: MinimumLoadPrompt | null;
  onClose: () => void;
}) {
  if (!prompt) return null;
  return (
    <Dialog
      visible
      onClose={onClose}
      icon={{ name: 'car-outline', tone: 'warn' }}
      title={`${prompt.vehicle} is not ready`}
      subtitle={minimumLoadLine(prompt.info)}
      actions={<Button label="OK" onPress={onClose} />}
    />
  );
}
