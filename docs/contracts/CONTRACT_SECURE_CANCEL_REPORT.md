---
title: "Güvenli Sözleşme İptali — Teslim Raporu"
date: "2026-09-28"
branch: "feat/uat-round-10"
worktree: "canonical (worktree KULLANILMADI)"
---

# Güvenli Sözleşme İptali — Teslim Raporu

10. tur iş #9. Sözleşme iptali (kullanıcının gördüğü "silme") artık güvenli
kritik-işlem desenindedir: **etki özeti → gerekçe + sözleşme-no teyidi +
kritik işlem şifresi → denetim izi**. Fiziksel silme (hard delete) sözleşmeler
için YOKTUR — yerleşik kural korundu (`contracts.ts`: "hard delete YOK,
tarihçe korunur"); iptal kaydı `cancelled` olarak arşivde tutar.

## 1. Etkilenen finansal / hukuki kurallar

- **Tarihsel kayıtlar mutasyona uğramaz** (korundu): iptal yalnız statüyü
  `cancelled` yapar; taksit satırları, tahsilatlar, belge ve snapshot aynen
  durur (test: iptal sonrası 3 taksit satırı okunabiliyor).
- **İptal kapıları** (YENİ, sunucu otoriter):
  - Rol: `CONTRACT_STAFF` (SCHOOL_ADMIN/SUPER_ADMIN) + öğrenci kapsamı
    (`canAccessStudent`) — kapsam kontrolü iptale de eklendi.
  - İptal gerekçesi zorunlu (5-500 karakter), başarı denetimine yazılır.
  - Sözleşme numarasının aynen yazılması zorunlu (yanlış satır koruması).
  - Kritik işlem şifresi zorunlu (tek kapı `checkCriticalPassword`).
  - Terminal (cancelled/superseded) sözleşme tekrar iptal edilemez.
- **Reddedilen HER deneme** audit'e `contract.cancel / denied` yazılır
  (öğrenci/paket/iş silmeyle aynı desen).
- Ders-etkisi kuralları DEĞİŞMEDİ: varsayılan "dersler kalsın", işlendi/telafi
  işaretli dersler korunur, sıra önce-dersler-sonra-sözleşme
  (`contract-cancel-lesson-impact` statik testleri geçiyor).
- Kayıt metni / KDV / ödeme pencereleri DEĞİŞMEDİ — CEO onayı gereken işlem yok.

## 2. Ürün kararları

- Etki özeti iptalden ÖNCE gösterilir: öğrenci, sürüm (+güncel uyarısı),
  taksit/ödenmemiş sayısı, tahsil edilen, açık borç, gelecek ders sayısı.
- Etki okunamazsa iptal YAPILAMAZ (eski davranış "yine de iptal et" idi;
  finansal etkinin görünmemesi güvenli değildir — bilinçli sıkılaştırma).
- Kritik şifre belirlenmemişse diyalog Ayarlar → Güvenlik'e yönlendirir.
- Odak: 10. tur iş #5 geçiş-odak deseni uygulandı (açılışta panele,
  kapanışta tetikleyiciye; yazarken imleç sabit).

## 3. Değişen dosyalar

- `src/lib/services/tools.ts` — `ContractCancellationImpact` türü +
  `getContractCancellationImpactTool` (YENİ); `cancelStudentContractTool`
  kapıları (gerekçe/teyit/şifre/terminal/kapsam) + denied denetimi.
- `src/lib/services/index.ts` — yeni aracın dışa vurumu.
- `src/app/api/v1/contracts/[contractId]/cancellation-impact/route.ts` (YENİ)
  — GET etki özeti.
- `src/app/api/v1/contracts/[contractId]/cancel/route.ts` — gövde belgesi
  güncellemesi (kod değişmedi, body passthrough).
- `src/components/contract-cancel-dialog.tsx` — iki aşamalı güvenli diyalog.
- `src/lib/__tests__/contract-cancel-test-helper.ts` (YENİ) — kritik-şifre
  kurulumu + güvenli iptal girdisi.
- `src/lib/__tests__/contract-secure-cancel.test.ts` (YENİ) — 9 test.
- Güncellenen mevcut testler (yeni zorunlu alanlara uyarlama, davranış
  iddiası değişmedi): `contracts.test.ts`, `contract-preview-after-cancel`,
  `attendance-calendar-contract-plan`, `contract-amendment`.

## 4. Bilinen sınırlamalar

- İptal geri alınamaz (geri alma akışı yok — iptal arşivde kalır, yeni
  sözleşme açılır). Öğrenci silmedeki "Silinenler'den geri al" burada yoktur.
- Açık borç iptali ENGELLEMEZ (kayıtlar korunduğu için güvenli); borç
  etkide kırmızı gösterilir, tahsilat Ödemeler'den izlenir.

## 5. Doğrulama

- `npx tsc --noEmit` — temiz.
- `npx eslint` — 0 hata (tools.ts'teki 20 uyarı önceden vardı).
- Yeni `contract-secure-cancel` 9/9; statik `contract-cancel-lesson-impact`
  8/8; güncellenen 4 dosya toplam 113/113 geçti.
- Tarayıcı UAT'ı test deploy sonrası UAT promptundaki adımlarla yapılacak.
