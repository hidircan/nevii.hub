import type { IconName } from "../../components/ui";
import type { StudentProfile } from "../../types/api";

/**
 * Veli "Çocuğum" bağlam view-model'i — saf, test edilebilir dönüşüm.
 *
 * Kurallar:
 * - Ad yoksa `null` döner; ekran yanlış isim göstermeden empty state'e düşer.
 * - Yalnız portalın göstermesi gereken alanlar çıkarılır (ad, branş,
 *   öğretmen, paket, haftalık ders). Telefon, e-posta, internal ID,
 *   token/parola ASLA bu katmandan geçmez.
 * - Hızlı erişim hedefleri `app/(parent)` altındaki gerçek canonical
 *   route'lardır; liste kodu + testle kilitlidir (kırık navigasyon yok).
 */

export type ChildContextView = {
  name: string;
  /** Branş + öğretmen satırı (boş olabilir). */
  line1: string;
  /** Paket + haftalık ders satırı (boş olabilir). */
  line2: string;
};

export function toChildContextView(profile: StudentProfile | null | undefined): ChildContextView | null {
  const name = typeof profile?.name === "string" ? profile.name.trim() : "";
  if (!profile || !name) return null;
  const instruments = Array.isArray(profile.instruments) ? profile.instruments.filter(Boolean).join(", ") : "";
  const teacherName = typeof profile.teacherName === "string" ? profile.teacherName.trim() : "";
  const packageName = typeof profile.packageName === "string" ? profile.packageName.trim() : "";
  const weekly = Number.isFinite(profile.weeklyLessonCount) && profile.weeklyLessonCount > 0 ? profile.weeklyLessonCount : 0;
  return {
    name,
    line1: [instruments, teacherName].filter(Boolean).join(" · "),
    line2: packageName ? `${packageName} · haftada ${weekly} ders` : "",
  };
}

export type ParentQuickLink = {
  key: string;
  icon: IconName;
  label: string;
  hint: string;
  /** `app/(parent)` altındaki gerçek route segmenti. */
  href: string;
};

/** Canonical veli route'ları — `app/(parent)/` altında her biri mevcuttur. */
export const PARENT_QUICK_LINKS: ParentQuickLink[] = [
  { key: "dersler", icon: "calendar-outline", label: "Ders programı", hint: "Haftalık program ve ders detayları", href: "dersler" },
  { key: "odevler", icon: "book-outline", label: "Ödevler", hint: "Bekleyen ve tamamlanan ödevler", href: "odevler" },
  {
    key: "odemeler",
    icon: "card-outline",
    label: "Ödemeler",
    hint: "Bakiye ve ödeme geçmişi (salt görüntüleme)",
    href: "odemeler",
  },
  { key: "gelisim", icon: "trending-up-outline", label: "Gelişim", hint: "Müfredat, notlar ve materyaller", href: "gelisim" },
  { key: "yoklama", icon: "checkmark-circle-outline", label: "Yoklama özeti", hint: "Devam durumu", href: "yoklama" },
];
