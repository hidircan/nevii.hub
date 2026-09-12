/**
 * P1 (2026-09-11) — ders planı şablonları: güvenli placeholder sistemi.
 * SAF MODÜL (client + server ortak): hiçbir store/transport importu YOK —
 * şablon editör önizlemesi (`LessonPlanTemplatePreview`) ve server
 * (`communications/service.ts`) AYNI fonksiyondan beslenir.
 *
 * Desteklenen yer tutucular SADECE bunlar; bilinmeyen yer tutucu veya boş
 * değer GÖNDERİM ÖNCESİ validation hatası verir. Onaylanan gövde snapshot
 * olarak donar — sonraki şablon değişikliği geçmiş kaydı DEĞİŞTİRMEZ.
 */
export const LESSON_PLAN_TEMPLATE_PLACEHOLDERS = [
  "veliAdi",
  "ogrenciAdi",
  "ogretmenAdi",
  "dersAdi",
  "tarih",
  "saat",
  "sube",
  "kurum",
] as const;

export type LessonPlanTemplateVars = Record<(typeof LESSON_PLAN_TEMPLATE_PLACEHOLDERS)[number], string>;

export function renderLessonPlanTemplate(
  template: string,
  vars: Partial<Record<string, string>>
): { ok: true; body: string } | { ok: false; message: string } {
  const unknown = [...template.matchAll(/\{([a-zA-ZçÇğĞıİöÖşŞüÜ]+)\}/g)]
    .map((m) => m[1]!)
    .filter((name) => !(LESSON_PLAN_TEMPLATE_PLACEHOLDERS as readonly string[]).includes(name));
  if (unknown.length > 0) {
    return { ok: false, message: `Bilinmeyen yer tutucu: {${[...new Set(unknown)].join("}, {")}}. Desteklenenler: {${LESSON_PLAN_TEMPLATE_PLACEHOLDERS.join("}, {")}}.` };
  }
  const missing = (LESSON_PLAN_TEMPLATE_PLACEHOLDERS as readonly string[]).filter(
    (name) => template.includes(`{${name}}`) && !(vars[name] ?? "").trim()
  );
  if (missing.length > 0) {
    return { ok: false, message: `Şablon için gerekli değer eksik: {${missing.join("}, {")}}. Gönderim öncesi tamamlayın.` };
  }
  let body = template;
  for (const name of LESSON_PLAN_TEMPLATE_PLACEHOLDERS) {
    body = body.split(`{${name}}`).join((vars[name] ?? "").trim());
  }
  return { ok: true, body };
}

/** Ders planı bildirimi varsayılan gövdeleri (veli + öğretmen). */
export const LESSON_PLAN_PARENT_TEMPLATE =
  "Merhaba {veliAdi}, {kurum} — {ogrenciAdi} için ders planlandı: {dersAdi}, {tarih} {saat}, {sube} şubesi, öğretmen {ogretmenAdi}.";
export const LESSON_PLAN_TEACHER_TEMPLATE =
  "Merhaba {ogretmenAdi}, {kurum} — yeni ders planı: {ogrenciAdi}, {dersAdi}, {tarih} {saat}, {sube} şubesi.";

/** Editör etiketi için tek satırlık yer tutucu listesi. */
export const LESSON_PLAN_PLACEHOLDER_DOC = "{veliAdi}, {ogrenciAdi}, {ogretmenAdi}, {dersAdi}, {tarih}, {saat}, {sube}, {kurum}";

/** Önizleme için örnek değerler (gerçek veri DEĞİL — yalnızca şablon görüntüsü). */
export const LESSON_PLAN_PREVIEW_VARS: LessonPlanTemplateVars = {
  veliAdi: "Örnek Veli",
  ogrenciAdi: "Örnek Öğrenci",
  ogretmenAdi: "Örnek Öğretmen",
  dersAdi: "Piyano",
  tarih: "12 Eylül 2026",
  saat: "15:00",
  sube: "Merkez",
  kurum: "Örnek Kurum",
};
