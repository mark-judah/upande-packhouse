import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { Screen } from '@/src/core/ui/Screen';
import { Card, Alert } from '@/src/core/ui/Card';
import { Button } from '@/src/core/ui/Button';
import { Dropdown } from '@/src/core/ui/Dropdown';
import { DateSelector } from '@/src/core/ui/DateSelector';
import { ScanField, type ScanFieldHandle } from '@/src/core/scanning/ScanField';
import { focusWhenReady } from '@/src/core/scanning/focus';
import { useToast } from '@/src/core/ui/Toast';
import { showDialog } from '@/src/core/ui/DialogHost';
import { Dialog } from '@/src/core/ui/Dialog';
import { COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';
import {
  useKarenBoxTransferStore,
  type TransferBox,
  type TransferTrip,
} from '@/src/tenants/karen/state/karen-box-transfer-store';

function BoxRow({ b, right }: { b: TransferBox; right?: React.ReactNode }) {
  return (
    <View style={s.row}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.box} numberOfLines={1}>
          {b.boxLabel} · Box {b.boxNumber}
        </Text>
        <Text style={s.meta} numberOfLines={1}>
          {[b.customer, b.orderName, [b.variety, b.length].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
        </Text>
        {b.loadedAt || b.receivedAt ? (
          <Text style={s.meta} numberOfLines={1}>
            {[b.loadedAt ? `Loaded ${when(b.loadedAt)}` : '', b.receivedAt ? `Arrived ${when(b.receivedAt)}` : '']
              .filter(Boolean)
              .join(' · ')}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

const STATUS_COLOR: Record<string, string> = {
  Loading: '#7c3aed',
  'On the way': '#2563eb',
  'In Transit': '#2563eb',
  'Partly received': '#d97706',
  Received: '#16a34a',
  Loaded: '#7c3aed',
  'To stage': '#d97706',
};

/** A box's place on its trip: on the way, received (and staged again at the main sales farm or not). */
function boxStatus(b: TransferBox): string {
  if (b.status === 'In Transit') return 'On the way';
  if (b.status === 'Received' && !b.staged) return 'To stage';
  return b.status;
}

function Pill({ label }: { label: string }) {
  const color = STATUS_COLOR[label] ?? COLORS.textMuted;
  return (
    <View style={[s.pill, { borderColor: color }]}>
      <Text style={[s.pillText, { color }]}>{label}</Text>
    </View>
  );
}

/** "2026-11-13 01:38:51.8" -> "13 Nov 01:38" */
function when(v: string): string {
  if (!v) return '';
  const d = new Date(v.replace(' ', 'T').slice(0, 19));
  if (Number.isNaN(d.getTime())) return v.slice(0, 16);
  return `${d.getDate()} ${d.toLocaleString('en', { month: 'short' })} ${v.slice(11, 16)}`;
}

/** One truck run: tap to see every box on it and where it stands. */
function TripCard({ trip, onReceive }: { trip: TransferTrip; onReceive?: (trip: TransferTrip) => void }) {
  const [open, setOpen] = useState(trip.status === 'Loading');
  const waiting = trip.total - trip.received;
  return (
    <Card>
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <View style={s.tripHead}>
          <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={18} color={COLORS.text} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.tripTitle} numberOfLines={1}>
              {trip.vehicle} · {trip.from} → {trip.to}
            </Text>
            <Text style={s.meta} numberOfLines={1}>
              {[
                trip.sentAt ? `Left ${when(trip.sentAt)}` : 'Loading',
                trip.receivedAt ? `Received ${when(trip.receivedAt)}` : '',
                `${trip.received}/${trip.total} received`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <Pill label={trip.status} />
        </View>
      </Pressable>
      {onReceive && trip.sentAt && waiting > 0 ? (
        <View style={{ marginTop: spacing.sm }}>
          <Button label="Receive Internal Transfer Boxes" iconLeft="download-outline" onPress={() => onReceive(trip)} />
        </View>
      ) : null}
      {open ? trip.boxes.map((b) => <BoxRow key={b.boxLabel} b={b} right={<Pill label={boxStatus(b)} />} />) : null}
    </Card>
  );
}

/** A sales farm's packed boxes going to the main sales farm for dispatch: loaded on an internal transfer
 *  truck and sent at the farm, scanned in on arrival at the main sales farm. */
export function KarenBoxTransferScreen() {
  const scanRef = useRef<ScanFieldHandle>(null);
  const { showSuccess, showError, showInfo } = useToast();
  const st = useKarenBoxTransferStore();
  const { load, reset, role, main, trucks, vehicle, setVehicle, date, setDate, submitting } = st;

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => () => reset(), [reset]);

  const toast = (o: { kind: string; message: string }) =>
    o.kind === 'success' ? showSuccess(o.message) : o.kind === 'warning' ? showInfo(o.message) : showError(o.message);

  const onScan = async (raw: string) => {
    toast(await st.scan(raw));
    scanRef.current?.clear();
    focusWhenReady(scanRef);
  };

  const onSend = () => {
    const n = st.loaded.filter((b) => b.vehicle === vehicle).length;
    showDialog(
      `Are you sure you want to send the boxes to ${main}?`,
      `${n} box${n === 1 ? '' : 'es'} on ${vehicle}.`,
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', onPress: async () => toast(await st.send()) },
      ],
    );
  };

  const onTruck = st.loaded.filter((b) => b.vehicle === vehicle);

  // Receive Internal Transfer Boxes: count them off the truck and receive the whole trip, or scan each box.
  // the trip as the latest load has it (boxes scanned meanwhile change what is still on the way)
  const [receivingKey, setReceivingKey] = useState<string | null>(null);
  const receiving = receivingKey ? (st.trips.find((t) => t.key === receivingKey) ?? null) : null;
  const setReceiving = (trip: TransferTrip | null) => setReceivingKey(trip?.key ?? null);
  const [count, setCount] = useState('');
  const expected = receiving ? receiving.total - receiving.received : 0;
  const onReceiveAll = async () => {
    if (!receiving) return;
    const out = await st.receiveTrip(receiving, Number(count) || 0);
    toast(out);
    if (out.kind === 'success') setReceiving(null);
  };

  return (
    <Screen title="Internal Box Transfer" loading={st.loading && !role} error={!role ? st.error : null} onRetry={load} onRefresh={load}>
      <Card>
        <DateSelector value={date} onChange={setDate} />
      </Card>

      {role === 'none' ? (
        <Alert tone="warn">This station neither sends boxes to nor receives them at {main || 'the main sales farm'}.</Alert>
      ) : null}

      {role === 'send' ? (
        <>
          <Card title={`Load for ${main}`}>
            <Dropdown
              label="Transfer truck"
              iconName="truck-outline"
              value={vehicle || null}
              options={trucks.map((t) => ({ label: t.label, value: t.name }))}
              placeholder="Pick the truck"
              searchable
              onChange={(v) => {
                setVehicle(v);
                focusWhenReady(scanRef);
              }}
            />
            <View style={{ height: spacing.md }} />
            <ScanField
              ref={scanRef}
              onScan={onScan}
              editable={!submitting && !!vehicle}
              placeholder={vehicle ? 'Scan box label' : 'Pick the truck first'}
            />
            <View style={{ height: spacing.md }} />
            <Button
              label={vehicle ? `Send ${vehicle} · ${onTruck.length}` : 'Send truck'}
              iconLeft="car-outline"
              disabled={!vehicle || !onTruck.length || submitting}
              onPress={onSend}
            />
          </Card>

          <Card title={`To load · ${st.toLoad.length}`}>
            {st.toLoad.length ? st.toLoad.map((b) => <BoxRow key={b.boxLabel} b={b} />) : <Text style={s.empty}>No staged boxes waiting.</Text>}
          </Card>

          {st.notStaged.length ? (
            <Card title={`Not staged yet · ${st.notStaged.length}`}>
              {st.notStaged.map((b) => (
                <BoxRow key={b.boxLabel} b={b} />
              ))}
            </Card>
          ) : null}

          <Text style={s.section}>Trips</Text>
          {st.trips.length ? st.trips.map((tr) => <TripCard key={tr.key} trip={tr} />) : (
            <Card>
              <Text style={s.empty}>No trips yet.</Text>
            </Card>
          )}
        </>
      ) : null}

      {role === 'receive' ? (
        <>
          <Card title={`Receive at ${main}`}>
            <ScanField ref={scanRef} onScan={onScan} autoFocus editable={!submitting} placeholder="Scan box label" />
          </Card>

          <Text style={s.section}>Trips</Text>
          {st.trips.length ? (
            st.trips.map((tr) => (
              <TripCard
                key={tr.key}
                trip={tr}
                onReceive={(trip) => {
                  setCount('');
                  setReceiving(trip);
                }}
              />
            ))
          ) : (
            <Card>
              <Text style={s.empty}>No boxes on their way.</Text>
            </Card>
          )}
          <Dialog
            visible={!!receiving}
            onClose={() => setReceiving(null)}
            busy={submitting}
            icon={{ name: 'download-outline', tone: 'info' }}
            title={receiving ? `Receive ${receiving.vehicle} from ${receiving.from}` : ''}
            subtitle={`${expected} box${expected === 1 ? '' : 'es'} on the way`}
            actions={
              <>
                <Button
                  label="Scan each box"
                  variant="outline"
                  onPress={() => {
                    setReceiving(null);
                    focusWhenReady(scanRef);
                  }}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Received all"
                  loading={submitting}
                  disabled={Number(count) !== expected}
                  onPress={onReceiveAll}
                  style={{ flex: 1 }}
                />
              </>
            }
          >
            <TextInput
              value={count}
              onChangeText={(v) => setCount(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="Boxes counted"
              placeholderTextColor={COLORS.textMuted}
              style={s.count}
            />
          </Dialog>
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  box: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text },
  meta: { fontSize: fontSize.sm, color: COLORS.textMuted },
  from: { fontSize: fontSize.sm, color: COLORS.textMuted },
  empty: { fontSize: fontSize.sm, color: COLORS.textMuted },
  section: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text, marginTop: spacing.md, marginBottom: spacing.xs },
  tripHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tripTitle: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text },
  count: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.lg ?? 18,
    color: COLORS.text,
    textAlign: 'center',
  },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  pillText: { fontSize: fontSize.xs ?? 11, fontFamily: fontFamily.medium },
});
