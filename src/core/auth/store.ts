import { create } from 'zustand';
import { authRepository } from './repository';
import { storage, StorageKeys } from '@/src/core/storage';
import * as Biometric from '@/src/core/biometric';

type AuthState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  error: string | null;
  fullName: string | null;
  email: string | null;
  instanceUrl: string | null;
  hasSession: boolean;
  hydrated: boolean;
  roles: string[];

  /** Per-device biometric setting. */
  biometricEnabled: boolean;
  /** Runtime gate — true when the app should show the biometric lock screen. */
  biometricLocked: boolean;

  hydrate: () => Promise<void>;
  login: (email: string, password: string, url: string) => Promise<boolean>;
  /** Prompt the OS biometric, then re-authenticate using the stored password.
   *  Returns a structured outcome so the screen can show the right message. */
  biometricLogin: () => Promise<
    | { ok: true }
    | { ok: false; reason: 'cancelled' | 'no_credentials' | 'auth_failed' | 'unavailable'; message?: string }
  >;
  setBiometricEnabled: (on: boolean) => Promise<void>;
  unlock: () => void;
  /** Soft logout — clear the in-memory session view but keep cookie +
   *  biometric flag so the user can sign back in with biometrics. */
  logout: () => Promise<void>;
  /** Hard logout — wipe everything. Used on 401 / "Forget device". */
  forgetDevice: () => Promise<void>;
  hasRole: (role: string) => boolean;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'idle',
  error: null,
  fullName: null,
  email: null,
  instanceUrl: null,
  hasSession: false,
  hydrated: false,
  roles: [],
  biometricEnabled: false,
  biometricLocked: false,

  hydrate: async () => {
    // fullName was never read back here before -- every fresh app launch
    // (not a brand-new login within the same session) left it null in
    // memory, so the home screen's `fullName || email` greeting fell back
    // to the email on every relaunch regardless of what login() had stored.
    const [hasSession, roles, email, fullName, instanceUrl, bioFlag] = await Promise.all([
      authRepository.hasSession(),
      authRepository.loadRoles(),
      storage.get(StorageKeys.emailBackup),
      storage.get(StorageKeys.fullName),
      storage.get(StorageKeys.instanceUrl),
      storage.get(StorageKeys.biometricEnabled),
    ]);
    const biometricEnabled = bioFlag === '1';
    const biometricLocked = hasSession && biometricEnabled && Biometric.isModuleAvailable();
    set({
      hasSession,
      hydrated: true,
      roles,
      email,
      fullName,
      instanceUrl,
      biometricEnabled,
      biometricLocked,
    });
  },

  login: async (email, password, url) => {
    set({ status: 'loading', error: null });
    const result = await authRepository.login(email, password, url);
    if (result.ok) {
      set({
        status: 'success',
        fullName: result.fullName,
        email,
        instanceUrl: result.instanceUrl,
        hasSession: true,
        roles: result.roles,
        error: null,
        // A fresh password login never lands on the biometric lock screen.
        biometricLocked: false,
      });
      return true;
    }
    set({ status: 'error', error: result.error, hasSession: false });
    return false;
  },

  biometricLogin: async () => {
    if (!Biometric.isModuleAvailable()) {
      return { ok: false, reason: 'unavailable' };
    }
    const auth = await Biometric.authenticate({
      promptMessage: 'Sign in to Upande Packhouse',
      fallbackLabel: 'Use password',
      cancelLabel: 'Cancel',
    });
    if (!auth.success) {
      if (auth.error === 'user_cancel' || auth.error === 'system_cancel') {
        return { ok: false, reason: 'cancelled' };
      }
      return { ok: false, reason: 'auth_failed', message: auth.error };
    }
    const { email, password, url } = await authRepository.loadFullCredentials();
    if (!email || !password || !url) {
      return { ok: false, reason: 'no_credentials' };
    }
    const ok = await get().login(email, password, url);
    if (!ok) {
      return { ok: false, reason: 'auth_failed', message: get().error ?? undefined };
    }
    return { ok: true };
  },

  setBiometricEnabled: async (on) => {
    await storage.set(StorageKeys.biometricEnabled, on ? '1' : '0');
    set({ biometricEnabled: on });
  },

  unlock: () => set({ biometricLocked: false }),

  logout: async () => {
    set({
      status: 'idle',
      error: null,
      hasSession: false,
      biometricLocked: false,
    });
  },

  forgetDevice: async () => {
    await authRepository.logout();
    await storage.remove(StorageKeys.biometricEnabled);
    set({
      status: 'idle',
      error: null,
      fullName: null,
      email: null,
      instanceUrl: null,
      hasSession: false,
      roles: [],
      biometricEnabled: false,
      biometricLocked: false,
    });
  },

  hasRole: (role) => get().roles.includes(role) || get().roles.includes('Administrator'),
}));
