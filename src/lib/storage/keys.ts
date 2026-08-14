/** Tenant-scoped object keys: `{tenantId}/{timestamp}-{uid}-{safeName}` */

export function sanitizeAttachmentFileName(fileName: string): string {
  const base = fileName.replace(/\\/g, "/").split("/").pop()?.trim() || "file";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^\.+/, "") || "file";
  return cleaned.slice(0, 80);
}

export function assertTenantStorageKey(tenantId: string, storageKey: string): void {
  if (!tenantId || !storageKey) {
    throw new Error("Geçersiz depolama anahtarı.");
  }
  if (storageKey.includes("..") || storageKey.includes("\\") || storageKey.startsWith("/")) {
    throw new Error("Geçersiz depolama anahtarı.");
  }
  if (!storageKey.startsWith(`${tenantId}/`)) {
    throw new Error("Depolama anahtarı bu kuruma ait değil.");
  }
}
