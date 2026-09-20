# Guardian Çoklu Öğrenci + Tasarım Dönüşümü — Davranış Sözleşmesi ve Onay İstemi

Tarih: 2026-09-20 · Branch: `release/mobile-review` · Kapsam: `apps/mobile` (Expo SDK korunur)
İlke: backend RBAC gevşetilmedi; onaysız veri silme/migration yok; sahte erişim sistemi yok.

## 1. Commit listesi (bu tur)

| Commit | Dosyalar | API etkisi | Test |
|--------|----------|------------|------|
| `80d5306` tema+tipografi | `theme-context.tsx`, `tokens.ts`, `tokens.test.ts` | Yok | typecheck + 226 PASS |
| `b2e64ae` welcome 3. persona | `welcome.tsx`, `login.tsx`, `welcome-flow.test.ts` | Yok (tek login endpoint) | PASS |
| `9cc1398` çocuk bağlamı+picker+routing | `student/selection.ts`, `student-context.tsx`, `child-switcher.tsx`, `select-child.tsx`, `index.tsx`, `_layout.tsx`, `auth-context.tsx` (opsiyonel `children` tipi) | Yok — `children` yalnız okunur, backend göndermez | 237 PASS (11 yeni) |
| `c9dee98` ekran geçişi+switcher | home/ders/detay/ödev/ödeme/gelişim/materyal/değerlendirme/yoklama/çocuğum/iletişim-tercihi + `parent-scope-guard.test.ts` | Yok (aynı uçlar, seçili ID) | PASS |
| `e64ccc3` öğretmen gün seçici | `(teacher)/bugun/index.tsx` (min 44×48 + SR etiketi) | Yok | PASS |
| `92629e2` e-posta değiştirme | `change-email-screen.tsx` + 3 persona route/link + test | Mevcut güvenli API kullanıldı (yeni uç YOK) | 240 PASS |

Güvenlik notu (tümü): yetki her istekte sunucuda; istemci ID üretmez, URL paramını otorite saymaz.

## 2. Guardian çoklu öğrenci davranış sözleşmesi

- SELF giriş → doğrudan kendi ana sayfası; switcher/picker görünmez.
- Tek çocuklu veli → doğrudan ana sayfa; switcher gizli (karmaşıklık yok).
- Çok çocuklu veli (sunucu listesi >1) → login/session restore sonrası `/select-child` ("Kimi takip etmek istiyorsunuz?").
- Picker: sınırsız çocuk, FlatList sanallaştırma, arama yok (ilk aşama); her satır profilini sunucudan çeker; sunucunun reddettiği (403/404) satır gizlenir, hata güvenli gösterilir.
- Seçim sonrası yalnız seçili bağlamın ana ekranı; tüm ekranlar `useSelectedStudentId()` kullanır.
- Öğrenci değişimi → path-keyed `useApiGet` otomatik loading'e düşer; eski veri görünmez. Geri navigasyon: picker `replace` ile açılır/kapanır, eski öğrenciye dönüş döngüsü yok.
- Persist: `SecureStore` (`neviichub_selected_student:<userId>`); restore'da liste karşı doğrulama — listede yoksa (erişim iptal) geçersiz, picker'a dönüş.
- Logout/expired-token: context state sıfırlanır (provider `key` değişimiyle remount); hassas veri ekranda kalmaz.
- Deep-link ile başka öğrenci ID'si: istemci URL'den kapsam okumaz; kaynak ID'li uçlar sunucuda `assertStudentAccess` ile reddeder (403/404 → güvenli hata ekranı).
- Bildirimler: hesap-seviyesi pull (`/notifications`) aynen; çocuk-bazlı kapsam kuralı backend'de tanımsız — bkz. eksikler.

## 3. Veri güvenliği / RBAC değerlendirmesi

- Mevcut: `canAccessStudent`/`assertStudentAccess` (`src/lib/services/context.ts`) — STUDENT için istek-başına `hasActiveStudentAccess` (active-only, JWT-cached değil); TEACHER sahiplik eşleşmesi; admin bypass rolleri. `resolveActivePortalAccess` invited/revoked'u asla seçmez.
- Bu tur: istemci her öğrenci-kapsamlı isteğe seçili ID'yi koyar; sunucu aynı kontrolleri uygular (uç değişikliği yok). `getActiveAccessType` SELF-only kısıtları (ödev teslim, fotoğraf) aynen korunur — veli seçili çocuk adına teslim/fotoğraf işlemi yapamaz.
- Statik kilitler güncellendi: URL allowlist (`studentId` = seçili bağlam), param'dan `studentId` okuma yasağı, hardcoded liste yasağı, finans/öğretmen-operasyonu yasakları aynen.
- Negatif erişim (403) davranışı mevcut `ErrorState` + `portalErrorMessage` ile sızdırmazdır; yeni sızıntı yüzeyi eklenmedi.

## 4. E-posta değiştirme — UYGULANDI (blocker değil)

- Backend hazırdı: `POST /api/v1/account/email-change/request` (şifre zorunlu, uniqueness/tenant/sahiplik sunucuda) + `POST .../confirm` (public, token e-postadaki web bağlantısında).
- Mobil: `ChangeEmailScreen` (mevcut adres gösterimi, istemci format kontrolü, şifreyle yeniden doğrulama, bekleyen-durum ekranı + yeniden gönderme). Uygulama confirm token'ı işlemez.
- Session/token etkisi: YOK (oturumlar userId tabanlı). Görüntülenen adres bir sonraki girişte güncellenir; onaylanana kadar eski adres geçerlidir.
- Admin kapsam dışı (istek §kapsam). Hata mesajları backend metinleriyle, hesap varlığı sızdırmaz eklenmedi.

