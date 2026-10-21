import { api } from '@/src/core/api/client';

/** What the server says about one device's build, against that app's latest. */
export type InstallStatus = 'current' | 'behind_ota' | 'needs_apk' | 'ahead' | 'dormant' | 'unknown';

export type InstallRow = {
  install_id: string;
  app: string;
  user: string;
  full_name: string;
  platform: string;
  device_brand: string | null;
  device_model: string | null;
  device_name: string | null;
  os_version: string | null;
  app_version: string | null;
  runtime_version: string | null;
  previous_app_version: string | null;
  version_changed_at: string | null;
  is_physical_device: boolean;
  ip_address: string | null;
  first_seen: string | null;
  last_seen: string | null;
  launches: number;
  logins: number;
  status: InstallStatus;
  /** The server's own words for what to install next; empty when nothing. */
  update_to: string;
};

export type InstallsReply = {
  rows: InstallRow[];
  total: number;
  start: number;
  page_length: number;
  by_status: Partial<Record<InstallStatus, number>>;
  latest: Record<string, { latest_version: string; latest_runtime: string; latest_apk_version: string }>;
  server_time: string;
};

export type InstallsQuery = {
  app?: string;
  status?: InstallStatus;
  user?: string;
  since_days?: number;
  include_dormant?: boolean;
  start?: number;
  page_length?: number;
};

/** The install register (System Managers only; the server refuses anyone else). */
export async function fetchInstalls(q: InstallsQuery): Promise<InstallsReply> {
  const params: Record<string, string | number> = {};
  if (q.app) params.app = q.app;
  if (q.status) params.status = q.status;
  if (q.user) params.user = q.user;
  if (q.since_days) params.since_days = q.since_days;
  if (q.include_dormant) params.include_dormant = 1;
  if (q.start) params.start = q.start;
  if (q.page_length) params.page_length = q.page_length;
  const res = await api<{ message?: InstallsReply }>({
    method: 'GET',
    url: '/api/method/upande_quality.mobile.mobile_app.installs',
    params,
  });
  const m = res?.message;
  if (!m || !Array.isArray(m.rows)) throw new Error('Unexpected response from server.');
  return m;
}

/**
 * A server timestamp (`YYYY-MM-DD HH:MM:SS[.ffffff]`, site time, no offset) as
 * epoch ms, or null. Engines that refuse six-digit fractions get them trimmed
 * to milliseconds.
 */
export function parseServerTime(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const iso = ts.trim().replace(' ', 'T');
  let t = Date.parse(iso);
  if (!Number.isFinite(t)) t = Date.parse(iso.replace(/(\.\d{3})\d+/, '$1'));
  return Number.isFinite(t) ? t : null;
}

/** `next` appended to `prev`, one row per install: a row that moved between
 *  pages while paging keeps its first place, with the newer data. */
export function mergeInstallRows(prev: InstallRow[], next: InstallRow[]): InstallRow[] {
  const out = [...prev];
  const at = new Map(out.map((r, i) => [r.install_id, i]));
  for (const r of next) {
    const i = at.get(r.install_id);
    if (i == null) {
      at.set(r.install_id, out.length);
      out.push(r);
    } else {
      out[i] = r;
    }
  }
  return out;
}
