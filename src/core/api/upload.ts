import { storage, StorageKeys } from '@/src/core/storage';

/** Returned by Frappe's /api/method/upload_file on success. */
export type UploadedFile = {
  /** Path Frappe serves the file under (e.g. /files/photo-xxxx.jpg). */
  file_url: string;
  /** File doctype document name. */
  name: string;
  file_name: string;
};

/**
 * Upload a single local image file to Frappe via /api/method/upload_file.
 *
 * Uses fetch + FormData directly (rather than the axios client) because the
 * client's request interceptor pins Content-Type to application/json, which
 * breaks multipart uploads. The endpoint accepts any authenticated user; we
 * pass the stored cookie + token explicitly to match the rest of the app.
 */
export async function uploadImage(
  localUri: string,
  fileName?: string,
): Promise<UploadedFile> {
  const baseUrl = await storage.get(StorageKeys.instanceUrl);
  if (!baseUrl) throw new Error('Instance URL is not configured.');
  const cookie = await storage.get(StorageKeys.cookie);

  const form = new FormData();
  form.append('file', {
    // RN's fetch accepts this shape directly when the body is FormData.
    // The cast is needed because lib.dom.d.ts thinks FormData entries are Blob | string.
    uri: localUri,
    name: fileName || localUri.split('/').pop() || 'photo.jpg',
    type: 'image/jpeg',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  form.append('is_private', '0');
  form.append('folder', 'Home');

  const headers: Record<string, string> = {};
  if (cookie) headers['Cookie'] = cookie;
  // Do NOT set Content-Type — fetch fills in the multipart boundary itself.

  const res = await fetch(baseUrl + '/api/method/upload_file', {
    method: 'POST',
    headers,
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error('Upload failed (' + res.status + '): ' + text.slice(0, 200));
  }
  const body = await res.json();
  const message = body?.message ?? body?.data ?? body;
  if (!message?.file_url) {
    throw new Error('Upload response missing file_url.');
  }
  return message as UploadedFile;
}