## 5. Tema / splash / welcome tasarım kararları

- Tema varsayılanı `light` (sistem koyu olsa bile ilk görünüm açık); seçim SecureStore'da, koyu tema ikinci seçenek. Gerekçe: beyaz zeminli marka/splash ile ilk kare tutarlılığı.
- Splash: native `icon.png` + `#FFFFFF` aynen; ilk karede Gloock beklenmez (Georgia fallback + 2,5s güvenlik supabı aynen) — kaybolan marka riski yok (açık temada `text` koyu). Ek animasyon eklenmedi (hızlı/sade geçiş).
- Tipografi: display 26→30, başlık 24→26, gövde 14→15, caption 12→13 (Gloock yalnız marka/display; gövde sistem). `numberOfLines` ile kritik içerik kırpılmadı; picker satırları 2 satıra izin verir.
- Welcome: 3 dengeli giriş; yönetici seçeneği kurumsal/sade, öğrenci-veliyi gölgelemez. `persona` yalnız başlık/yardım metni; yönlendirmeyi sunucu rolü belirler; login→welcome tek-adım `replace`.
- Inter: doğrudan/dolaylı kullanım YOK (bu turda da eklenmedi; eşleşmeler `setInterval`/`userInterfaceStyle` yanlış pozitifidir).

## 6. Test sonuçları

- `apps/mobile` typecheck: PASS · `npm test`: 32 dosya / 240 test PASS.
- Yeni kilitler: `selection` (SELF/tek/çok/geçersiz-persist), route sözleşmesi (picker gating, provider, hardcoded-yok), e-posta akışı, tema/ölçek.
- Kapsanan senaryolar: 2/5/çok çocuk (liste+doğrulama), erişimden çıkarılan çocuk (persist geçersiz), SELF görünmezliği, tek çocuk sadeliği.

## 7. Gerçek cihaz UAT checklist (iOS + Android smoke)

1. Açık tema ilk kare: splash logo+marka görünür, kaybolma yok (aydınlık+karanlık sistemde).
2. Üç persona girişi + login + tek-adım welcome dönüşü (döngü yok).
3. SELF: doğrudan ev, switcher yok. Tek-çocuk veli: doğrudan ev, switcher yok.
4. Çok-çocuk veli (onay sonrası backend'le): picker → seçim → doğru çocuğun program/ödev/ödeme/profili → switcher ile değişim (eski veri anlık bile görünmemeli) → kapat-aç + token yenilemede doğru bağlam.
5. Erişimi iptal edilen çocuk: picker'a dönüş, veri yok.
6. Küçük iPhone + büyük font + dark/light + klavye açık login/e-posta formu (taşma/CTA gizlenmesi yok).
7. Offline/timeout/expired-token/logout sonrası temizlik; 403'te güvenli hata.
8. E-posta: yanlış şifre, aynı adres, geçersiz format, istek→bekleyen ekran→web bağlantısıyla onay→sonraki girişte yeni adres.

## 8. Bilinen eksikler ve ONAY İSTEMİ

### ONAY 1 — `GET /api/v1/mobile/my-children` (öneri, uygulanmadı)
Neden: `GET /api/v1/mobile/session` tek `studentId`'ye indirger (`resolveActivePortalAccess`); velinin TÜM aktif erişimlerini veren uç YOK (sadece admin-yönlü per-student liste var). Mevcut API ile çoklu picker gerçek veriyle beslenemez — client-only liste YASAK olduğundan endpoint'siz ilerlenemez.
Önerilen sözleşme (ek tablo/migration YOK — `StudentPortalAccess` unique zaten N çocuğu kapsar):
`GET /api/v1/mobile/my-children → ok({ children: [{ studentId, accessType }] })`, kaynak `listAccessForUser(tenantId,userId)` + `status=active` filtresi + `resolveActivePortalAccess` ile aynı deterministik sıra; invited/revoked ASLA listelenmez. Her veri ucu mevcut `assertStudentAccess` ile korunur (değişiklik yok). Alternatif: session'a `children` gömme — istemci her ikisini de okur (bu turda `MobileSession.children?` opsiyonel tipi hazır).
Etki: yalnızca yeni salt-okunur uç + (opsiyonel) session genişletmesi; RBAC/sema değişikliği yok. Onay sonrası: backend + mobil bağlama + negatif testler (çapraz tenant/user boş/FORBIDDEN, default=ilk sıra).

### ONAY 2 — Çocuk-bazlı bildirim kapsam kuralı
`/notifications` hesap-seviyesi; çoklu velide hangi çocuğa ait bildirimlerin geleceği backend'de tanımsız. Ürün kararı gerekli (tümü vs seçili çocuk filtresi).

### Sonraki yönetici mobil faz önerisi
Bu turda admin yalnız welcome/login yönlendirmesinde tutuldu. Sıralama: P0 yoklama alma + temel öğrenci/personel görüntüleme; P1 ödeme özeti/tahsilat + onay akışları (telafi/müsaitlik) + duyuru; P2 raporlar ve ileri ayarlar (web-only).
