# Hukuki Metin Uyuşmazlığı Raporu — Telafi Süresi (2026-2027)

## DURUM: ÇÖZÜLDÜ (2026-08-29, aynı gün, sonraki oturum)

Sahibi bu raporun §7'sinde istenen kararı AÇIKÇA verdi ve tam metni sağladı:
"Telafi hakkı, telafiye konu olan dersin planlanan/orijinal tarihinden itibaren
30 (otuz) takvim günü içinde kullanılmalıdır. Bu süre içinde kullanılmayan
telafi hakkı geçerliliğini kaybeder." Bu metin hem kaynak `.md` dosyasına
(MADDE 8) hem aktif/taslak şablon gövdesine (`STUDENT_ENROLLMENT_CONTRACT_BODY`)
UYGULANDI — aşağıdaki bölümler artık TARİHSEL kayıt niteliğindedir.

**Ek bulgu ve düzeltme:** Mekanizma (`addDays(lesson.startAt, makeupWindowDays)`)
zaten doğruydu ama tenant'ın (`tenant_nilufer_acar`) GERÇEK `School.makeupWindowDays`
ayarı **14** idi, 30 DEĞİL — yani önceki oturumun "kod zaten 30 gün uyguluyor"
tespiti MEKANİZMA için doğruydu ama gerçek YAPILANDIRMA değerini doğrulamamıştı.
`scripts/set-makeup-window-30-days.ts` ile (mevcut `updateMakeupWindowDaysTool`,
audit'lenir) 30'a güncellendi — artık sözleşme metni VE sistem davranışı UYUMLU.
Yeni bir DRAFT (`dtpl_fy9artyvontl`) bu güncel metinle oluşturuldu, `active:false`,
otomatik aktifleştirilmedi (bkz. `2026_2027_CONTRACT_SOURCE_IMPLEMENTATION_REPORT.md`).

---

*(Aşağıdaki bölümler, çözümden ÖNCEKİ durumu belgeleyen orijinal rapordur — tarihsel referans için korunmuştur.)*

Bu rapor, sahibi tarafından 2026-08-29 tarihinde onaylanan NİHAİ operasyonel telafi
politikası ile `/2026-2027-ogrenci-kayit-sozlesmesi-v1.md` kaynak sözleşme metninin
MADDE 8'i arasındaki **çözülmemiş** bir çelişkiyi belgeler. Kaynak dosya bu görevde
**değiştirilmedi** — talimat gereği sessizce düzeltilmedi.

## 1. Kaynak madde (aynen)

> **MADDE 8 – TELAFİ DERSLERİ** (satır 90): "Telafi dersleri, iptalin gerçekleştiği
> ay içerisinde kullanılmalıdır. Kullanılmayan telafi hakları sonraki aylara
> devredilemez."

## 2. Sahibi onaylı operasyonel politika (nihai, bu görevde uygulandı)

> Telafi hakkı, orijinal kaçırılan ders tarihinden itibaren **30 takvim günü**
> içinde kullanılmalıdır. Süre admin onay tarihinden, talep oluşturma
> tarihinden, sözleşme/ödeme tarihinden veya ay sonundan DEĞİL, orijinal ders
> tarihinden başlar.

## 3. Çelişkinin somut etkisi

İki kural MATEMATİKSEL olarak FARKLI sonuçlar üretir:

| Orijinal ders tarihi | Kaynak metin ("ay içinde") | Onaylı politika ("30 gün") |
| --- | --- | --- |
| 3 Eylül 2026 | 30 Eylül 2026'ya kadar (~27 gün) | 3 Ekim 2026'ya kadar (30 gün) |
| 28 Eylül 2026 | 30 Eylül 2026'ya kadar (~2 gün) | 28 Ekim 2026'ya kadar (30 gün) |

Ayın sonuna yakın kaçırılan derslerde kaynak metin **onaylı politikadan çok daha
DAR** bir pencere verir — yani mevcut kod (30 gün, `src/lib/store-json.ts`,
`store-memory.ts`, `store-db.ts` — `expiresAt: addDays(lesson.startAt, ...)`)
öğrenciye kaynak sözleşme metninin izin verdiğinden **DAHA FAZLA** süre
tanıyabilir bazı senaryolarda.

## 4. Uygulanan davranış (bu görev)

- Kod, sahibi onaylı **30 takvim günü, orijinal ders tarihinden** kuralını
  uygulamaya devam ediyor — `src/lib/makeup-quota.ts`, `store-json.ts`,
  `store-memory.ts`, `store-db.ts` içindeki mevcut mekanizma (önceki bir
  oturumda kurulmuştu) **korundu, yeniden yazılmadı**.
- Kaynak dosya (`2026-2027-ogrenci-kayit-sozlesmesi-v1.md`) **değiştirilmedi**.
- Aktif sözleşme şablonunun gövde metni (MADDE 8 paragrafı) hâlâ kaynağın
  ORİJİNAL "ay içerisinde" ifadesini birebir içeriyor (`STUDENT_ENROLLMENT_CONTRACT_BODY`,
  `src/lib/documents/index.ts`) — bu, hukuki metin ile operasyonel/yazılım
  davranışı arasında bir **tutarsızlık** yaratıyor: sözleşmeyi imzalayan
  veli/öğrenci "ay içinde" okuyacak, sistem "30 gün" uygulayacak.

## 5. Şablon aktivasyonu üzerindeki etki

**Yeni 2026-2027 taslak şablonu (`dtpl_nq8gbjawojm3`, bkz.
`ACTIVE_TEMPLATE_RECOVERY_REPORT.md`) bu uyuşmazlık ÇÖZÜLMEDEN aktifleştirilmemelidir.**

Aktivasyon ekranı (Panel → Evraklar → Sözleşme Şablonları → "Şablonu
Aktifleştir") şu anda bu belirli hukuki tutarsızlığı OTOMATİK OLARAK
saptamıyor/göstermiyor — bu, ayrı bir P1 iş kalemi olarak işaretleniyor (bkz.
§7). Yetkili personel, aktivasyondan ÖNCE bu raporu ve
`docs/roadmap/NEVIIHUB_ADMIN_CONTRACTS_POLICY_REMAINING_WORK.md` §"Sahibi/hukuk
kararı bekleyenler" maddesini gözden geçirmelidir.

## 6. Gerekli kaynak/şablon metni güncellemesi (sahibi/hukuk onayı bekliyor)

Önerilen (UYGULANMADI — yalnızca öneri, hukuki metin bu görevde SESSİZCE
değiştirilmedi):

> "Telafi dersleri, orijinal kaçırılan ders tarihinden itibaren 30 (otuz)
> takvim günü içinde kullanılmalıdır. Kullanılmayan telafi hakları bu sürenin
> sonunda kendiliğinden sona erer."

Bu metin değişikliği ancak kurum sahibi/hukuk danışmanı onayladıktan sonra
kaynak `.md` dosyasına VE aktif/taslak şablon gövdesine (MADDE 8 paragrafı)
uygulanmalıdır — ikisi de bu görevde dokunulmadı.

## 7. Gerekli sahibi/hukuk aksiyonu

1. Kaynak sözleşme metninin (MADDE 8) "30 gün" kuralını yansıtacak şekilde
   güncellenmesini onaylamak (veya tersine, operasyonel politikanın "ay içinde"
   kuralına çekilmesini tercih etmek — iki yönde de nihai karar sahibe aittir).
2. Onaylanan nihai metin netleşince: (a) kaynak `.md` dosyası güncellenir, (b)
   aktif/taslak şablon gövdesi güncellenir, (c) yeni bir DRAFT oluşturulup
   ayrıca aktifleştirilir (mevcut draft/activate güvenli akışı kullanılarak,
   otomatik aktivasyon YAPILMADAN).
3. Aktivasyon ekranına bu tür metin/politika tutarsızlıklarını YAPISAL olarak
   yakalayan bir kontrol eklenmesi (P1, bu raporun kapsamı dışında —
   `docs/roadmap/NEVIIHUB_ADMIN_CONTRACTS_POLICY_REMAINING_WORK.md`'ye
   eklendi).

## 8. Kesin doğrulamalar

- Kaynak `.md` dosyası bu görevde DEĞİŞTİRİLMEDİ.
- Hiçbir şablon otomatik aktifleştirilmedi.
- Kod davranışı (30 gün) SESSİZCE değiştirilmedi — sahibi onayı zaten bu yönde
  (bkz. görev talimatı §2.B).
