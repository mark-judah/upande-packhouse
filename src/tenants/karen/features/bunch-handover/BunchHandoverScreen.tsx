import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/src/core/ui/Screen';
import { Card } from '@/src/core/ui/Card';
import { Dropdown } from '@/src/core/ui/Dropdown';
import { LabeledInput } from '@/src/core/ui/LabeledInput';
import { Button } from '@/src/core/ui/Button';
import { useToast } from '@/src/core/ui/Toast';
import { useKarenBunchHandoverStore } from '@/src/tenants/karen/state/karen-bunch-handover-store';
import { COLORS, fontFamily, fontSize, spacing } from '@/src/core/theme';

export function KarenBunchHandoverScreen() {
  const { showSuccess, showError } = useToast();
  const {
    staffLoading,
    staffError,
    graders,
    packers,
    selectedGrader,
    selectedPacker,
    bunches,
    submitting,
    recent,
    loadStaff,
    setGrader,
    setPacker,
    setBunches,
    submit,
  } = useKarenBunchHandoverStore();

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const onSubmit = async () => {
    const outcome = await submit();
    if (outcome.kind === 'success') showSuccess(outcome.message);
    else showError(outcome.message);
  };

  return (
    <Screen title="Bunch Handover" onRefresh={loadStaff}>
      <Card title="Log handover">
        <Dropdown
          label="Grader"
          value={selectedGrader}
          options={graders}
          placeholder={staffLoading ? 'Loading…' : 'Select grader'}
          iconName="account-outline"
          onChange={setGrader}
          disabled={staffLoading}
        />
        <View style={{ height: spacing.sm }} />
        <Dropdown
          label="Packer"
          value={selectedPacker}
          options={packers}
          placeholder={staffLoading ? 'Loading…' : 'Select packer'}
          iconName="account-arrow-right-outline"
          onChange={setPacker}
          disabled={staffLoading}
        />
        <View style={{ height: spacing.sm }} />
        <LabeledInput
          label="Bunches"
          iconName="flower-outline"
          value={bunches}
          onChangeText={setBunches}
          keyboardType="number-pad"
          placeholder="How many bunches"
          editable={!submitting}
        />
        <View style={{ height: spacing.sm }} />
        <Button
          label={submitting ? 'Saving…' : 'Log handover'}
          onPress={onSubmit}
          disabled={submitting || staffLoading}
        />
        {staffError ? <Text style={s.err}>{staffError}</Text> : null}
      </Card>

      {recent.length > 0 ? (
        <Card title="This session">
          {recent.map((r, i) => (
            <View key={i} style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowMain} numberOfLines={1}>
                  {r.grader} → {r.packer}
                </Text>
                <Text style={s.rowSub}>{r.at}</Text>
              </View>
              <Text style={s.rowQty}>{r.bunches}</Text>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  err: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: '#dc2626',
    marginTop: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  rowMain: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.text },
  rowSub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, marginTop: 1 },
  rowQty: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: COLORS.text, marginLeft: spacing.md },
});
