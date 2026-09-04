import axios, { isAxiosError } from 'axios';
import {
  attachStartTime,
  elapsed,
  logError,
  logRequest,
  logResponse,
  type LoggableConfig,
} from '@/src/core/api/log';

export type LoginRawResponse = {
  status: number;
  body: { full_name?: string; message?: string };
  setCookie: string | null;
};

export async function probeBaseUrl(rawUrl: string): Promise<string> {
  const trimmed = rawUrl.trim();

  // If the caller already specified a protocol, trust it without probing.
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/$/, '');
  }

  // No protocol supplied. Real public hostnames are ALWAYS HTTPS — never
  // silently downgrade to cleartext HTTP, which breaks release/standalone
  // Android builds (the HTTPS HEAD probe can fail/timeout on a cold native
  // start, and the cleartext POST then throws "Network error"). Only local /
  // IP / explicit-port dev benches may legitimately be HTTP, so we probe those.
  const host = trimmed.replace(/\/.*$/, '');
  const isLocalOrIp =
    /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(host) || // IPv4 (optional port)
    /:\d+$/.test(host) ||                            // any host:port
    /^localhost(:\d+)?$/i.test(host) ||
    /\.local$/i.test(host);

  if (!isLocalOrIp) {
    return `https://${trimmed}`;
  }

  // Local / IP / dev bench — probe HTTPS, fall back to HTTP.
  const httpsUrl = `https://${trimmed}`;
  const config: LoggableConfig = attachStartTime({ method: 'HEAD', url: httpsUrl });
  logRequest(config);
  try {
    const res = await axios.head(httpsUrl, { timeout: 5000 });
    logResponse({ ...res, config: { ...res.config, ...config } } as never, elapsed(config));
    return httpsUrl;
  } catch (err) {
    if (isAxiosError(err)) logError(err, elapsed(config));
    else console.log('[API] ✗ probe error:', err);
    return `http://${trimmed}`;
  }
}

export async function loginRequest(
  fullUrl: string,
  email: string,
  password: string,
): Promise<LoginRawResponse> {
  const form = new URLSearchParams();
  form.append('usr', email);
  form.append('pwd', password);

  // Password is intentionally NOT logged — we log usr only.
  const config: LoggableConfig = attachStartTime({
    method: 'POST',
    url: `${fullUrl}/api/method/login`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data: { usr: email, pwd: '<redacted>' },
  });
  logRequest(config);

  try {
    const res = await axios.post(`${fullUrl}/api/method/login`, form.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30000,
      validateStatus: () => true,
    });
    logResponse({ ...res, config: { ...res.config, ...config } } as never, elapsed(config));
    const setCookie =
      (res.headers['set-cookie'] as string[] | string | undefined) ?? null;
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
    return { status: res.status, body: res.data ?? {}, setCookie: cookieHeader };
  } catch (err) {
    if (isAxiosError(err)) logError(err, elapsed(config));
    else console.log('[API] ✗ login error:', err);
    const e = err as { message?: string };
    return { status: 0, body: { message: e.message ?? 'Network error' }, setCookie: null };
  }
}
