/**
 * Paket editörü modül kılavuzu — ürün yeteneklerinin satış görünümü.
 * Şema değiştirmez; katalog modül anahtarlarına sunum katmanı ekler.
 *
 * Dürüstlük kuralları:
 * - `requires`: YALNIZ kodda doğrulanmış zorunlu bağımlılık. Bugün boştur
 *   (doğrulama: 2026-10 — `assertFeatureEnabled`/kaynak eşleşmelerinde
 *   bayraklar-arası zorunluluk bulunamadı). Mekanizma hazır, veri uydurulmadı.
 * - `enforcedBackend`: `assertFeatureEnabled` ile gerçekten denetlenen
 *   bayraklar (tools.ts: homework, teacherFeedback, tasks, payments,
 *   announcements). Diğerleri için paket onayı erişimi teknik olarak
 *   kapatmaz — editörde açıkça işaretlenir (aşırı satış engeli).
 * - `status: "kurulum"`: bayrak açık olsa bile sağlayıcı anahtarı olmadan
 *   çalışmaz (INTEGRATION_CATALOG ile doğrulanabilir).
 */

export type ModuleStatus = "hazır" | "kurulum";

export type ModuleGuideEntry = {
  category: string;
  /** Müşteri faydası — tek cümle, katalog açıklamasına dayalı. */
  benefit: string;
  status: ModuleStatus;
  statusNote?: string;
  /** Kodda doğrulanmış zorunlu bağımlılıklar (modül anahtarı). */
  requires: string[];
  /** Nerede etki eder (bilinen yüzeyler). */
  etki: string[];
  /** Backend API denetimi var mı (assertFeatureEnabled)? */
  enforcedBackend: boolean;
};

const E = (e: Omit<ModuleGuideEntry, "requires" | "enforcedBackend"> & { requires?: string[]; enforcedBackend?: boolean }): ModuleGuideEntry => ({
  requires: [],
  enforcedBackend: false,
  ...e,
});

export const MODULE_GUIDE: Record<string, ModuleGuideEntry> = {
  homework: E({ category: "Eğitim", benefit: "Öğretmen ödev verir, öğrenci teslim eder, rapor alınır.", status: "hazır", etki: ["Web paneli"], enforcedBackend: true }),
  curriculum: E({ category: "Eğitim", benefit: "Konu ilerlemesi sınıflara göre izlenir.", status: "hazır", etki: ["Web paneli"] }),
  studentFeedback: E({ category: "Eğitim", benefit: "Öğretmen öğrenciyi dönemsel olarak değerlendirir.", status: "hazır", etki: ["Web paneli"] }),
  teacherFeedback: E({ category: "Eğitim", benefit: "Öğrenci öğretmenini değerlendirir.", status: "hazır", etki: ["Web paneli"], enforcedBackend: true }),
  teacherPerformanceV2: E({ category: "Eğitim", benefit: "Öğretmen performansı yeni metriklerle ölçülür.", status: "hazır", etki: ["Web paneli"] }),
  payments: E({ category: "Finans ve tahsilat", benefit: "Öğrenci ödemeleri kaydedilir ve takip edilir.", status: "hazır", etki: ["Web paneli"], enforcedBackend: true }),
  collections: E({ category: "Finans ve tahsilat", benefit: "Geciken tahsilatlar kuyrukta toplanır, hatırlatma taslağı çıkar.", status: "hazır", etki: ["Web paneli"] }),
  teacherPayouts: E({ category: "Finans ve tahsilat", benefit: "Öğretmen hakedişleri hesaplanır ve ödenir.", status: "hazır", etki: ["Web paneli"] }),
  announcements: E({ category: "İletişim", benefit: "Kurum duyuruları yayınlanır.", status: "hazır", etki: ["Web paneli"], enforcedBackend: true }),
  crm: E({ category: "İletişim", benefit: "Arama ve mesaj geçmişi tek yerde tutulur.", status: "hazır", etki: ["Web paneli"] }),
  whatsapp: E({ category: "İletişim", benefit: "WhatsApp üzerinden bireysel ve toplu mesaj gönderilir.", status: "kurulum", statusNote: "WhatsApp Cloud bağlantısı gerekli (Entegrasyonlar).", etki: ["Web paneli"] }),
  sms: E({ category: "İletişim", benefit: "SMS ile bilgilendirme ve hatırlatma gönderilir.", status: "kurulum", statusNote: "Netgsm veya Twilio bağlantısı gerekli (Entegrasyonlar).", etki: ["Web paneli"] }),
  parentPortal: E({ category: "Portallar", benefit: "Veli çocuğunun durumunu kendi girişinden görür.", status: "hazır", etki: ["Veli girişi"] }),
  studentPortal: E({ category: "Portallar", benefit: "Öğrenci ödev ve programına kendi girişinden erişir.", status: "hazır", etki: ["Öğrenci girişi"] }),
  mobileApp: E({ category: "Portallar", benefit: "Kurum uygulamaya telefondan erişir.", status: "hazır", statusNote: "Mağaza yayını ayrı yönetilir (Site ayarları).", etki: ["Mobil uygulama"] }),
  tasks: E({ category: "Verimlilik", benefit: "Görevler atanır ve hatırlatılır.", status: "hazır", etki: ["Web paneli"], enforcedBackend: true }),
  documents: E({ category: "Verimlilik", benefit: "Belge şablonları hazırlanır, imzalı evrak yüklenir.", status: "hazır", etki: ["Web paneli"] }),
  aiAssistant: E({ category: "Yapay zekâ", benefit: "Sohbet asistanı soruları yanıtlar, günlük işleri hızlandırır.", status: "kurulum", statusNote: "Gemini veya Groq anahtarı gerekli (Entegrasyonlar).", etki: ["Web paneli", "Sohbet"] }),
};

export const MODULE_GUIDE_FALLBACK: ModuleGuideEntry = {
  category: "Diğer",
  benefit: "",
  status: "hazır",
  requires: [],
  etki: ["Web paneli"],
  enforcedBackend: false,
};

export function guideFor(moduleKey: string): ModuleGuideEntry {
  return MODULE_GUIDE[moduleKey] ?? MODULE_GUIDE_FALLBACK;
}

/**
 * Seçili modüllerin zorunlu bağımlılıklarını denetler; eksikler için
 * kullanıcıya gösterilecek uyarıları döner (boş = sorun yok).
 */
export function checkModuleDeps(selected: string[], guide: Record<string, ModuleGuideEntry> = MODULE_GUIDE): string[] {
  const set = new Set(selected);
  const warnings: string[] = [];
  for (const key of selected) {
    for (const req of guide[key]?.requires ?? []) {
      if (!set.has(req)) warnings.push(`“${key}” için “${req}” de seçilmeli; aksi hâlde bu kombinasyon çalışmaz.`);
    }
  }
  return warnings;
}
