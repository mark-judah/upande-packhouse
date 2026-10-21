import { create } from 'zustand';
import { authRepository } from './repository';
import { storage, StorageKeys } from '@/src/core/storage';
import * as Biometric from '@/src/core/biometric';
import { reportInstall } from '@/src/core/version/install-register';
import { setLoginServer } from './server-change';
import { instanceKey, knownInstances } from './known-instances';
import { consumeInstanceSwitched, restartForInstance } from './restart';

/** How long a switching sign-in waits for its register report before restarting. */
const LOGIN_REPORT_WAIT_MS = 3000;
/** How long to wait for a requested reload to take this JS down. */
const RELOAD_GRACE_MS = 5000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, sleep(ms).then(() => null)]);
}

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
  /** Soft logout of the live instance only — its session cookie goes, the
   *  password + biometric flag stay so the user can sign back in with
   *  biometrics. */
  logout: () => Promise<void>;
  /** Sign out and move the login screen to another server. One server at a
   *  time: nothing of this one is kept for it. */
  changeServer: (url: string) => Promise<void>;
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
    const justSwitched = await consumeInstanceSwitched(instanceUrl);
    const biometricEnabled = bioFlag === '1';
    // The start right after a sign-in to another server (this one) was signed in a moment ago.
    const biometricLocked =
      hasSession && biometricEnabled && !justSwitched && Biometric.isModuleAvailable();
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
      if (result.switched) {
        // Signed in to a different instance than the one live before: start
        // the app over before anything routes, so no screen mounts against the
        // new server with the previous one's stores. The sign-in report goes
        // first (briefly) so the register sees this login.
        await withTimeout(reportInstall({ reason: 'login', user: email }), LOGIN_REPORT_WAIT_MS);
        if (await restartForInstance(result.instanceUrl)) {
          // The reload tears this JS down; carry on in place only if it never comes.
          await sleep(RELOAD_GRACE_MS);
          // Still here: the restart never came, so its skip-lock flag goes too.
          await storage.remove(StorageKeys.instanceSwitched).catch(() => {});
        }
      } else {
        reportInstall({ reason: 'login', user: email });
      }
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
    // The server's session goes; the password stays for biometric sign-in.
    // Roles go too: the next person to sign in may not hold them.
    await Promise.all([storage.remove(StorageKeys.cookie), storage.remove(StorageKeys.userRoles)]);
    set({
      status: 'idle',
      error: null,
      hasSession: false,
      roles: [],
      biometricLocked: false,
    });
  },

  changeServer: async (url) => {
    const known = (await knownInstances.list()).find((k) => instanceKey(k.url) === instanceKey(url));
    await setLoginServer(known?.url ?? url, known?.email ?? get().email);
    set({
      status: 'idle',
      error: null,
      fullName: null,
      instanceUrl: null,
      hasSession: false,
      roles: [],
      biometricLocked: false,
    });
    // Every store and open request belonged to the old server: start over, at
    // login. Signed out, so the biometric lock is never skipped for it.
    await restartForInstance();
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
