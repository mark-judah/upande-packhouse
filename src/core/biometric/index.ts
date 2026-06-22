/**
 * Safe wrapper around expo-local-authentication.
 *
 * The native module is compiled into the APK. If an OTA JS bundle loads the
 * shim on a binary that doesn't ship the native side, calling it crashes at
 * the native layer (JS can't catch it). We probe three ways before importing
 * the module and degrade silently when it's missing.
 */
import { NativeModules } from 'react-native';

let cached: any = null;
let attempted = false;

function nativeRegistered(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const core = require('expo-modules-core');
    if (core && typeof core.requireOptionalNativeModule === 'function') {
      const native = core.requireOptionalNativeModule('ExpoLocalAuthentication');
      if (native) return true;
    }
  } catch {}
  try {
    if (NativeModules && (NativeModules as any).ExpoLocalAuthentication) return true;
  } catch {}
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rn = require('react-native');
    const reg = rn?.TurboModuleRegistry;
    if (reg && typeof reg.get === 'function') {
      if (reg.get('ExpoLocalAuthentication')) return true;
    }
  } catch {}
  return false;
}

function getModule(): any {
  if (attempted) return cached;
  attempted = true;
  if (!nativeRegistered()) return null;
  try {
    cached = require('expo-local-authentication');
    if (!cached || typeof cached.hasHardwareAsync !== 'function') cached = null;
  } catch {
    cached = null;
  }
  return cached;
}

export function isModuleAvailable(): boolean {
  return getModule() !== null;
}

export async function hasHardware(): Promise<boolean> {
  const m = getModule();
  if (!m) return false;
  try { return await m.hasHardwareAsync(); } catch { return false; }
}

export async function isEnrolled(): Promise<boolean> {
  const m = getModule();
  if (!m) return false;
  try { return await m.isEnrolledAsync(); } catch { return false; }
}

export async function isAvailable(): Promise<boolean> {
  if (!isModuleAvailable()) return false;
  const [hw, en] = await Promise.all([hasHardware(), isEnrolled()]);
  return hw && en;
}

export interface BiometricAuthOptions {
  promptMessage?: string;
  cancelLabel?: string;
  fallbackLabel?: string;
  disableDeviceFallback?: boolean;
}

export interface BiometricAuthResult {
  success: boolean;
  error?: string;
}

export async function authenticate(opts: BiometricAuthOptions = {}): Promise<BiometricAuthResult> {
  const m = getModule();
  if (!m) return { success: false, error: 'biometric_unavailable' };
  try {
    const res = await m.authenticateAsync(opts);
    return { success: !!res?.success, error: res?.error };
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'auth_failed' };
  }
}
