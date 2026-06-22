import { useLocalSearchParams } from 'expo-router';
import { ConfigureStationScreen } from '@/src/core/features/station/ConfigureStationScreen';

export default function ConfigureStationRoute() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  return <ConfigureStationScreen next={typeof next === 'string' ? next : undefined} />;
}
