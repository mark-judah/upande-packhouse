import { storage, StorageKeys } from '@/src/core/storage';

/**
 * Instances this device has successfully signed in to, so the login screen can
 * offer them as one-tap choices instead of making someone retype a URL.
 *
 * Only a successful login adds one: a typo never becomes a suggestion. Each
 * entry remembers the last email used there, so switching instance also
 * switches the account field.
 */

export type KnownInstance = {
  /** Full base URL as the login stored it, e.g. `https://kaitet-group.upande.com`. */
  url: string;
  email: string | null;
  lastUsedAt: number;
};

const MAX_INSTANCES = 10;

/** `https://Foo.com/` and `foo.com` are the same instance. */
export function instanceKey(url: string | null | undefined): string {
  return String(url ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
}

/** What the user sees: the host without the scheme. */
export function instanceLabel(url: string): string {
  return String(url).replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

/** Null when the list has never been written — distinct from emptied. */
async function readRaw(): Promise<KnownInstance[] | null> {
  try {
    const raw = await storage.get(StorageKeys.knownInstances);
    if (raw == null) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((i) => i && typeof i.url === 'string') : [];
  } catch {
    return [];
  }
}

async function read(): Promise<KnownInstance[]> {
  return (await readRaw()) ?? [];
}

async function write(list: KnownInstance[]): Promise<void> {
  await storage.set(StorageKeys.knownInstances, JSON.stringify(list.slice(0, MAX_INSTANCES)));
}

export const knownInstances = {
  /** Newest first. Seeds itself from the pre-existing single backup URL so a
   *  device that signed in before this list existed still has its instance. */
  async list(): Promise<KnownInstance[]> {
    const list = await readRaw();
    // Seed only a never-written list, so removing the last entry sticks.
    if (list) return list.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
    const [url, email] = await Promise.all([
      storage.get(StorageKeys.instanceUrlBackup),
      storage.get(StorageKeys.emailBackup),
    ]);
    if (!url) return [];
    const seeded = [{ url, email, lastUsedAt: Date.now() }];
    await write(seeded).catch(() => {});
    return seeded;
  },

  async remember(url: string, email: string | null): Promise<void> {
    const key = instanceKey(url);
    if (!key) return;
    const rest = (await read()).filter((i) => instanceKey(i.url) !== key);
    await write([{ url, email, lastUsedAt: Date.now() }, ...rest]);
  },

  async forget(url: string): Promise<KnownInstance[]> {
    const key = instanceKey(url);
    const next = (await read()).filter((i) => instanceKey(i.url) !== key);
    await write(next);
    return next.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  },
};
