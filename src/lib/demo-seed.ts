/**
 * Demo/QA seed yazımlarının ORTAK sözleşmesi.
 *
 * NEDEN VAR: demo senaryoları, üretim akışlarının BİLEREK reddettiği iki kaydı
 * üretmek zorunda — (1) GEÇMİŞ tarihli ders (`validateLessonSlot` PAST_START
 * ile reddeder) ve (2) slot/expiry akışından geçmeden "karara bağlanmış" telafi
 * talebi (`confirmMakeupSlot` AFTER_EXPIRY ile reddeder; önceki dönemde kalan
 * Öğrenci C senaryosu bu yüzden gerçek akışla üretilemez).
 *
 * Bu kısıtlar GERÇEK kullanıcı hatalarını önleyen değerli korumalardır ve
 * GEVŞETİLMEZ. Bunun yerine seed'ler bu dar, demo'ya özel kapıdan geçer.
 *
 * ÖNEMLİ: bu kapı `store.ts` soyutlamasının parçasıdır — üç backend'in
 * (json/memory/db) hepsi uygular, yani `STORE_MODE` ne olursa olsun kayıtlar
 * AKTİF store'a gider. Daha önce seed script'leri `store-json`'ı doğrudan
 * import ediyordu; `STORE_MODE=db` altında bu, dersleri JSON dosyasına,
 * telafi taleplerini PostgreSQL'e yazarak veriyi ikiye bölüyordu.
 *
 * Uygulama (runtime) kodundan ASLA çağrılmaz; yalnız `scripts/seed-*.ts`.
 */
import { uid } from "./utils";
import type { AppData, Lesson, MakeupStatus } from "./types";

/** `id` store tarafından üretilir — çağıran veremez. */
export type DemoLessonInput = Omit<Lesson, "id">;

export type DemoMakeupDecisionInput = {
  requestId: string;
  status: Extract<MakeupStatus, "confirmed" | "cancelled">;
  decidedBy: string;
  decisionNote?: string;
};

export type DemoSeedInput = {
  lessons?: DemoLessonInput[];
  makeupDecisions?: DemoMakeupDecisionInput[];
};

/** Store API'nin döndürdüğü sonuç — çağıranın ihtiyacı yalnız yeni ders id'leri.
 *  AppData DÖNDÜRÜLMEZ: db modunda her seed çağrısından sonra tam graf okumak
 *  gereksiz pahalıydı (tek seed koşusunda 13+ tam okuma). */
export type DemoSeedResult = { lessonIds: string[] };

/** json/memory saf uygulamasının iç sonucu (yazılacak veriyi de taşır). */
export type DemoSeedApplied = { data: AppData; lessonIds: string[] };

/**
 * Fail-closed production guard. Seed script'lerinin kendi guard'ı zaten var;
 * bu ikinci kapı, store katmanına yanlışlıkla başka bir yerden çağrı
 * gelirse de production'ın korunmasını sağlar (savunma derinliği).
 */
export function assertDemoSeedAllowed(): void {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    throw new Error(
      "Demo seed yazımı PRODUCTION ortamında çalıştırılamaz (NODE_ENV/VERCEL_ENV=production)."
    );
  }
}

export function newDemoLessonId(): string {
  return uid("les");
}

/**
 * json ve memory backend'lerinin paylaştığı saf uygulama (I/O yok).
 * `decidedAt` çağrı anında damgalanır; `db` backend'i de aynı alanları yazar.
 */
export function applyDemoSeedRecords(data: AppData, input: DemoSeedInput): DemoSeedApplied {
  const lessonIds: string[] = [];
  const addedLessons: Lesson[] = (input.lessons ?? []).map((l) => {
    const lesson: Lesson = { ...l, id: newDemoLessonId() };
    lessonIds.push(lesson.id);
    return lesson;
  });

  const decisions = input.makeupDecisions ?? [];
  for (const d of decisions) {
    if (!data.makeupRequests.some((m) => m.id === d.requestId)) {
      throw new Error(`Telafi talebi bulunamadı: ${d.requestId}`);
    }
  }
  const byRequestId = new Map(decisions.map((d) => [d.requestId, d]));
  const decidedAt = new Date().toISOString();
  const makeupRequests = data.makeupRequests.map((m) => {
    const d = byRequestId.get(m.id);
    if (!d) return m;
    return {
      ...m,
      status: d.status,
      decidedBy: d.decidedBy,
      decidedAt,
      decisionNote: d.decisionNote,
    };
  });

  return {
    data: { ...data, lessons: [...data.lessons, ...addedLessons], makeupRequests },
    lessonIds,
  };
}
