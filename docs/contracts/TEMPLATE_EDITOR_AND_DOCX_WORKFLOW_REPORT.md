# Şablon Düzenleme Deneyimi ve DOCX İş Akışı

## DURUM: Boş ekran hatası + aktif şablon güvenliği DÜZELTİLDİ; DOCX yükle/indir UYGULANDI ve derleme/testlerle doğrulandı

## 1. "Düzenle" boş ekran hatası

Önceki oturumda kök neden bulunup düzeltilmişti: `bodyHtml`,
`src/app/panel/evraklar/page.tsx`'te `<DocumentTemplateManager>`'a aktarılan
satır haritalamasından ÇIKARILIYORDU ve "Düzenle" tıklandığında
`setBodyHtml("")` çağrılıyordu — editör hep boş açılıyordu. Bu turda kod
tekrar okunarak doğrulandı: düzeltme hâlâ yerinde, `bodyHtml` artık hem
sayfa tarafında geçiriliyor hem "Düzenle" tıklandığında dolduruluyor
(`document-template-manager.tsx`). Aynı bileşen `student_enrollment_contract`
DAHİL tüm belge türleri için kullanıldığından, kayıt sözleşmesi şablonu da
dahil olmak üzere bu hata artık oluşmuyor.

**Bu tur ayrıca yeni, gerçek bir hata buldu ve düzeltti**: `PATCH
/api/v1/documents/templates/:id` (`updateDocumentTemplateTool`), hedef
şablon o an AKTİF olsa bile satırı YERİNDE değiştiriyordu — bu, "aktif
şablon asla yerinde düzenlenmez" kuralının ihlaliydi (bkz.
`docs/agent-memory/LESSONS_LEARNED.md`, 2026-08-30 kaydı). Düzeltme:
`document-template-manager.tsx` artık düzenlenen şablonun `active` durumunu
izliyor; aktif bir şablon düzenlenirse `onSubmit` PATCH yerine
create(active:false)+archive(active:false) sırasına yönleniyor — sonuç
her zaman YENİ bir taslak, mevcut aktif şablon değişmeden kalıyor. UI bunu
Türkçe açıkça belirtiyor ("Bu şablon şu anda aktif — yerinde
değiştirilmez...") ve gönder butonu "Yeni Taslak Sürüm Oluştur" olarak
değişiyor.

Aktif/Taslak/Arşiv rozetleri ve "Yeni formal sözleşmeler bu şablondan
oluşturulur." / "Bu şablon yeni sözleşmeler için kullanılmaz." açıklama
metinleri eklendi (önceki tur yalnızca "· Arşivlendi" ek metni gösteriyordu,
aktif durumun kendisi görsel olarak belirtilmiyordu).

## 2. Şablon adları — teknik ID sızıntısı kontrolü

`data/document-templates.json` içindeki gerçek veriler denetlendi: aktif
kayıt sözleşmesi şablonunun `name` alanı zaten "Öğrenci Kayıt Sözleşmesi
(kurumsal kaynaktan taslak — 30.08.2026)" gibi insan-okur bir metin —
`dtpl_...` teknik ID'si `document-template-manager.tsx`'te hiçbir yerde
birincil başlık olarak KULLANILMIYOR (yalnızca `key` prop'unda, DOM'a
yazılmaz). Bu madde zaten sağlanıyordu, ek değişiklik gerekmedi.

## 3. DOCX-öncelikli şablon iş akışı — UYGULANDI

Öncesi: repoda hiçbir DOCX/PDF kütüphanesi yoktu (`package.json` denetlendi,
sıfır eşleşme). Bu tur:

- **`mammoth` paketi eklendi** (`npm install mammoth`, `package.json`'a
  `^1.12.2` olarak işlendi) — .docx → HTML dönüşümü için endüstri
  standardı, hafif, sunucu tarafı kütüphane. Ek güvenlik açığı taşımıyor
  (`npm audit` — mammoth'un kendisi 0 yeni high/critical, mevcut
  prisma/deepmerge-ts uyarıları önceden vardı, bu değişiklikle ilgisiz).
- **Şema**: `DocumentTemplate` modeline (`prisma/schema.prisma`) 5 yeni
  nullable alan eklendi: `sourceFileData`, `sourceFileName`,
  `sourceMimeType`, `sourceUploadedAt`, `sourceUploadedById`. Additive,
  migration dosyası oluşturuldu
  (`prisma/migrations/20260830230000_document_template_docx_source/`) —
  **hiçbir veritabanına UYGULANMADI**. JSON/memory/DB üç mod için de aynı
  alanlar `src/lib/types.ts` (`DocumentTemplate` arayüzü) ve
  `src/lib/documents/index.ts` (`createTemplate`, `mapTplDb`, `publicTpl`)
  üzerinden mode-parity ile eklendi.
- **Yükleme** (`POST /api/v1/documents/templates/docx-upload` →
  `uploadDocumentTemplateDocxTool`): yalnızca SCHOOL_ADMIN/SUPER_ADMIN;
  yalnızca gerçek `.docx` (MIME +
  uzantı + magic-byte/ZIP-imza kontrolü — `checkFileMagicBytes`, mevcut
  paylaşılan güvenlik yardımcı fonksiyonu YENİDEN KULLANILDI, tekrar
  yazılmadı); 10MB üst sınır; orijinal dosya baytları DEĞİŞTİRİLMEDEN
  base64 olarak saklanır; `mammoth.convertToHtml` ile üretilen HTML
  `sanitizeTemplateHtml` ile temizlenip önizleme `bodyHtml` olarak yazılır;
  **her zaman `active:false` yeni TASLAK olarak oluşturulur — asla otomatik
  etkinleştirmez**; kayıt sözleşmesi türü için eksik zorunlu placeholder'lar
  (`findMissingRequiredContractPlaceholders`, mevcut fonksiyon yeniden
  kullanıldı) tespit edilip admin'e Türkçe listelenir.
- **İndirme** (`GET
  /api/v1/documents/templates/:templateId/source-file` →
  `getDocumentTemplateSourceFileTool`): yalnızca daha önce DOCX olarak
  yüklenmiş şablonlar için orijinal dosyayı AYNEN (bit-bit) geri döner;
  kaynak yoksa `NOT_FOUND` + "Bu şablon için DOCX kaynağı henüz
  yüklenmedi." — sahte/uydurma bir dosya ASLA üretilmez.
- **UI**: `document-template-manager.tsx`'e "DOCX Yükle" bölümü ve her
  şablon satırında (kaynağı varsa) "Word Dosyasını İndir" bağlantısı
  eklendi. Yükleme formu açıkça belirtir: "...otomatik etkinleştirilmez",
  "...biçimlendirmenin bire bir önizlemesi garanti edilmez; orijinal dosya
  değişmeden saklanır ve her zaman aynen indirilebilir."

## 4. .doc (eski format) — dürüst red

`uploadDocumentTemplateDocxTool`, `fileMimeType === "application/msword"`
veya dosya adı `.doc` ile bitiyorsa, hiçbir dönüşüm DENEMEDEN, istenen
BİREBİR metinle reddeder: *"Bu eski Word dosyasını önce .docx formatında
kaydedip tekrar yükleyin."* UI'da dosya seçici de yalnızca `.docx` kabul
eder (`accept=".docx,application/vnd.openxmlformats-officedocument..."`).

## 5. PDF kaynak olarak

Şablon kaynağı olarak PDF yükleme bu iş akışına DAHİL EDİLMEDİ (yalnızca
DOCX kabul edilir) — bu bilinçli bir karara dayanıyor: PDF'ten güvenilir,
düzenlenebilir HTML çıkarmak (mammoth'un yapmadığı bir iş) ayrı bir
kütüphane/karmaşıklık gerektirirdi ve "PDF düzenlenebilir kaynak
olabilirmiş gibi" yanlış bir izlenim yaratırdı — görev talimatı da bunu
açıkça yasaklıyor ("do not claim PDF is editable source template"). PDF'ler
zaten mevcut "Evraklar → Dosya Yükle" (Faz 8, Veri Aktarım Merkezi'ndeki
"Tarihi Sözleşme Aktarımı" dahil) akışı üzerinden arşiv/referans belgesi
olarak yüklenebiliyor — bu, önceki turda zaten kuruldu.

## 6. Ne DOĞRULANDI, ne DOĞRULANMADI

- `tsc --noEmit`, hedefli `eslint`, `next build` (yeni iki route
  `/api/v1/documents/templates/docx-upload` ve
  `/api/v1/documents/templates/[templateId]/source-file` derleme
  çıktısında görünüyor) — hepsi TEMİZ.
- Gerçek bir .docx dosyasıyla UÇTAN UCA (tarayıcıda yükle → mammoth
  çalıştır → taslak oluş → indir) manuel/tarayıcı testi bu turda
  YAPILMADI — ortamda gerçek bir tarayıcı (Playwright/Chrome) kurulamadı
  (bkz. `CONTRACT_PRINT_DESIGN_REPORT.md` §Kısıtlama). Kod yolu statik
  olarak doğru (tip kontrolü, mevcut yardımcı fonksiyonların yeniden
  kullanımı, build başarılı) ama gerçek bir .docx dosyasıyla canlı
  bir deneme henüz yapılmadı — bu, sahibinin/bir sonraki oturumun
  yapması gereken kısa bir manuel doğrulama adımıdır.

## 7. Kalan iş / P1

- Gerçek bir .docx dosyasıyla manuel uçtan uca deneme (yukarıda belirtildi).
- mammoth'un HTML çıktısının sanitize sonrası GÖRSEL kalitesi (tablo/liste
  yapısı ne kadar temiz geliyor) canlı bir örnekle henüz gözlemlenmedi.
