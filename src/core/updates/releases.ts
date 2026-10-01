import { storage, StorageKeys } from '@/src/core/storage';
import { INSTALLED_APK_VERSION } from '@/src/core/version';

/**
 * Finding a newer APK on GitHub Releases.
 *
 * Two channels ship this app, and this file only cares about one of them:
 *
 *   - OTA (EAS Update) carries JS-only patches to the runtime already installed.
 *     expo-updates handles that on its own and the Settings "Check for updates"
 *     button drives it — nothing here touches it.
 *   - An APK carries a new runtime (native code moved). The release workflow
 *     attaches it to the GitHub Release as `upande_packhouse_v<version>.apk`.
 *
 * Patch releases are published as OTA-only GitHub Releases with no asset, so
 * "the latest release" is often not something that can be downloaded. The
 * question asked here is therefore narrower: what is the newest release that
 * carries an APK, and is it newer than what is running?
 *
 * Plain fetch, not the Frappe client: no session headers should reach GitHub,
 * and this must work when the Frappe site is unreachable.
 */

export const GITHUB_REPO = 'mark-judah/upande-packhouse';
export const RELEASES_PAGE_URL = `https://github.com/${GITHUB_REPO}/releases`;

const RELEASES_API = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=20`;
const TIMEOUT_MS = 15000;

/** One automatic check per device per day — unauthenticated GitHub calls are
 *  limited to 60/hour per IP, and a packhouse puts every phone behind one NAT. */
const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export type ApkRelease = {
  version: string;
  notes: string;
  pageUrl: string;
  downloadUrl: string;
  assetName: string;
  sizeBytes: number | null;
};

export type ApkCheck = {
  current: string;
  /** Newest release of any kind (OTA or APK), for display. */
  latestVersion: string | null;
  /** Newest release that has an APK attached, or null when none does. */
  apk: ApkRelease | null;
  /** True when `apk` is newer than the running version. */
  available: boolean;
};

export type UpdateErrorKind = 'offline' | 'timeout' | 'rate_limited' | 'no_releases' | 'failed';

export class UpdateCheckError extends Error {
  kind: UpdateErrorKind;
  constructor(kind: UpdateErrorKind, message: string) {
    super(message);
    this.name = 'UpdateCheckError';
    this.kind = kind;
  }
}

/** 1 when `a` is newer, -1 when older, 0 when equal. Ignores a leading `v`
 *  and any pre-release suffix; pads so `1.1` equals `1.1.0`. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    String(v ?? '')
      .trim()
      .replace(/^v/i, '')
      .split('-')[0]
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l !== r) return l > r ? 1 : -1;
  }
  return 0;
}

/** Byte count as "12.3 MB", or null when unknown. */
export function formatBytes(bytes: number | null | undefined): string | null {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return null;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type GithubRelease = {
  tag_name?: string;
  body?: string;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
  assets?: { name?: string; browser_download_url?: string; size?: number }[];
};

async function fetchReleases(): Promise<GithubRelease[]> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: controller.signal,
    });
  } catch {
    throw timedOut
      ? new UpdateCheckError('timeout', 'GitHub did not respond in time.')
      : new UpdateCheckError('offline', 'Could not reach GitHub.');
  } finally {
    clearTimeout(timer);
  }

  // GitHub answers an exhausted quota with 403/429 and a zeroed remaining header.
  if (res.status === 429 || (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0')) {
    throw new UpdateCheckError(
      'rate_limited',
      'GitHub is rate limiting this network. Try again later, or open the releases page.',
    );
  }
  if (res.status === 404) throw new UpdateCheckError('no_releases', 'No release has been published yet.');
  if (!res.ok) throw new UpdateCheckError('failed', `GitHub returned ${res.status}.`);

  try {
    const json = await res.json();
    return Array.isArray(json) ? json : [];
  } catch {
    throw new UpdateCheckError('failed', 'GitHub sent a response the app could not read.');
  }
}

function toApkRelease(r: GithubRelease): ApkRelease | null {
  const asset = (r.assets ?? []).find(
    (a) => typeof a?.name === 'string' && a.name.toLowerCase().endsWith('.apk') && a.browser_download_url,
  );
  const version = String(r.tag_name ?? '').replace(/^v/i, '');
  if (!asset || !version) return null;
  return {
    version,
    notes: typeof r.body === 'string' ? r.body.trim() : '',
    pageUrl: r.html_url || RELEASES_PAGE_URL,
    downloadUrl: asset.browser_download_url as string,
    assetName: asset.name as string,
    sizeBytes: asset.size ?? null,
  };
}

/** Ask GitHub now. Throws UpdateCheckError; caches a successful result. */
export async function checkForApk(current: string = INSTALLED_APK_VERSION): Promise<ApkCheck> {
  const releases = (await fetchReleases()).filter((r) => !r.draft && !r.prerelease && r.tag_name);
  if (releases.length === 0) {
    throw new UpdateCheckError('no_releases', 'No release has been published yet.');
  }

  // Sorted by version rather than trusting GitHub's order, which is by date.
  releases.sort((a, b) => compareVersions(String(b.tag_name), String(a.tag_name)));
  const latestVersion = String(releases[0].tag_name).replace(/^v/i, '');
  const apk = releases.map(toApkRelease).find((r): r is ApkRelease => r !== null) ?? null;

  const result: ApkCheck = {
    current,
    latestVersion,
    apk,
    available: !!apk && compareVersions(apk.version, current) > 0,
  };
  await storage
    .set(StorageKeys.apkUpdateCheck, JSON.stringify({ at: Date.now(), result }))
    .catch(() => {});
  return result;
}

/**
 * Check at most once a day, otherwise return the cached verdict. Never throws:
 * a background check that fails leaves the UI as it was.
 */
export async function autoCheckForApk(current: string = INSTALLED_APK_VERSION): Promise<ApkCheck | null> {
  let cached: { at: number; result: ApkCheck } | null = null;
  try {
    const raw = await storage.get(StorageKeys.apkUpdateCheck);
    if (raw) cached = JSON.parse(raw);
  } catch {
    cached = null;
  }
  // A verdict is only meaningful for the build that produced it — after an
  // update it would still claim one is available.
  const fresh =
    cached?.result &&
    cached.result.current === current &&
    Date.now() - cached.at < AUTO_CHECK_INTERVAL_MS;
  if (fresh && cached) return cached.result;

  try {
    return await checkForApk(current);
  } catch {
    return cached?.result?.current === current ? cached.result : null;
  }
}
