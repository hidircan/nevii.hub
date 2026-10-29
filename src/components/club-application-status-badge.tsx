import { CLUB_APPLICATION_STATUS_LABEL, type ClubApplicationStatus } from "@/lib/club-application-status";

const STATUS_TONE: Record<ClubApplicationStatus, [string, string]> = {
  new: ["var(--color-primary-soft)", "var(--color-primary-soft-text)"],
  contacted: ["var(--color-info-soft)", "var(--color-info)"],
  waitlisted: ["var(--color-warning-soft)", "var(--color-warning)"],
  added: ["var(--color-success-soft)", "var(--color-success)"],
  declined: ["var(--color-surface-muted)", "var(--color-text-muted)"],
  withdrawn: ["var(--color-surface-muted)", "var(--color-text-muted)"],
};

/** Grup dersi başvurusu durum rozeti. */
export function ClubApplicationStatusBadge({ status }: { status: ClubApplicationStatus }) {
  const [bg, fg] = STATUS_TONE[status];
  return (
    <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: bg, color: fg }}>
      {CLUB_APPLICATION_STATUS_LABEL[status]}
    </span>
  );
}

