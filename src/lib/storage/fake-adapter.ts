import { uid } from "../utils";
import { assertTenantStorageKey, sanitizeAttachmentFileName } from "./keys";
import type { StorageAdapter, UploadResult } from "./types";

const STORE: Record<string, Buffer> = {};

export async function uploadAnnouncementAttachment(
  tenantId: string,
  buffer: Buffer,
  fileName: string
): Promise<UploadResult> {
  const key = `${tenantId}/${Date.now()}-${uid("fakeatt")}-${sanitizeAttachmentFileName(fileName)}`;
  assertTenantStorageKey(tenantId, key);
  STORE[key] = Buffer.from(buffer);
  return { storageKey: key, sizeBytes: buffer.length };
}

export async function deleteAnnouncementAttachment(storageKey: string): Promise<void> {
  delete STORE[storageKey];
}

export async function downloadAnnouncementAttachment(storageKey: string): Promise<Buffer> {
  const buf = STORE[storageKey];
  if (!buf) throw new Error("Ek bulunamadı.");
  return Buffer.from(buf);
}

export function _getStore() {
  return STORE;
}

export function _clearStore() {
  for (const k of Object.keys(STORE)) delete STORE[k];
}

export const fakeStorageAdapter: StorageAdapter = {
  uploadAnnouncementAttachment,
  deleteAnnouncementAttachment,
  downloadAnnouncementAttachment,
};

export default fakeStorageAdapter;
