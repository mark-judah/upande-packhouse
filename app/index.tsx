import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuthStore } from '@/src/core/auth/store';
import { COLORS } from '@/src/core/theme';

export default function Index() {
  const hydrated = useAuthStore((s) => s.hydrated);
  const hasSession = useAuthStore((s) => s.hasSession);
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  if (!hydrated) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: COLORS.bg,
        }}
      >
        <ActivityIndicator color={COLORS.text} />
      </View>
    );
  }

  return <Redirect href={hasSession ? '/home' : '/login'} />;
}
