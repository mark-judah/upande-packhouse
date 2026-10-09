import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@/src/core/ui/Dialog';
import { Button } from '@/src/core/ui/Button';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';
import type { RawVehicle } from '@/src/tenants/karen/api/karen-bucket-logistics-api';
import type { Trip } from '@/src/tenants/karen/state/karen-bucket-logistics-store';

type Props = {
  trip: Trip | null;
  vehicles: RawVehicle[];
  busy: boolean;
  onClose: () => void;
  onSave: (trip: Trip, vehicle: string) => void;
};

/** Edit a planned trip: put it on another available truck. Its buckets stay as planned. */
export function TripEditSheet(props: Props) {
  if (!props.trip) return null;
  // A fresh editor per trip: it starts on that trip's truck.
  return <TripEditor key={props.trip.name} {...props} trip={props.trip} />;
}

function TripEditor({ trip, vehicles, busy, onClose, onSave }: Props & { trip: Trip }) {
  const [vehicle, setVehicle] = useState(trip.vehicle);
  // Free transfer trucks that hold the trip, plus the one it is on.
  const trucks = vehicles.filter(
    (v) =>
      v.name === trip.vehicle ||
      (v.capacity_buckets > 0 && !v.on_road && v.capacity_buckets >= trip.totalBuckets),
  );

  return (
    <BottomSheet
      visible
      onClose={onClose}
      title={`Change truck · ${trip.name}`}
      subtitle={`${trip.totalBuckets} buckets planned`}
      busy={busy}
    >
      <View style={s.list}>
        {trucks.map((v) => {
          const on = vehicle === v.name;
          return (
            <Pressable key={v.name} onPress={() => !busy && setVehicle(v.name)} style={[s.row, on ? s.rowOn : null]}>
              <Text style={[s.truck, on ? s.txtOn : null]}>{v.name}</Text>
              <Text style={[s.cap, on ? s.txtOn : null]}>
                {v.name === trip.vehicle ? 'current · ' : ''}
                {v.capacity_buckets} bkt
              </Text>
            </Pressable>
          );
        })}
        {trucks.length <= 1 ? <Text style={s.none}>No other truck is free and big enough.</Text> : null}
      </View>
      <Button
        label="Save"
        loading={busy}
        disabled={vehicle === trip.vehicle}
        onPress={() => onSave(trip, vehicle)}
        style={s.save}
      />
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  list: { gap: spacing.xs, marginTop: spacing.sm },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border, borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  rowOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  truck: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  cap: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textSecondary },
  txtOn: { color: COLORS.textOnPrimary },
  none: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, marginTop: spacing.xs },
  save: { marginTop: spacing.md },
});
