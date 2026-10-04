import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, DMSans_400Regular, DMSans_500Medium } from '@expo-google-fonts/dm-sans';
import { Poppins_600SemiBold, Poppins_700Bold } from '@expo-google-fonts/poppins';
import 'react-native-reanimated';
import { TenantProvider, useTenant } from '@/src/core/tenant/tenant-context';
import { ToastProvider } from '@/src/core/ui/Toast';
import { DialogHost } from '@/src/core/ui/DialogHost';
import { OfflineBanner } from '@/src/core/ui/OfflineBanner';
import { DrawerItemsProvider } from '@/src/core/ui/drawer-items-context';
import { useAuthStore } from '@/src/core/auth/store';
import { useNetworkStore } from '@/src/core/network/store';
import { reportVersionIfDue } from '@/src/core/version';
import { getDrawerFor } from '@/src/composition/drawer-resolver';
import { UpdateProvider } from '@/src/core/updates/UpdateProvider';

// Hold the native splash until fonts + auth hydrated.
SplashScreen.preventAutoHideAsync().catch(() => {});

function TenantScopedDrawer({ children }: { children: React.ReactNode }) {
  const { tenant } = useTenant();
  return <DrawerItemsProvider items={getDrawerFor(tenant)}>{children}</DrawerItemsProvider>;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });

  const hydrate = useAuthStore((s) => s.hydrate);
  const hasSession = useAuthStore((s) => s.hasSession);
  const hydrated = useAuthStore((s) => s.hydrated);
  const biometricLocked = useAuthStore((s) => s.biometricLocked);
  const initNetwork = useNetworkStore((s) => s.init);

  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    hydrate();
    initNetwork();
  }, [hydrate, initNetwork]);

  useEffect(() => {
    if (fontsLoaded && hydrated) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, hydrated]);

  useEffect(() => {
    if (hydrated && hasSession && !biometricLocked) reportVersionIfDue();
  }, [hydrated, hasSession, biometricLocked]);

  // Auth gate: route to login → biometric-lock → home based on state.
  useEffect(() => {
    if (!hydrated) return;
    const first = segments[0] as string | undefined;

    if (!hasSession) {
      if (first !== 'login') router.replace('/login');
      return;
    }
    if (biometricLocked) {
      if (first !== 'biometric-lock') router.replace('/biometric-lock' as never);
      return;
    }
    if (first === 'login' || first === 'biometric-lock') {
      router.replace('/home');
    }
  }, [hydrated, hasSession, biometricLocked, segments, router]);

  if (!fontsLoaded || !hydrated) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <UpdateProvider>
          <TenantProvider>
            <TenantScopedDrawer>
              <ToastProvider>
                <StatusBar style="dark" />
                <Stack
                  screenOptions={{
                    headerShown: false,
                    animation: 'slide_from_right',
                    gestureEnabled: true,
                  }}
                >
                  <Stack.Screen name="index" />
                  <Stack.Screen name="login" />
                  <Stack.Screen name="biometric-lock" options={{ animation: 'fade' }} />
                  <Stack.Screen name="home" />
                  <Stack.Screen name="issuing" />
                  <Stack.Screen name="packing" />
                  <Stack.Screen name="loading" />
                  <Stack.Screen name="bucket-logistics" />
                  <Stack.Screen name="dispatch" />
                  <Stack.Screen name="configure-station" />
                  <Stack.Screen name="settings" />
                  <Stack.Screen name="debug-log" options={{ presentation: 'modal' }} />
                  <Stack.Screen
                    name="camera-scanner"
                    options={{ presentation: 'fullScreenModal' }}
                  />
                  <Stack.Screen
                    name="camera-capture"
                    options={{ presentation: 'fullScreenModal' }}
                  />
                </Stack>
                <OfflineBanner />
                {/* App-styled confirms / notices (showDialog), above every screen. */}
                <DialogHost />
              </ToastProvider>
            </TenantScopedDrawer>
          </TenantProvider>
        </UpdateProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
