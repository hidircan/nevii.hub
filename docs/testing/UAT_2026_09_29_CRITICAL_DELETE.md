# UAT — 2026-09-29 güvenli silme standardı + ders planlama tarih çökmesi

## Kök neden (tarih çökmesi)
- Ekran: **Ders Programı → Tekrarlayan ders oluştur / Ders planla**. Kampanya formu DEĞİL (orada yeniden üretilemedi).
- Tarih alanında yıl yazılırken tarayıcı değeri `0002-10-15` olur. `seriesFirstDate` bunu `toYmd()` ile
  `"2-10-17"` yaptı (yıl 4 haneye doldurulmuyordu) → render sırasında `format(parseISO("2-10-17T12:00"))` →
  `RangeError: Invalid time value` → panel hata sınırı. Tek seferlik planlayıcıda aynı desen
  (`format(parseISO(startAt.slice(0,10)…))`, 5+ haneli yılda).
- Düzeltme: `isCompleteDateOnlyInput` (gerçek takvim günü, yıl 1900–2100) tamamlanmadan gün hesabı, müsaitlik
  isteği ve formatlama yapılmaz; alan altında Türkçe uyarı. `toYmd` yılı 4 haneye doldurur. Önizleme/kaydet
  tamamlanmamış veya ters sıralı aralığı sunucuya göndermez.

## Silme standardı (sunucuda `guardCriticalDelete`: rol SUPER_ADMIN/SCHOOL_ADMIN + kritik şifre + ≥5 karakter gerekçe)
| Eylem | Durum | Not |
|---|---|---|
| Öğrenci sil / toplu sil / statülü ders tamamen sil / paket sil / iş sil | Korunuyordu | değişmedi |
| Ders "Programdan sil" | **Düzeltildi** | şifre + gerekçe zorunlu |
| Oda "Sil" | **Düzeltildi** | `window.confirm` → kritik diyalog |
| Deneme dersi "Sil" (hard delete) | **Düzeltildi** | yalnız sahip/yönetici; öğretmen/şube müdürü artık silemez (arşivleyebilir) |
| Evrak imzalı sürüm "Kaldır" | **Düzeltildi** | güncel sürümde dosya içeriği kaldırılır (mevcut tasarım) — bkz. açık konular |
| AI hafıza "Sil" | **Düzeltildi** | onaysız tek tıktı |
| İK aday "Kişisel veriyi sil" (KVKK) | **Düzeltildi** | otomatik saklama taraması aynen |
| Kampanya "Sil" | **Yeni** | soft delete (`deletedAt`), pasif; geçmiş ücret/rapor korunur |
| Evrak "Sil" | **Yeni** | yalnız arşivlenmiş + sözleşmeye bağlı olmayan; `status=deleted`, dosya DB'de kalır |
| İş yorumu/eki "Kaldır", checklist arşivle, kayıtlı liste görünümü sil, profil fotoğrafı, çalışma günü istisnası kaldır, form satırı sil | İstisna | kişisel/tercih/yapılandırma içeriği, kayıt silme değil |
| Platform (HYPER_ADMIN) kullanıcı "Kalıcı sil (yalnız taslak)", platform paket satırı | İstisna | kurum kritik şifresi platform kapsamına uygulanamaz; ayrı karar |

## Site UAT (test.neviihub.com) — sırayla
1. Ders Programı → Tekrarlayan ders oluştur → şube+öğrenci seç → Başlangıç tarihinde yıla yalnız "2" yaz: sayfa
   çökmez, alan altında "Tarih henüz tamamlanmadı…" uyarısı; yılı 2026 tamamla → uyarı kalkar, müsaitlik kartı gelir.
2. Aynısını Ders planla (tek seferlik) tarih/saat alanında dene; bitişi başlangıçtan önce seç → "Önizle" Türkçe hata.
3. Ayarlar → Güvenlik'te kritik işlem şifresi tanımlı olduğunu doğrula.
4. Paketler → Kampanyalar → kendi oluşturduğun test kampanyasında Sil → etki özeti (kayıtlı öğrenci sayısı) →
   yanlış şifre → "şifre yanlış" mesajı, kampanya duruyor → doğru şifre + gerekçe → liste dışı; Durum = Silinmiş
   filtresinde "Silindi" + gerekçe. Yeni öğrenci formunda bu kampanya görünmüyor.
5. Kampanyası olan eski bir öğrencinin ücreti/ödemeleri değişmedi (yalnız bak, silme yapma).
6. Evraklar → test evrakı aç → Sil → "önce arşivleyin" → Arşivle → Arşivlenen listede Sil → şifre+gerekçe →
   satır kalkar, detay "Evrak bulunamadı". Sözleşme nüshasında Sil'in engellendiğini gör.
7. Odalar (pasif test odası) / Deneme dersleri (test kaydı) / ders "Programdan sil": hepsi şifre+gerekçe ister.
8. Kurum yöneticisi olmayan (şube müdürü/öğretmen) hesapla: deneme ve evrak satırlarında Sil görünmez.
