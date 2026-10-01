import { api, mapAxiosError } from '@/src/core/api/client';

export type ServerVersions = { frappe: string | null; erpnext: string | null };

type AppInfo = { version?: string };

/** Frappe and ERPNext versions of the signed-in instance (frappe.utils.change_log.get_versions). */
export async function fetchServerVersions(): Promise<ServerVersions> {
  try {
    const res = await api<{ message?: Record<string, AppInfo> }>({
      method: 'GET',
      url: '/api/method/frappe.utils.change_log.get_versions',
    });
    const apps = res?.message ?? {};
    return {
      frappe: apps.frappe?.version ?? null,
      erpnext: apps.erpnext?.version ?? null,
    };
  } catch (err) {
    throw mapAxiosError(err);
  }
}
