import type { AnnouncementAttachment } from "@/lib/types";

export function AnnouncementAttachments({
  announcementId,
  attachments,
}: {
  announcementId: string;
  attachments?: AnnouncementAttachment[];
}) {
  if (!attachments?.length) return null;
  return (
    <ul className="mt-2 space-y-1">
      {attachments.map((att) => (
        <li key={att.id}>
          <a
            href={`/api/v1/announcements/${announcementId}/attachments/${att.id}/file`}
            className="text-xs font-medium text-[var(--color-primary)] hover:underline"
          >
            {att.fileName}
            {att.sizeBytes ? ` (${Math.max(1, Math.round(att.sizeBytes / 1024))} KB)` : ""}
          </a>
        </li>
      ))}
    </ul>
  );
}
