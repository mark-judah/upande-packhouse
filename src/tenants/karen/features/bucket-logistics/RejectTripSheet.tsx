import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomSheet } from '@/src/core/ui/Dialog';
import { Button } from '@/src/core/ui/Button';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';
import type { Trip } from '@/src/tenants/karen/state/karen-bucket-logistics-store';

const REASONS = ['Not enough buckets', 'Truck not available', 'Wrong farm', 'Buckets not ready'];

type Props = { trip: Trip | null; busy: boolean; onClose: () => void; onReject: (trip: Trip, reason: string) => void };

/** Why the truck request is turned down; the scheduler sees it on the trip. */
export function RejectTripSheet(props: Props) {
  if (!props.trip) return null;
  return <RejectForm key={props.trip.name} {...props} trip={props.trip} />;
}

function RejectForm({ trip, busy, onClose, onReject }: Props & { trip: Trip }) {
  const [reason, setReason] = useState('');
  return (
    <BottomSheet
      visible
      onClose={onClose}
      title={`Reject ${trip.vehicle}`}
      subtitle={`${trip.totalBuckets}${trip.capacityBuckets ? ` / ${trip.capacityBuckets}` : ''} buckets requested`}
      busy={busy}
    >
      <View style={s.chips}>
        {REASONS.map((r) => (
          <Pressable key={r} onPress={() => !busy && setReason(r)} style={[s.chip, reason === r ? s.chipOn : null]}>
            <Text style={[s.chipTxt, reason === r ? s.chipTxtOn : null]}>{r}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={s.input}
        multiline
        placeholder="Reason"
        placeholderTextColor={COLORS.textMuted}
        value={reason}
        onChangeText={setReason}
        editable={!busy}
      />
      <Button
        label="Reject request"
        color={COLORS.danger}
        loading={busy}
        disabled={!reason.trim()}
        onPress={() => onReject(trip, reason.trim())}
        style={s.btn}
      />
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  chip: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm, paddingVertical: 6,
  },
  chipOn: { backgroundColor: COLORS.danger, borderColor: COLORS.danger },
  chipTxt: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.text },
  chipTxtOn: { color: COLORS.textOnPrimary },
  input: {
    minHeight: 64, marginTop: spacing.md, borderWidth: 1, borderColor: COLORS.border, borderRadius: borderRadius.sm,
    padding: spacing.sm, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.text, textAlignVertical: 'top',
  },
  btn: { marginTop: spacing.md },
});
