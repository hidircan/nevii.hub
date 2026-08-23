import {
  deleteAnnouncementAttachmentSupabase,
  downloadAnnouncementAttachmentSupabase,
  uploadAnnouncementAttachmentSupabase,
} from "./supabase-adapter";
import type { StorageAdapter, UploadResult } from "./types";
import { assertTenantStorageKey } from "./keys";

export type { UploadResult, StorageAdapter } from "./types";
export { sanitizeAttachmentFileName, assertTenantStorageKey } from "./keys";
export {
  ANNOUNCEMENT_ALLOWED_MIME,
  ANNOUNCEMENT_MAX_BYTES,
  isAllowedAnnouncementMime,
  assertAnnouncementFileBuffer,
} from "./file-guards";

let adapter: StorageAdapter | null = null;

export function setStorageAdapter(a: StorageAdapter | null) {
  adapter = a;
}

function isTestEnv(): boolean {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}

async function resolveAdapter(): Promise<StorageAdapter> {
  if (adapter) return adapter;

  if (isTestEnv()) {
    const { fakeStorageAdapter } = await import("./fake-adapter");
    adapter = fakeStorageAdapter;
    return adapter;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Storage yapılandırma hatası: Supabase Storage için gerekli ortam değişkenleri bulunamadı. Lütfen sunucu ortamınızda NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY ayarlarını yapın ve 'announcement-attachments' adlı private bucket oluşturun."
    );
  }

  adapter = {
    uploadAnnouncementAttachment: uploadAnnouncementAttachmentSupabase,
    deleteAnnouncementAttachment: deleteAnnouncementAttachmentSupabase,
    downloadAnnouncementAttachment: downloadAnnouncementAttachmentSupabase,
  };
  return adapter;
}

export async function uploadAnnouncementAttachment(
  tenantId: string,
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<UploadResult> {
  const a = await resolveAdapter();
  return a.uploadAnnouncementAttachment(tenantId, buffer, fileName, mimeType);
}

export async function deleteAnnouncementAttachment(storageKey: string): Promise<void> {
  const a = await resolveAdapter();
  return a.deleteAnnouncementAttachment(storageKey);
}

export async function downloadAnnouncementAttachment(
  tenantId: string,
  storageKey: string
): Promise<Buffer> {
  assertTenantStorageKey(tenantId, storageKey);
  const a = await resolveAdapter();
  return a.downloadAnnouncementAttachment(storageKey);
}
