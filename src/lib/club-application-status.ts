/** 2026-10-07 — Grup dersi başvurusu durumları (saf; istemci bileşenleri de içe aktarır). */
export type ClubApplicationStatus = "new" | "contacted" | "waitlisted" | "added" | "declined" | "withdrawn";
export const CLUB_APPLICATION_STATUSES: ClubApplicationStatus[] = ["new", "contacted", "waitlisted", "added", "declined", "withdrawn"];
export const CLUB_APPLICATION_STATUS_LABEL: Record<ClubApplicationStatus, string> = {
  new: "Yeni",
  contacted: "İletişime geçildi",
  waitlisted: "Bekleme listesi",
  added: "Kulübe eklendi",
  declined: "Reddedildi",
  withdrawn: "Vazgeçti",
};
