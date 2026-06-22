import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/src/core/ui/Screen';
import { Card } from '@/src/core/ui/Card';
import { Button } from '@/src/core/ui/Button';
import { Dropdown } from '@/src/core/ui/Dropdown';
import { LabeledInput } from '@/src/core/ui/LabeledInput';
import { useToast } from '@/src/core/ui/Toast';
import { useTenant } from '@/src/core/tenant/tenant-context';
import { useUserStation } from '@/src/core/tenant/user-station';
import { COLORS } from '@/src/core/theme';
import { useStationStore } from './store';
import { stationRepository } from './repository';

type Props = {
  /** Optional route to navigate to once the station is saved. */
  next?: string;
};

export function ConfigureStationScreen({ next }: Props) {
  const { tenant } = useTenant();
  const { station, setStation } = useUserStation();
  const { showSuccess, showError } = useToast();

  const farms = useStationStore((s) => s.farms);
  const greenhouses = useStationStore((s) => s.greenhouses);
  const loading = useStationStore((s) => s.loading);
  const error = useStationStore((s) => s.error);
  const load = useStationStore((s) => s.load);

  const [farm, setFarm] = useState<string>(station?.userFarm ?? '');
  const [greenhouse, setGreenhouse] = useState<string>(station?.userGreenhouse ?? '');
  const [greenhouseFocused, setGreenhouseFocused] = useState(false);
  const [saving, setSaving] = useState(false);

  const isXflora = tenant === 'Xflora';

  useEffect(() => {
    if (farms.length === 0 && greenhouses.length === 0) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredGreenhouses = useMemo(
    () => stationRepository.filterGreenhousesForFarm(tenant, farm, greenhouses),
    [tenant, farm, greenhouses],
  );

  const greenhouseSuggestions = useMemo(() => {
    if (!greenhouse) return filteredGreenhouses;
    return filteredGreenhouses.filter((g) =>
      g.toLowerCase().includes(greenhouse.toLowerCase()),
    );
  }, [filteredGreenhouses, greenhouse]);

  const onSave = async () => {
    if (!farm) {
      showError('Farm required.');
      return;
    }
    if (!isXflora && !greenhouse.trim()) {
      showError('Station required.');
      return;
    }
    setSaving(true);
    try {
      await setStation({
        userFarm: farm,
        userGreenhouse: isXflora ? '' : greenhouse.trim(),
      });
      showSuccess('Station saved.');
      if (next) router.replace(next as never);
      else router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      title="Configure Station"
      loading={loading && farms.length === 0 && greenhouses.length === 0}
      error={error}
      onRetry={load}
    >
      <Card>
        <Dropdown
          label="Farm"
          iconName="barn"
          value={farm || null}
          options={farms.map((f) => ({ label: f.farmName, value: f.name }))}
          placeholder="Select farm"
          searchable
          onChange={(v) => {
            setFarm(v);
            setGreenhouse('');
          }}
        />

        {!isXflora ? (
          <>
            <View style={{ height: 12 }} />
            <LabeledInput
              label="Current Station"
              iconName="home-variant-outline"
              value={greenhouse}
              onChangeText={setGreenhouse}
              onFocus={() => setGreenhouseFocused(true)}
              onBlur={() => setTimeout(() => setGreenhouseFocused(false), 150)}
              placeholder={
                farm
                  ? filteredGreenhouses.length > 0
                    ? 'Type to filter stations'
                    : 'No stations match this farm'
                  : 'Select a farm first'
              }
              editable={!!farm}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {greenhouseFocused && farm && greenhouseSuggestions.length > 0 ? (
              <ScrollView
                style={s.suggestions}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                {greenhouseSuggestions.map((g) => (
                  <Pressable
                    key={g}
                    onPress={() => {
                      setGreenhouse(g);
                      setGreenhouseFocused(false);
                    }}
                    style={s.suggestion}
                  >
                    <Text style={s.suggestionText}>{g}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
          </>
        ) : null}

        <View style={{ height: 16 }} />
        <Button
          label={saving ? 'Saving…' : 'Save Station Info'}
          loading={saving}
          onPress={onSave}
        />
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  suggestions: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: COLORS.bg,
    marginTop: 4,
    maxHeight: 220,
  },
  suggestion: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  suggestionText: { color: COLORS.text, fontSize: 14 },
});
