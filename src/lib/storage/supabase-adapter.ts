import { uid } from "../utils";
import { assertTenantStorageKey, sanitizeAttachmentFileName } from "./keys";
import type { UploadResult } from "./types";

async function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase storage not configured (missing SUPABASE_SERVICE_ROLE_KEY).");
  }
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key, { auth: { persistSession: false } });
}

function bucketOf(client: Awaited<ReturnType<typeof serviceClient>>) {
  return client.storage.from("announcement-attachments");
}

export async function uploadAnnouncementAttachmentSupabase(
  tenantId: string,
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<UploadResult> {
  const supabase = await serviceClient();
  const safe = sanitizeAttachmentFileName(fileName);
  const key = `${tenantId}/${Date.now()}-${uid("annatt")}-${safe}`;
  assertTenantStorageKey(tenantId, key);
  const res = await bucketOf(supabase).upload(key, buffer, {
    contentType: mimeType,
    cacheControl: "3600",
    upsert: false,
  });
  if (res.error) throw res.error;
  return { storageKey: key, sizeBytes: buffer.length };
}

export async function deleteAnnouncementAttachmentSupabase(storageKey: string): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return;
  }
  const supabase = await serviceClient();
  const res = await bucketOf(supabase).remove([storageKey]);
  if (res.error) throw res.error;
}

export async function downloadAnnouncementAttachmentSupabase(storageKey: string): Promise<Buffer> {
  const supabase = await serviceClient();
  const res = await bucketOf(supabase).download(storageKey);
  if (res.error || !res.data) {
    throw new Error(res.error?.message || "Ek indirilemedi.");
  }
  const ab = await res.data.arrayBuffer();
  return Buffer.from(ab);
}
