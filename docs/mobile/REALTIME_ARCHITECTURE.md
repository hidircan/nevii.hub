# Realtime / Freshness Mimarisi (Faz 8)

## Karar: soket YOK, hedefli revalidation VAR

Supabase Realtime (veya benzeri) soket katmanı kurulmadı — ek maliyet, ek
yetki yüzeyi ve çift mod (JSON/DB) karmaşıklığı getirirdi. Bunun yerine:

1. **Focus + foreground + pull-to-refresh** (mevcut, korundu) — her ekrana
   dönüşte taze veri.
2. **Push-tetikli hedefli revalidation** (yeni) — foreground push alındığında
   yalnız ilgili kapsamlar tazelenir; dokunuş gerekmez, global polling YOK.
3. **Stale-while-revalidate cache** (Faz 7) — anında ekran + arka-plan tazeleme
   + "Son güncelleme" rozeti.

"Anlık" iddiası YOK: kritik olaylar push + açılış/focus tazeliğiyle iletilir.

## Kapsam eşleşmesi

| Push kategorisi | Tazelenen kapsamlar |
|---|---|
| lesson_* (hatırlatma/iptal/değişiklik) | schedule, attendance, notifications |
| homework_* | homework, notifications |
| payment_* | payments, notifications |
| task_* / bilinmeyen | notifications |

## Kritik olay akışları

- **Admin yoklama işler → öğrenci/veli:** öğrenci push alır (varsa) +
  foreground'da devam raporu tazelenir; değilse focus/fresh + cache TTL (30 dk).
- **Ödeme webhook → ledger:** `payment_received` push'u foreground ödemeler
  ekranını tazeler; uygulama kapalıyken açılışta focus-refresh çalışır.
- **Ders iptali/saat değişikliği:** `lesson_cancelled/rescheduled` push'u
  program + devamı tazeler; killed durumda push dokunuşu doğru hedefi açar
  (Faz 5) ve ekran ağdan yüklenir.
- **Guardian revoke:** sonraki istek 403 → cache kaydı silinir (Faz 7);
  liste focus'ta tazelenir; push hedeflemesi sunucuda aktif-erişim filtrelidir.
- **Duyuru:** bildirim merkezi `notifications` kapsamıyla tazelenir.

## Hata/offline davranışı

- Dinleyici hatası veriyolunu kırmaz (try/catch).
- Push alınamazsa (offline/kapalı bildirim) sistem focus/refresh + TTL'ye
  düşer — sessizce eski veri "güncel" gibi gösterilmez (stale rozeti).
- Bağlantı dalgalanmasında üst üste refresh'ler `useApiGet` tick modeliyle
  serileşir; yarışta son kazanan gösterilir.

## Dosyalar

`src/cache/refresh-bus.ts`, `src/cache/invalidate.ts`,
`src/cache/use-cached-api.ts` (abonelik), `src/push/use-push-notifications.ts`
(foreground dinleyici), `app/notifications.tsx` (abonelik).
Test: `src/cache/__tests__/refresh-bus.test.ts` + sözleşme testleri.
