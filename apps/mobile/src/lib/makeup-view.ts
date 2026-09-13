import type { BadgeTone } from "../components/ui/status-badge";
import type { MakeupRequest } from "../types/api";

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "Bekliyor", tone: "warning" },
  suggested: { label: "Öneri var", tone: "info" },
  awaiting_info: { label: "Bilgi bekleniyor", tone: "warning" },
  confirmed: { label: "Onaylandı", tone: "success" },
  completed: { label: "Tamamlandı", tone: "neutral" },
  expired: { label: "Süresi doldu", tone: "neutral" },
  cancelled: { label: "İptal edildi", tone: "neutral" },
};

const CLOSED = new Set(["completed", "expired", "cancelled"]);

/** Durum etiketi yalnız sunucunun domain statüsünden; bilinmeyen statü olduğu gibi gösterilir (uydurma yok). */
export function makeupStatusBadge(status: string): { label: string; tone: BadgeTone } {
  return STATUS[status] ?? { label: status, tone: "neutral" };
}

/**
 * Öğretmen telafi listesi. Kapsam sunucuda uygulanır; bu filtre ek savunmadır —
 * oturumdaki öğretmene ait olmayan kayıt UI'ya girmez. Açık kayıtlar önce, sonra en yeni.
 */
export function teacherMakeupItems(list: MakeupRequest[], teacherId: string | undefined): MakeupRequest[] {
  if (!teacherId) return [];
  return list
    .filter((m) => m.teacherId === teacherId)
    .sort((a, b) => Number(CLOSED.has(a.status)) - Number(CLOSED.has(b.status)) || b.createdAt.localeCompare(a.createdAt));
}
