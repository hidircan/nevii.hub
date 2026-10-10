---
title: "Sözleşme Revize Akışı (amendment) — Teslim Raporu"
date: "2026-09-28"
branch: "feat/uat-round-10"
worktree: "canonical (worktree KULLANILMADI)"
---

# Sözleşme Revize Akışı (`amendment`) — Teslim Raporu

10. tur iş #4. Güncel sözleşmenin hatalı/eksik alanlarını düzeltmek için
**yeni bir `amendment` sürümü** üreten uçtan uca akış: satırda "Revize et"
aksiyonu → önceki sözleşmenin TÜM değerleriyle ön-doldurulmuş form → canlı
"Değişiklik özeti" (eski → yeni) + zorunlu revizyon gerekçesi → ödeme planı
önizlemesi → onayda yeni sürüm. Önceki sürüm `superseded` olarak DEĞİŞMEDEN
arşivde kalır; yerinde mutasyon YOKTUR.

## 1. Etkilenen finansal / hukuki kurallar

- **Tarihsel kayıtlar mutasyona uğramaz** (yerleşik kural, korundu):
  revizyon yeni `StudentContract` satırı + yeni `DocumentInstance` üretir;
  önceki sürümün snapshot'ı, belgesi ve taksit kayıtları aynen durur
  (`contract-amendment.test.ts`: snapshot deep-equal, belge kimliği değişmedi).
- **Borçsuz revizyon kuralı** (yenilemeyle AYNI): önceki sürümde ödenmemiş
  taksit varsa revizyon `CONFLICT` ile engellenir; yetkili gerekçeli override
  (`renewalDebtOverrideReason`, audit'lenir) ile geçilebilir.
- **Revizyon yeni tahsilat anı yaratmaz** (mevcut sunucu kuralı, UI'a
  yansıtıldı): formal sürede bile ilk-tahsilat bölümü kapalıdır; yeni
  sürümün taksitleri ödenmemiş üretilir, tahsilat Ödemeler ekranından işlenir.
- **Aynı-dönem örtüşme beklenen durumdur**: revizyon genelde önceki sürümle
  aynı dönemi kapsar; istemci `allowOverlap=true` gönderir, revizyon gerekçesi
  sunucudaki örtüşme gerekçesine eşlenir (denetim izi).
- **Kayıt metni / KDV / ödeme pencereleri DEĞİŞMEDİ** — CEO onayı gereken
  işlem yok (sözleşme kaynak metni değişikliği, gerçek ödeme, KDV/fiyat
  politikası değişikliği yapılmadı).

## 2. Ürün kararları

- Revize yalnız **güncel** (terminal olmayan) sözleşmeden yapılabilir;
  iptal edilmiş/yenilenmiş sürümler revize edilemez (sunucu da reddeder).
- Form önceki sürümün tüm değerleriyle açılır: program, ücret, süre, taksit,
  tarihler, yöntem, kaparo, ders gün/saati, imzacı + kimlik/adres, rıza
  seçimi + kanallar, KVKK teslimatı, birleşik-ilk-tahsilat seçimi, son-dönem
  fiyatlandırması ve **aynı taksit motoru** (ders-başı/sabit — snapshot'taki
  `kind` alanından tespit edilir, sessiz motor değişimi yok).
- **Değişiklik özeti** her render'da yeniden hesaplanan türetilmiş listedir
  (13 alan: program, ücret, süre, taksit, başlangıç, bitiş, 1. vade, yöntem,
  kaparo, ders günü/saati, imzalayan, rıza, KVKK).
- **Boş revizyon engellenir**: değişiklik yoksa "Hiçbir değişiklik yapılmadı"
  hatasıyla gönderim durur.
- Revizyon gerekçesi zorunlu (1-500 karakter), taslakta saklanır.
- Süre değişikliği öğrenci kaydına da yazılır (revizyon mevcut dönemi
  düzeltir; yenileme gibi yeni dönem DEĞİLDİR).
- Başarı adımı mevcut akışı yeniden kullanır (`?olusturuldu=`, ders planı CTA).

## 3. Değişen dosyalar

- `src/lib/contract-revision.ts` (YENİ) — saf fark hesabı
  (`diffContractRevision`) + motor tespiti
  (`previousContractUsesPerLessonBilling`); istemci-güvenli.
- `src/components/contract-panel.tsx` — `reviseMode` kipli form, "Revize et"
  aksiyonu, değişiklik özeti paneli, gerekçe alanı, ön-doldurma genişletmesi.
- `src/lib/__tests__/contract-revision.test.ts` (YENİ) — 9 fark/motor testi.
- `src/lib/__tests__/contract-amendment.test.ts` (YENİ) — 8 sunucu akış testi.
- Sunucu tarafında (`contracts.ts`, `tools.ts`, API rotası) DEĞİŞİKLİK YOK —
  `amendment` sözleşme türü zaten destekleniyordu; bu turda UI + test eklendi.

## 4. Bilinen sınırlamalar

- Önceki planda önizlemede elle değiştirilmiş ARA taksit tutar/vadeleri
  snapshot'ta ayırt edilemediği için revizyona taşınmaz; personel yeni
  önizlemede yeniden uygular (son-satır manuel tutar taşınır).
- Önceki sürümün ödenmiş taksitleri yeni sürüme "devredilmez": yeni sürümün
  planı ödenmemiş üretilir; eski tahsilatlar eski sürümde arşivde kalır.
  Borç varken revizyon engellenir (bkz. §1), bu yüzden çift-tahsilat riski
  için önce borç kapatılır veya gerekçeli override kullanılır.
- İmza durumu taşınmaz: yeni sürüm `generated` olarak doğar, ıslak imza
  akışı (yazdır → imza bekleniyor → imzalı nüsha) yeniden işletilir.

## 5. Doğrulama

- `npx tsc --noEmit` — temiz.
- `npx eslint` (değişen dosyalar) — temiz.
- `contract-revision` 9/9, `contract-amendment` 8/8, mevcut `contracts` +
  `contract-return-flow` + `contract-lesson-schedule-room` 104/104 geçti.
- Tarayıcı UAT'ı (masaüstü/mobil, açık/koyu) test deploy sonrası UAT
  promptundaki adımlarla yapılacak.
