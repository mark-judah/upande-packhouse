import { api } from '@/src/core/api/client';

export type RawUserRolesResponse = {
  data?: {
    user?: string;
    roles?: string[];
    error?: string;
  };
  message?: {
    user?: string;
    roles?: string[];
    error?: string;
  };
};

export async function fetchCurrentUserRoles(): Promise<string[]> {
  const res = await api<RawUserRolesResponse>({
    method: 'POST',
    url: '/api/method/getCurrentUserRoles',
  });
  const payload = res.data ?? res.message ?? {};
  return Array.isArray(payload.roles) ? payload.roles : [];
}
