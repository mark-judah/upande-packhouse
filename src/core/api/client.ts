import axios, { isAxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { storage, StorageKeys } from '@/src/core/storage';
import { recordNetwork } from '@/src/core/debug/debugLogStore';
import { attachStartTime, elapsed, logError, logRequest, logResponse, safeBody } from './log';

let client: AxiosInstance | null = null;

function buildClient(): AxiosInstance {
  const instance = axios.create({ timeout: 30000 });
  instance.interceptors.request.use(async (config) => {
    const baseUrl = await storage.get(StorageKeys.instanceUrl);
    const cookie = await storage.get(StorageKeys.cookie);
    if (baseUrl) config.baseURL = baseUrl;
    config.headers = config.headers ?? {};
    if (cookie) (config.headers as Record<string, string>).Cookie = cookie;
    if (!config.headers['Content-Type']) {
      (config.headers as Record<string, string>)['Content-Type'] = 'application/json';
    }
    attachStartTime(config);
    logRequest(config);
    return config;
  });
  instance.interceptors.response.use(
    (response) => {
      const duration = elapsed(response.config);
      logResponse(response, duration);
      recordNetwork({
        status: 'success',
        method: response.config.method,
        url: response.config.url,
        httpStatus: response.status,
        durationMs: duration,
        payload: safeBody(response.config.data),
        response: safeBody(response.data),
      });
      return response;
    },
    (error) => {
      if (isAxiosError(error)) {
        const duration = elapsed(error.config);
        logError(error, duration);
        recordNetwork({
          status: 'error',
          method: error.config?.method,
          url: error.config?.url,
          httpStatus: error.response?.status,
          durationMs: duration,
          payload: safeBody(error.config?.data),
          response: error.response?.data !== undefined ? safeBody(error.response.data) : error.message,
        });
      } else {
        console.log('[API] ✗ non-axios error:', error);
        recordNetwork({ status: 'error', response: error instanceof Error ? error.message : String(error) });
      }
      return Promise.reject(error);
    },
  );
  return instance;
}

export function apiClient(): AxiosInstance {
  if (!client) client = buildClient();
  return client;
}

export async function api<T = unknown>(config: AxiosRequestConfig): Promise<T> {
  const res = await apiClient().request<T>(config);
  return res.data;
}

export class HttpError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/** `_server_messages` is a JSON-encoded array of JSON-encoded message objects
 *  -- Frappe's wrapper around every `frappe.throw()`/`msgprint(raise_exception=1)`.
 *  This is where the actual human-written message lives (e.g. "Please contact
 *  your IT administrator..."); `exc_type` is just the exception's class name
 *  ("ValidationError") and was the only thing ever surfacing to the user,
 *  which is why a real backend message only ever showed up in console logs. */
function extractServerMessages(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown[];
    const out: string[] = [];
    for (const item of arr) {
      if (typeof item !== 'string') continue;
      try {
        const parsed = JSON.parse(item) as { message?: string };
        if (parsed?.message) out.push(parsed.message);
      } catch {
        out.push(item);
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Frappe messages can carry basic HTML (`<br>`, `<b>`, ...) meant for the
 *  desk's HTML-rendering msgprint dialog; a plain RN Text can't render that,
 *  so it's flattened to plain text instead of showing literal tags. */
function stripHtml(s: string): string {
  return s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
}

/** While the site is being deployed or migrated Frappe answers every request with
 *  503 `{"exc_type": "SessionStopped"}`. Nothing is wrong with the request, so say
 *  that, instead of showing the bare exception name. */
const SERVER_UPDATING = "The server is being updated. Please try again in a few minutes.";

function isServerUpdating(status: number, body: unknown): boolean {
  const exc = body && typeof body === 'object' ? (body as { exc_type?: string }).exc_type : undefined;
  return exc === 'SessionStopped' || status === 503;
}

export function mapAxiosError(err: unknown): HttpError {
  if (isAxiosError(err)) {
    const status = err.response?.status ?? 0;
    const body = err.response?.data;
    if (isServerUpdating(status, body)) return new HttpError(status, SERVER_UPDATING, body);
    let message = err.message;
    if (body && typeof body === 'object') {
      const exc = body as { exc_type?: string; _server_messages?: string; message?: string };
      const serverMessages = extractServerMessages(exc._server_messages);
      if (serverMessages.length) message = stripHtml(serverMessages.join('\n'));
      else if (exc.message) message = exc.message;
      else if (exc.exc_type) message = exc.exc_type;
    }
    return new HttpError(status, message, body);
  }
  return new HttpError(0, err instanceof Error ? err.message : 'Unknown error', null);
}
