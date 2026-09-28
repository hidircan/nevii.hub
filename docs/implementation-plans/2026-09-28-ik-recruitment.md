# İK / İşe Alım Modülü — Tasarım ve Uygulama Planı (2026-09-28)

Dal: `feat/ik-recruitment` (worktree `.claude/worktrees/ik-recruitment`), taban `feat/uat-round-11` @ `1691ee4`.
Owner kararları (2026-09-28): ayrı worktree · CV okuma hibrit (kural + AI varsa) · ilk teslimatta görüşme/deneme dersi
planlama, değerlendirme puan kartı, işe alınanı Öğretmen/Personel'e aktarma, KVKK onayı + saklama süresi ·
migration hazırlanır, test DB'ye **owner onayıyla** uygulanır.

## 1. Akış
1. Kurum LinkedIn / Kariyer.net ilanında `https://<alan>/kariyer/<kurum-slug>/<ilan-slug>?kaynak=linkedin` bağlantısını paylaşır.
2. Aday kariyer sayfasında pozisyon bilgisini okur, CV (PDF/DOCX, ≤4 MB) yükler → alanlar CV'den otomatik dolar
   (kural tabanlı çıkarım her zaman; AI sağlayıcısı yapılandırılmışsa AI ile zenginleştirilir), eksikleri tamamlar,
   KVKK aydınlatma/açık rıza onayı verir, gönderir.
3. Adaya "başvurunuz alındı" e-postası (şablon `received`), yöneticilere uygulama içi bildirim
   (`recruitment_new_application`) + ayarlarda tanımlı adreslere e-posta.
4. Yönetici `/panel/ik` altında aday havuzunu filtreler (tür, ilan, aşama, enstrüman, deneyim, eğitim, şehir, kaynak,
   puan, etiket, tarih), aşama değiştirir, not düşer, görüşme / deneme dersi planlar (davet e-postası), puan kartı doldurur,
   olumlu/olumsuz şablon e-postası gönderir (tekil/toplu), filtrelenmiş listeyi yazdırır / PDF kaydeder / CSV indirir.
5. İşe alınan aday tek tıkla Öğretmen veya Personel kaydına aktarılır (mevcut `createTeacherTool` / `createStaffMemberTool`).
6. KVKK: saklama süresi (varsayılan 12 ay) dolan ve işe alınmamış başvurular anonimleştirilir (CV silinir, kişisel alanlar
   temizlenir, istatistik kalır). Tekil anonimleştirme panelden de yapılabilir.

## 2. Aşama hattı
`new` Yeni → `screening` Ön eleme → `interview` Görüşme → `demo_lesson` Deneme dersi → `offer` Teklif → `hired` İşe alındı;
yan çıkışlar `rejected` Olumsuz, `withdrawn` Aday çekildi, `talent_pool` Yetenek havuzu (ileride değerlendirilecek).

## 3. Veri modeli (additive migration `20260928150000_recruitment`)
| Model | Amaç |
|---|---|
| `RecruitmentJob` | İlan: slug (tenant içinde tekil), başlık, tür (teacher/staff), enstrümanlar, şube, çalışma şekli, konum, özet, açıklama, aranan nitelikler, sunulanlar, durum (draft/published/closed/archived), kapanış tarihi |
| `RecruitmentApplication` | Aday+başvuru: numara (IK-000123), ilan (null = genel başvuru), aşama, kişisel/iletişim, enstrümanlar, deneyim yılı, öğretmenlik deneyimi, eğitim, beceriler, diller, müsaitlik, bağlantılar, ön yazı, kaynak/UTM, etiketler, puan ortalaması, CV dosya kimliği, CV ayrıştırma çıktısı, KVKK onay zamanı/metin sürümü, saklama bitişi, anonimleştirme, aktarılan öğretmen/personel kimliği |
| `RecruitmentFile` | CV baytları (DB `bytea`; test ortamında ek bucket kurulumu gerektirmez) |
| `RecruitmentActivity` | Zaman çizelgesi: not, aşama değişimi, e-posta, görüşme, değerlendirme, sistem |
| `RecruitmentInterview` | Görüşme / deneme dersi / telefon: tarih-saat, süre, yer/bağlantı, görüşmeciler, durum, davet gönderildi mi |
| `RecruitmentEvaluation` | Puan kartı: kriter başına 1–5, genel puan, öneri (kesin evet…kesin hayır), yorum |
| `RecruitmentEmailTemplate` | Kurum şablonları (alındı / olumlu / olumsuz / görüşme daveti / özel), yer tutucular |
| `RecruitmentSettings` | Kariyer sayfası açık mı, tanıtım metni, KVKK metni, bildirim açık/kapalı + e-posta listesi, otomatik alındı e-postası, saklama süresi, puan kartı kriterleri |

