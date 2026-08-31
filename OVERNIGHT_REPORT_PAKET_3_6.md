# Gece Otonom Uygulama Raporu — Paket 3–6

## 1. Genel Sonuç

**Tamamlanan:** Paket 3, Paket 4, Paket 5, Paket 6 — dördü de tamamlandı, bloklanan paket yok.

## 2. Paket 3 — Mobil Bildirim Tercihleri

- Mevcut kanonik `NotificationPreference` modeli, `notification-categories.ts` kataloğu ve
  `getNotificationPreferencesTool`/`setNotificationPreferencesTool` araçları yeniden kullanıldı;
  paralel bir model kurulmadı.
- Yeni: `src/app/api/v1/notification-preferences/route.ts` — `GET` sadece çağıran kullanıcının
  rolüne uygun kategorileri döner, `PATCH` `{updates:[{category,inAppEnabled}]}` alır ve yalnızca
  `ctx.userId` üzerinde işlem yapar (başka kullanıcının tercihini değiştirme imkânı yok).
- Yeni mobil ekran: `apps/mobile/src/features/notifications/notification-settings-screen.tsx`
  (yükleniyor/hata+tekrar dene/kaydediliyor durumları, Türkçe etiketler, push alanı gösterilmiyor
  çünkü backend'de push altyapısı yok — sahte özellik iddia edilmedi).
- Hesabım giriş noktaları: admin/öğretmen/veli-öğrenci (Karma Öğrenci Portalı) için
  `(rol)/hesabim/{index,bildirim-tercihleri,_layout}.tsx` eklendi. `PARENT` rolü backend'de
  kaldırılmış olduğundan (`src/lib/auth/types.ts` üst yorumu doğrulandı — veli artık STUDENT
  rolüyle giriyor), veli girişi de eklendi.
- **Test sonucu:** `notification-preferences.test.ts` 14/14 geçti (rol uygunluğu ve
  cross-user reddi dahil).

## 3. Paket 4 — Otomatik Müfredat İlerlemesi

- **Hesaplama kuralı:** `progressPercent` artık istemciden gelmiyor; `status` değiştiğinde
  mevcut `defaultProgressForStatus` fonksiyonu otomatik uyguluyor (planned/deferred=0,
  in_progress=50, mastered=100). Genel ilerleme zaten var olan `computeOverallCurriculumProgress`
  (basit ortalama, 0 konu için 0 döner — bölme hatası yok) tek kaynak olarak korundu.
- **Kaldırılan manuel alanlar:** `curriculum-topic-update-form.tsx` ve `curriculum-topic-form.tsx`
  içindeki yüzde giriş kutuları kaldırıldı; salt-okunur gösterim bileşenleri
  (`curriculum-summary-card.tsx`) dokunulmadan bırakıldı. `src/lib/validation.ts` şemalarından
  `progressPercent` alanı çıkarıldı, `tools.ts` bu alanı artık kabul etmiyor.
- `src/lib/student-score.ts` yerel olarak aynı ortalama hesaplamasını tekrar ediyordu — merkezi
  `computeOverallCurriculumProgress`'e yönlendirildi (kod tekrarı giderildi).
- **Test sonucu:** `curriculum.test.ts` 21/21, `student-score.test.ts` + `student-score-route.test.ts`
  13/13 geçti.

## 4. Paket 5 — Veli/Öğrenci Haftalık Program

- **Haftalık görünüm davranışı:** `StudentScopeLessonsScreen` artık tüm ders geçmişini çekmek
  yerine sadece görüntülenen haftayı sunucudan çekiyor; günlere gruplama, "bugün" vurgusu,
  önceki/sonraki hafta gezinmesi ve "Bu hafta" kısayolu eklendi; boş hafta için Türkçe boş durum
  metni gösteriliyor.
- **Kullanılan mevcut API:** Yeni endpoint AÇILMADI. Mevcut
  `GET /api/v1/students/:studentId/schedule` endpoint'ine geriye dönük uyumlu, opsiyonel
  `?from=&to=` (ISO tarih) parametreleri eklendi — parametreler verilmezse davranış birebir eskisiyle
  aynı (eski çağıranlar bozulmadı).
- **Test sonucu:** `mobile-baseline-endpoints.test.ts` 16/16, ilgili 3 dosyada toplam 37/37 geçti.
  `npx expo export --platform ios` başarılı.

## 5. Paket 6 — Bildirim Cursor Sayfalama

- **Cursor sözleşmesi:** `GET /api/v1/notifications?cursor=<token>&limit=<1-100>` →
  `{notifications, nextCursor: string|null, unreadCount: number}`. Sıralama `createdAt DESC, id DESC`
  (ikincil anahtar sayesinde sayfa sınırlarında tekrar/eksik kayıt yok). `cursor`/`limit`
  verilmezse geriye dönük uyumlu ilk sayfa (varsayılan limit 20) döner. `unreadCount` yüklenen
  sayfadan bağımsız, kullanıcının tüm gelen kutusunu yansıtır (ayrı `count` sorgusu).
- **Mobil load-more davranışı:** `apps/mobile/app/notifications.tsx` — liste sonuna yaklaşınca
  otomatik sonraki sayfa yükleme, paralel tekrar istek koruması, id bazlı tekilleştirme, load-more
  hata/tekrar-dene durumu, pull-to-refresh sayfalamayı sıfırlıyor, mevcut okundu-işaretleme ve
  gezinme davranışı korundu. `use-unread-notification-count.ts` artık tüm listeyi çekip saymak
  yerine sunucudan gelen `unreadCount`'u kullanıyor.
- **Test sonucu:** `notifications.test.ts` 15/15 geçti (ilk sayfa, ikinci sayfa, tekrar yok,
  sabit sıralama, geçersiz cursor, tenant/kullanıcı izolasyonu, sayfa bağımsız unread count dahil).

## 6. MPR'den Referans Alınan Ama Bilinçli Taşınmayan Parçalar

- MPR'deki eski iki-boole (push/email/SMS iddiası içeren) bildirim tercih modeli **taşınmadı** —
  main'in zaten var olan, kategori bazlı, rol duyarlı tercih sistemi kullanıldı.
- MPR'nin ayrı bir müfredat ilerleme formülü/parça modeli **taşınmadı** — main'in tek
  `computeOverallCurriculumProgress` kaynağı korundu.
- MPR'nin paralel bildirim listesi/sayfalama API sözleşmesi **taşınmadı** — mevcut
  `/api/v1/notifications` endpoint'i genişletildi.
- Mobil `role-to-persona.ts` içinde PARENT'ın hâlâ ayrı bir backend rolü olduğunu iddia eden
  bayat bir yorum bulundu — kapsam dışı olduğu için düzeltilmedi, sadece not edildi.

## 7. Değişen Dosyaların Paket Bazlı Listesi

**Paket 3:**
`src/app/api/v1/notification-preferences/route.ts` (yeni),
`apps/mobile/src/features/notifications/notification-settings-screen.tsx` (yeni),
`apps/mobile/app/(admin)/hesabim/{index,bildirim-tercihleri,_layout}.tsx`,
`apps/mobile/app/(teacher)/hesabim/{index,bildirim-tercihleri,_layout}.tsx`,
`apps/mobile/app/(parent)/hesabim/{index,bildirim-tercihleri,_layout}.tsx`,
`src/lib/__tests__/notification-preferences.test.ts`

**Paket 4:**
`src/lib/validation.ts`, `src/lib/services/tools.ts` (curriculum kısmı),
`src/components/curriculum-topic-update-form.tsx`, `src/components/curriculum-topic-form.tsx`,
`src/app/panel/mufredat/page.tsx`, `src/app/ogretmen/mufredat/page.tsx`,
`src/app/ogretmen/ogrenciler/[studentId]/page.tsx`,
`src/lib/student-score.ts`, `src/lib/__tests__/curriculum.test.ts`

**Paket 5:**
`src/lib/services/tools.ts` (`getStudentScheduleTool` kısmı),
`src/app/api/v1/students/[studentId]/schedule/route.ts`,
`apps/mobile/src/features/student-scope/lessons-screen.tsx`,
`src/lib/__tests__/mobile-baseline-endpoints.test.ts`

**Paket 6:**
`src/lib/validation.ts`, `src/lib/notifications/index.ts`, `src/lib/services/tools.ts`
(bildirim kısmı), `src/app/api/v1/notifications/route.ts`,
`apps/mobile/app/notifications.tsx`, `apps/mobile/src/types/api.ts`,
`apps/mobile/src/hooks/use-unread-notification-count.ts`,
`src/lib/__tests__/notifications.test.ts`

## 8. Çalıştırılan Komutlar ve Sonuçları

```
npx prisma validate        → "The schema at prisma/schema.prisma is valid"
npx prisma generate         → Prisma Client v7.9.1 üretildi
npm run typecheck            → temiz (yalnızca Paket 2'ye ait, önceden var olan
                                password-reset.test.ts NODE_ENV hataları hariç)
npm --prefix apps/mobile run typecheck → temiz
npm --prefix apps/mobile test → script mevcut değil (apps/mobile'da test altyapısı
                                 hiç kurulmamış — bu yüzden atlandı, uydurulmadı)
Paket 3 odaklı testler        → 14/14 geçti
Paket 4 odaklı testler        → curriculum 21/21, student-score 13/13 geçti
Paket 5 odaklı testler        → 16/16 (37/37 ilgili dosyalarda) geçti
Paket 6 odaklı testler        → 15/15 geçti
npx expo export --platform ios → başarılı (Paket 5 ve 6 sonrasında ayrı ayrı çalıştırıldı)
git diff --check              → temiz (her paket sonrası)
```

## 9. Tam Test Sonucu (`npm test`)

`Test Files 7 failed | 203 passed (210)` — `Tests 8 failed | 2082 passed (2090)`

Başarısız dosyalar çalıştırmadan çalıştırmaya **değişiyor** (aynı komut farklı zamanlarda farklı
testleri başarısız gösteriyor — örn. bir seferinde `lesson-series-tools`/`lesson-update`/
`trial-lesson-duration`, başka seferinde `find-person-schedule`/`homework-attachment`/
`lesson-move-resize-flow`/`lesson-scheduling`). Bu, Paket 3–6 kapsamı dışında, önceden var olan bir
kararsızlık (muhtemelen tarih/zamana bağlı TEACHER_UNAVAILABLE kontrolleri veya paylaşılan
JSON store ile ilgili). `git status`/diff doğrulaması: bu başarısız dosyaların hiçbiri bu gece
değiştirilen dosyalar arasında değil (ders serisi, ders taşıma, deneme dersi süresi mantığına
dokunulmadı). Paket 2'ye ait iki `password-reset.test.ts` NODE_ENV hatası da önceden vardı, bu gece
dokunulmadı.

## 10. iPhone Sabah Kabul Kontrol Listesi

- [ ] Bildirim ayarları: Hesabım → Bildirim Tercihleri ekranını aç, bir kategoriyi kapat, uygulamayı
      kapat/aç, tercihin kalıcı olduğunu doğrula.
- [ ] Müfredat: bir konunun durumunu "Devam Ediyor"dan "Ustalaşıldı"ya değiştir, genel ilerleme
      yüzdesinin otomatik güncellendiğini doğrula (manuel yüzde girişi artık yok).
- [ ] Veli/Öğrenci haftalık program: Derslerim ekranında önceki/sonraki hafta gezinmesini ve
      "Bu hafta" kısayolunu dene; dersi olmayan bir haftada boş durum mesajının göründüğünü doğrula.
- [ ] 30+ bildirimi olan bir hesapta bildirimler listesinin sonuna kaydır, yeni sayfanın
      yüklendiğini ve hiçbir bildirimin tekrarlanmadığını doğrula; aşağı çekip yenilemenin
      listeyi doğru sıfırladığını doğrula.

## 11. Bilinen Açıklar / Production Öncesi Gerekenler

- `pushEnabled` alanı hâlâ backend'de bir "no-op" yer tutucu — gerçek push altyapısı yok,
  mobil ekranda da bilinçli olarak gösterilmiyor.
- `apps/mobile`'da hiç otomatik test altyapısı yok (Paket 5/6 için sadece root'taki vitest
  dosyalarına saf yardımcı fonksiyon testleri eklendi).
- Tam `npm test` çalıştırmasında paket kapsamı dışı, kararsız (flaky) 7-8 test var — production
  öncesi ayrıca araştırılmalı (muhtemelen tarih/saate bağlı öğretmen müsaitlik testleri).
- Mobil `role-to-persona.ts` içindeki bayat PARENT-rolü yorumu temizlenmeli (kapsam dışı, sadece
  not edildi).

## 12. Kesin Onay

- Stage yapılmadı (`git add` hiçbir dosyada çalıştırılmadı; tüm değişiklikler working tree'de).
- Commit yapılmadı.
- Push yapılmadı.
- `/Users/hidircanyagiz/Projects/worktrees/mobile-product-redesign` sadece referans olarak okundu,
  hiçbir dosyası değiştirilmedi.
- Shared/staging/production veritabanına hiçbir migration uygulanmadı
  (`npx prisma migrate deploy`/`db push`/`db reset` çalıştırılmadı).
- Paket 1 (Profil Fotoğrafı) ve Paket 2 (Şifremi Unuttum/Sıfırlama) dosyalarına dokunulmadı.
