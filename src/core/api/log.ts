import type { AxiosError, AxiosResponse } from 'axios';

const TAG = '[API]';

// Loose shape that matches both AxiosRequestConfig and the synthetic configs we
// build in auth/api.ts (where we need to log before/around manual axios calls).
export type LoggableConfig = {
  method?: string;
  url?: string;
  baseURL?: string;
  headers?: unknown;
  params?: unknown;
  data?: unknown;
  _startTime?: number;
};

function fullUrl(config: LoggableConfig): string {
  const base = config.baseURL ?? '';
  const url = config.url ?? '';
  if (!base || /^https?:\/\//.test(url)) return url;
  return base.replace(/\/+$/, '') + '/' + url.replace(/^\/+/, '');
}

function safeBody(body: unknown): unknown {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return body;
    }
  }
  return body;
}

function redactHeaders(headers: unknown): Record<string, unknown> | undefined {
  if (!headers || typeof headers !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
    if (k.toLowerCase() === 'cookie' && typeof v === 'string' && v.length) {
      out[k] = '<sid present>';
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function attachStartTime<T extends LoggableConfig>(config: T): T {
  config._startTime = Date.now();
  return config;
}

export function elapsed(config: LoggableConfig | undefined): number {
  if (!config) return 0;
  return config._startTime ? Date.now() - config._startTime : 0;
}

export function logRequest(config: LoggableConfig): void {
  const method = (config.method ?? 'GET').toUpperCase();
  console.log(`${TAG} → ${method} ${fullUrl(config)}`);
  const headers = redactHeaders(config.headers);
  if (headers && Object.keys(headers).length > 0) console.log(`${TAG}   headers:`, headers);
  if (config.params) console.log(`${TAG}   params:`, config.params);
  if (config.data !== undefined) console.log(`${TAG}   body:`, safeBody(config.data));
}

export function logResponse(response: AxiosResponse, durationMs: number): void {
  const cfg = response.config as LoggableConfig;
  const method = (cfg.method ?? 'GET').toUpperCase();
  console.log(
    `${TAG} ← ${response.status} ${method} ${fullUrl(cfg)} (${durationMs}ms)`,
  );
  console.log(`${TAG}   response:`, safeBody(response.data));
}

export function logError(error: AxiosError, durationMs: number): void {
  const cfg = error.config as LoggableConfig | undefined;
  const method = (cfg?.method ?? 'GET').toUpperCase();
  const url = cfg ? fullUrl(cfg) : '(no config)';
  const status = error.response?.status ?? 'no-response';
  console.log(`${TAG} ✗ ${status} ${method} ${url} (${durationMs}ms) — ${error.message}`);
  if (error.response?.data !== undefined) {
    console.log(`${TAG}   error body:`, safeBody(error.response.data));
  }
}