Store paritesi: modül kendi deposunu taşır (`src/lib/recruitment/store.ts`) — `email-templates/store.ts` ile aynı desen:
`STORE_MODE=db` → Prisma; json/memory → `data/recruitment.json` (anahtarlı kilit ile). Tüm okuma/yazma `tenantId` ile.

## 4. Katmanlar ve dosyalar
- `src/lib/recruitment/` — `types.ts`, `constants.ts` (aşama/kaynak/etiket kataloğu), `store.ts`, `cv-parser.ts`
  (PDF: `unpdf`, DOCX: `mammoth`; kural çıkarımı + opsiyonel AI), `emails.ts` (render + gönderim + log),
  `filters.ts` (saf filtre/sıralama — panel, yazdırma ve CSV aynı fonksiyonu kullanır), `tools.ts` (RBAC'li servis
  araçları, `ServiceResult`), `public.ts` (kurum çözümleme + herkese açık okuma/başvuru), `retention.ts`.
- Herkese açık: `src/app/kariyer/[kurum]/page.tsx`, `src/app/kariyer/[kurum]/[ilan]/page.tsx`;
  API `src/app/api/kariyer/[kurum]/cv-oku/route.ts`, `src/app/api/kariyer/[kurum]/basvuru/route.ts` (multipart,
  honeypot, IP başına hız sınırı, MIME + sihirli bayt kontrolü, 4 MB sınır).
- Panel: `src/app/panel/ik/` → `page.tsx` (özet), `ilanlar/` (liste, yeni, düzenle), `adaylar/` (havuz + pano görünümü),
  `adaylar/[id]/` (aday kartı), `sablonlar/`, `ayarlar/`; yazdırma `src/app/ik-aday-dokum/page.tsx`;
  CV indirme `src/app/api/panel/ik/cv/[id]/route.ts`; CSV `src/app/api/panel/ik/export/route.ts`.
- Menü: `PANEL_OPS_NAV` → "İnsan Kaynakları" (SUPER_ADMIN, SCHOOL_ADMIN).
- Bildirim kategorisi: `recruitment_new_application` (grup `staff`).

## 5. RBAC / güvenlik
- Panel araçları yalnız `SCHOOL_ADMIN` / `SUPER_ADMIN`; her sorgu `ctx.tenantId`.
- Herkese açık uçlar yalnız `published` ilanları ve kariyer sayfası açık kurumları gösterir; tenantId istemciden alınmaz,
  slug'dan sunucuda çözülür.
- CV yalnız oturumlu yönetici tarafından, tenant eşleşmesiyle indirilebilir.
- E-posta: SMTP yoksa gönderim "gönderilemedi (SMTP yapılandırılmamış)" olarak dürüstçe loglanır — sahte başarı yok.
- Denetim kaydı: ilan yayınlama, aşama değişimi, toplu e-posta, aktarma, anonimleştirme.

## 6. Kapsam dışı (sonraki tur)
Takvim entegrasyonu (Google/Outlook), aday self-servis portalı, çok dilli kariyer sayfası, LinkedIn/Kariyer.net API
ile otomatik ilan yayını, e-imzalı teklif mektubu.

## 7. Doğrulama
Hedef testler `src/lib/__tests__/recruitment-*.test.ts` (filtre, CV ayrıştırma, store json, araç RBAC, başvuru akışı,
e-posta render, anonimleştirme) → typecheck → lint → test → prisma validate → build.
