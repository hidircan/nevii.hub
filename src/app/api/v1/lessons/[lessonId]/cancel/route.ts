import { withApiHandler } from "@/lib/api/handler";
import { fail } from "@/lib/services/result";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/lessons/:lessonId/cancel — EMEKLİ (2026-10-16, owner). Ders iptali artık üretilmez: web'den #47 ile,
 * mobilden bu sürümle kaldırıldı. Uç nokta yalnız eski (yayımlanmamış dahili test) mobil derlemeleri için açık ve
 * anlaşılır bir ret döner; hiçbir şey yazmaz. Eski iptal kayıtları okunmaya devam eder (ders detayı/raporlar).
 * Mağazada herkese açık eski sürüm yok → minVersion yükseltmesi gerekmiyor (kimse kilitlenmez).
 */
const RETIRED =
  "Ders iptali kaldırıldı; yeni iptal kaydı oluşturulamaz. Ders yapılmadıysa yoklamadan Telafi veya İşlendi girin, saati değiştiyse dersi düzenleyin; ders hatalı oluşturulduysa web panelinde Ders Programı → \"Hatalı oluşturuldu — programdan sil\"i kullanın. Uygulamayı güncellediğinizde bu düğme görünmez.";

export const POST = withApiHandler(async () => fail("FORBIDDEN", RETIRED), { permission: "students:write" });
