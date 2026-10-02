import { storage, StorageKeys } from '@/src/core/storage';
import { api } from '@/src/core/api/client';
import { loginRequest, probeBaseUrl } from './api';
import { fetchCurrentUserRoles } from './roles-api';
import { knownInstances } from './known-instances';

/** The stock /api/method/login response's `full_name` is computed as
 *  `first_name + last_name` server-side (frappe/auth.py), which reads as an
 *  empty string -- not null, so `?? email` below never catches it -- for
 *  any User whose name was set via the `full_name` field directly rather
 *  than first/last name (confirmed live: real accounts here). Read the real
 *  field straight off the User doctype instead, same fix already applied in
 *  upande-production's auth-api.ts. */
async function fetchRealFullName(email: string): Promise<string | null> {
  try {
    const body = await api<{ message?: { full_name?: string }; data?: { full_name?: string } }>({
      method: 'GET',
      url: `/api/method/frappe.client.get_value?doctype=User&filters={"name":"${email}"}&fieldname=["full_name"]`,
    });
    const m = body?.message ?? body?.data;
    return (m && m.full_name) || null;
  } catch {
    return null;
  }
}

export type LoginOutcome =
  | { ok: true; fullName: string; instanceUrl: string; roles: string[] }
  | { ok: false; error: string };

function extractSidCookie(setCookie: string | null): string | null {
  if (!setCookie) return null;
  // Frappe sends multiple cookies in one Set-Cookie line concatenated.
  // We forward the entire header string back to the server on subsequent calls.
  if (setCookie.includes('sid=')) return setCookie;
  return null;
}

export const authRepository = {
  async login(email: string, password: string, bareUrl: string): Promise<LoginOutcome> {
    const cleanUrl = bareUrl.trim().toLowerCase();
    if (!cleanUrl) return { ok: false, error: 'URL required' };

    const fullUrl = await probeBaseUrl(cleanUrl);
    const res = await loginRequest(fullUrl, email, password);

    if (res.status === 200) {
      const cookie = extractSidCookie(res.setCookie);
      if (!cookie) return { ok: false, error: 'Login succeeded but no session cookie was returned' };
      let fullName = res.body.full_name || email;
      await Promise.all([
        storage.set(StorageKeys.cookie, cookie),
        storage.set(StorageKeys.instanceUrl, fullUrl),
        storage.set(StorageKeys.instanceUrlBackup, fullUrl),
        storage.set(StorageKeys.emailBackup, email),
        storage.set(StorageKeys.fullName, fullName),
        storage.set(StorageKeys.passwordBackup, password),
      ]);

      // The login response's own full_name is often a blank string (see
      // fetchRealFullName's comment) -- now that the cookie is stored, an
      // authenticated follow-up can read the real field. Non-fatal: keeps
      // the response's value (or email) if this fails or also comes back empty.
      try {
        const real = await fetchRealFullName(email);
        if (real && real !== fullName) {
          fullName = real;
          await storage.set(StorageKeys.fullName, fullName);
        }
      } catch {
        // ignore — greeting falls back to the login response's own value
      }
      // After the real name is known, so the login screen can greet by name.
      await knownInstances
        .remember(fullUrl, email, fullName && fullName !== email ? fullName : null)
        .catch(() => {});

      // Fetch roles in the background. Failure is non-fatal — login still succeeds.
      let roles: string[] = [];
      try {
        roles = await fetchCurrentUserRoles();
        await storage.set(StorageKeys.userRoles, JSON.stringify(roles));
      } catch {
        // ignore — UI will treat missing roles as "no special permissions"
      }
      return { ok: true, fullName, instanceUrl: fullUrl, roles };
    }

    if (res.status === 401) {
      return { ok: false, error: 'Username or Password is incorrect' };
    }

    const message = res.body?.message ?? 'Login failed, Try again later';
    return { ok: false, error: message };
  },

  async logout(): Promise<void> {
    await storage.clearExcept([
      StorageKeys.emailBackup,
      StorageKeys.instanceUrlBackup,
      StorageKeys.knownInstances,
    ]);
  },

  async loadBackupCredentials(): Promise<{ email: string | null; url: string | null }> {
    const [email, url] = await Promise.all([
      storage.get(StorageKeys.emailBackup),
      storage.get(StorageKeys.instanceUrlBackup),
    ]);
    return { email, url };
  },

  /** Read every credential needed to silently re-authenticate after a biometric
   *  prompt: email + password + URL. Returns nulls if any piece is missing. */
  async loadFullCredentials(): Promise<{
    email: string | null;
    password: string | null;
    url: string | null;
  }> {
    const [email, password, url] = await Promise.all([
      storage.get(StorageKeys.emailBackup),
      storage.get(StorageKeys.passwordBackup),
      storage.get(StorageKeys.instanceUrlBackup),
    ]);
    return { email, password, url };
  },

  async loadRoles(): Promise<string[]> {
    const raw = await storage.get(StorageKeys.userRoles);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  async hasSession(): Promise<boolean> {
    const cookie = await storage.get(StorageKeys.cookie);
    return !!cookie;
  },
};
