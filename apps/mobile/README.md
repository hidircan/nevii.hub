# Nevii Hub Mobile

Expo + TypeScript + Expo Router tabanlı native mobil uygulama (Yönetici / Öğretmen /
Veli). PWA DEĞİL — gerçek native uygulama, mevcut Nevii Hub web backend'inin
`/api/v1/*` REST API'sini Bearer token ile tüketir. Web tarafındaki HttpOnly
çerez akışına dokunmaz/güvenmez.

## Kurulum

```bash
cd apps/mobile
npm install
cp .env.example .env
```

`.env` içindeki `EXPO_PUBLIC_API_URL`'i backend'inize göre ayarlayın (bkz. `.env.example`
— tüm seçenekler ve neden orada olduğu için yorumlar orada):

- **iOS Simulator** (aynı Mac üzerinde): `http://localhost:3000` — varsayılan, değiştirmeye gerek yok.
- **Fiziksel iPhone/Android (aynı Wi-Fi)**: Mac'inizin LAN IP'si, örn. `http://192.168.1.23:3000`
  (`ifconfig | grep "inet "` ile bulabilirsiniz). `localhost` fiziksel cihazdan
  Mac'inizi işaret ETMEZ, cihazın kendisini işaret eder.
- **Android Emulator**: `http://10.0.2.2:3000` (emulator'ün özel localhost-alias'ı).
- **Production**: Vercel'deki HTTPS adresiniz, örn. `https://<production-domain>`.

Backend'i ayrıca çalıştırın (repo kökünden):

```bash
npm run dev   # http://localhost:3000
```

**`.env`'i değiştirdikten sonra** Expo, `EXPO_PUBLIC_*` değişkenlerini build-time'da
gömdüğü için Metro cache'ini temizleyerek yeniden başlatmanız gerekir:

```bash
npx expo start --clear
```

### Fiziksel cihazda "Sunucuya ulaşılamadı" / bağlantı sorunu giderme

1. `.env`'deki IP'nin Mac'in **o anki** LAN IP'siyle eşleştiğini doğrulayın
   (`ifconfig | grep "inet "` — Wi-Fi değişince/DHCP yenilenince bu IP değişebilir).
2. Backend'in gerçekten ayakta olduğunu ve o porttan yanıt verdiğini Mac'te
   terminalden doğrulayın: `curl http://<LAN-IP>:3000/api/v1/health` → `{"ok":true,...}` dönmeli.
   Bu **Mac'ten** çalışıyor olması telefonun da erişebileceği anlamına GELMEZ (adım 3'e bakın).
3. **En sık gerçek neden — macOS Application Firewall.** Sistem Ayarları → Ağ →
   Güvenlik Duvarı (veya `/usr/libexec/ApplicationFirewall/socketfilterfw --listapps`)
   içinde çalışan `node` ikilisinin (`node --version` / `which node` ile bulun,
   `nvm` kullanıyorsanız sürüme göre yol değişir) gelen bağlantı kabul etme izni
   olduğundan emin olun. İzin verilmemişse Mac'ten `curl` çalışır ama telefondan
   (farklı bir cihazdan) bağlantı reddedilir/zaman aşımına uğrar — tam olarak bu
   semptomu üretir.
4. Router'da "AP/istemci izolasyonu" veya misafir ağı kullanmadığınızdan emin
   olun — bazı router'lar aynı Wi-Fi'daki cihazların birbirine erişmesini engeller.
5. Development modunda (`__DEV__`) `apps/mobile/src/api/client.ts` artık gerçek
   fetch hatasını ve hedef host'u (token/secret İÇERMEDEN) hem console'a yazar
   hem de `ErrorState` mesajına ekler — Metro/Expo Go log'larına bakın.

## Çalıştırma

```bash
npm run ios       # iOS Simulator (Xcode kurulu olmalı)
npm run android    # Android Emulator (Android Studio kurulu olmalı)
npm run web         # Tarayıcıda Expo web preview (hızlı bir gözden geçirme için)
npm start            # Expo Dev Tools — QR kod ile Expo Go üzerinden fiziksel cihazda açın
```

`npm run typecheck` — `tsc --noEmit`. `npx expo-doctor` ve `npx expo export --platform ios`
de değişiklik sonrası çalıştırılmalı.

## Mimari

```
apps/mobile/
  app/                        Expo Router dosya-tabanlı route'lar
    _layout.tsx                Root layout — ThemeProvider + AuthProvider + Stack
    index.tsx                  Marka splash'i; auth durumuna göre login/role sekmesine yönlendirir
    login.tsx                   Ürün kalitesinde giriş ekranı
    notifications.tsx            Üç rol için ortak bildirim merkezi (root-level modal)
    assessment/[lessonId].tsx     Öğretmen → öğrenci gelişim değerlendirme formu (root-level, her sekmeden erişilir)
    (admin)/                     Yönetici sekme grubu — Özet, Program, Kişiler, İşlemler, Hesabım
      program/                    Gün bazlı ders programı + ders detayı (nested stack)
      kisiler/                     Öğrenciler/Öğretmenler/Veliler segmentleri + detay ekranları
      islemler/                    Operasyon merkezi: duyurular, iş takip, öğretmen performansı, ödev raporu, finans
    (teacher)/                    Öğretmen sekme grubu — Bugün, Öğrencilerim, Ödevler, İş Takip, Hesabım
      bugun/                       Bugünkü dersler + ders detayı (yoklama, başlat/bitir, ödev ver, değerlendir)
      ogrencilerim/                 Öğrenci listesi + detay (müfredat, ödev geçmişi, değerlendirme)
      odevler/                      Bekleyen/Yaklaşan/Geçmiş + yeni ödev formu
      is-takip/                     Açık/Bugün/Yaklaşan/Gecikmiş/Tamamlanan segmentleri + görev detayı
    (parent)/                     Veli sekme grubu — Ana Sayfa, Dersler, Ödevler, Gelişim, Hesabım
      gelisim/                      Müfredat ilerlemesi, devam özeti, öğretmen notları + değerlendirme formu
  src/
    api/client.ts                fetch tabanlı API client — Authorization: Bearer header,
                                  401 → otomatik refresh → tek seferlik retry
    auth/
      token-storage.ts            expo-secure-store ile access/refresh token saklama
      auth-context.tsx             AuthProvider/useAuth — login/logout/me, roleToPersona
    theme/
      tokens.ts                    Tasarım sistemi: renk paleti (light/dark), spacing, radius, typography, shadow
      theme-context.tsx             ThemeProvider/useTheme — sistem temasını izler, kullanıcı tercihi SecureStore'da kalıcı
    components/ui/                 Paylaşılan tasarım sistemi bileşenleri (Screen, AppHeader, SectionHeader,
                                    StatCard, ActionCard, LessonCard, StudentCard, HomeworkCard, TaskCard,
                                    NotificationCard, AnnouncementCard, EmptyState, LoadingSkeleton,
                                    LoadingState/ErrorState, SearchInput, FilterChip, StatusBadge, ProgressBar,
                                    Avatar, BottomSheet, ConfirmDialog, FloatingActionButton, Button,
                                    TextField, SelectField, ScoreSelector) — tüm ekranlar bunları kullanır.
    features/account/               Üç rol için ortak Hesabım ekranı (profil, tema tercihi, çıkış)
    hooks/use-api.ts                Basit GET veri çekme kancası (loading/error/success)
    lib/                            date.ts (Türkçe tarih biçimleri), lesson-status.ts, homework-bucket.ts,
                                     task-segments.ts, group-by-day.ts — bağımlılıksız yardımcılar
    types/api.ts                    Backend REST v1 yanıtlarının paylaşılan TypeScript tipleri
```

### Rol → persona eşlemesi

Backend'de (`src/lib/auth/types.ts` `APP_ROLES`) altı rol var: `SUPER_ADMIN`,
`SCHOOL_ADMIN`, `TEACHER`, `PARENT`, `STUDENT`, `AI_AGENT` — **`PARENT` ayrı,
gerçek bir roldür** (JWT'de `studentId` claim'i taşır). Mobil üç persona
sunar; `roleToPersona()` (`src/auth/auth-context.tsx`) eşlemesi:

- `SUPER_ADMIN` | `SCHOOL_ADMIN` → **admin**
- `TEACHER` → **teacher**
- `PARENT` | `STUDENT` → **parent** (ikisi de aynı `studentId` sahiplik modelini kullanır)

### Auth akışı

1. `login.tsx` → `POST /api/v1/auth/login` → `{ accessToken, refreshToken, user }`.
2. Token'lar `expo-secure-store`'a yazılır (Keychain/Keystore — düz metin
   AsyncStorage DEĞİL).
3. Her istek `Authorization: Bearer <accessToken>` header'ı taşır.
4. 401 alınırsa `POST /api/v1/auth/refresh` (body'de `refreshToken`) ile tek
   seferlik otomatik yenileme denenir; başarısızsa oturum kapatılır ve
   `/login`'e yönlendirilir.
5. Uygulama açılışında saklı access token varsa `GET /api/v1/auth/me` ile
   doğrulanır.

Backend RBAC/rol modeli **değiştirilmedi** — mobil yalnızca mevcut
`/api/v1/auth/*` ve diğer REST endpoint'lerini tüketir.

## Bu sürümde backend'e eklenen yeni, güvenli GET/POST endpoint'leri

Mobil ekranların ihtiyaç duyduğu ama önceden yalnızca web server component'i
içinde `readScopedData` ile üretilen veriler için eklendi. Hepsi mevcut
`withApiHandler` + RBAC + tenant izolasyonu deseniyle, tool katmanında
(`src/lib/services/tools.ts`) `requireRole`/`assertStudentAccess`/`canAccessTeacher`
ile korunuyor:

| Endpoint | Amaç |
|---|---|
| `GET /api/v1/teachers` | Öğretmen listesi (admin: performans skoru dahil; N+1 yok) |
| `GET /api/v1/students` | Admin-wide öğrenci listesi (Kişiler sekmesi) |
| `GET /api/v1/students/:id` | Tek öğrenci profili |
| `GET /api/v1/teachers/:id/students` | Öğretmenin kendi öğrenci listesi |
| `GET /api/v1/lessons?from=&to=` | Admin-wide ders listesi (Program sekmesi) |
| `GET /api/v1/students/:id/attendance-summary` | Basit yoklama özeti (katıldı/gelmedi/izinli/telafi) |
| `GET /api/v1/dashboard/summary` | Yönetici Özet ekranı için tek çağrılık dashboard |
| `GET /api/v1/tasks`, `POST /api/v1/tasks`, `GET/POST /api/v1/tasks/:id`, `GET /api/v1/tasks/kpi` | İş Takip liste/oluştur/detay/durum güncelle/sayaçlar (`listTasksTool`/`createTaskTool`/`updateTaskTool`/`getTaskDetailTool`/`getTaskKpiSummaryTool` zaten vardı, REST route'u yoktu) |
| `GET /api/v1/teacher-feedback/this-month` | Bu ay zaten değerlendirme yapılmış mı (`getOwnTeacherFeedbackThisMonthTool` zaten vardı, REST route'u yoktu) |

Ayrıca `getStudentScheduleTool`/`getTeacherScheduleTool` ve
`listHomeworkForStudentTool`/`listHomeworkForTeacherTool` **ders/öğrenci adı ve
ödev durumu (PENDING/SUBMITTED/REVIEWED) ile zenginleştirildi** (tek
`readData()` üzerinde bellek-içi eşleme — ek sorgu yok) çünkü ham store
kayıtları yalnızca id taşıyordu.

**Toplu liste endpointlerinde hassas alan (T.C. kimlik, tam adres vb.)
döndürülmez.** `GET /api/v1/students` admin-only'dir ve veli adı/telefonu
zaten web panelinde aynı role görünür — yeni bir ifşa değildir.

## Bilinen sınırlama / kapsam dışı bırakılanlar

- **Dosya yükleme** (ödev/materyal ekleri) — yalnızca UI hazırlığı var (Ödev
  oluşturma formunda "Dosya ekle (yakında)" satırı), gerçek yükleme yok.
  `expo-image-picker`/`expo-document-picker` gerektirir, bilinçli olarak bu
  sürüme eklenmedi.
- **Tarih seçici** — native bir date picker paketi (ör.
  `@react-native-community/datetimepicker`) kurulu değil; ödev son tarihi
  `YYYY-AA-GG` metin girişiyle alınıyor.
- **Duyuru "seçili kişi" hedefleme** — yeni duyuru formu `Tümü / Öğretmenler /
  Veliler / Öğrenciler` hedef kitlelerini destekler; web'deki serbest kişi
  arama + şube bazlı hedefleme (`audienceType: "selected" | "branch"`)
  mobile'da yok (arka uçtaki `createAnnouncementTool` zaten destekliyor,
  yalnızca mobil UI'da eklenmedi).
- **Ödev raporu (admin, kurum-geneli)** — tenant-genelinde tek çağrılık bir
  toplu rapor endpoint'i yok; öğretmen başına ayrı sorgu N+1 olacağından
  eklenmedi. Admin şimdilik öğrenci bazlı ödev durumunu Kişiler > Öğrenciler
  üzerinden görebilir.
- **Finans/hakediş** — yalnızca "takip gereken tahsilat" sayacı ile sade bir
  giriş noktası var; tam tahsilat/hakediş akışı web panelinde kalır.
  Öğretmen hakediş hesaplama mobilde yok.
- **Push bildirimleri** ve **offline önbellekleme** yok.
- **Öğrenci/veli ayrımı** — `PARENT` ve `STUDENT` rolleri mobilde tek "Veli"
  persona'sına yönlendirilir; öğrencinin kendi girişi için ayrı bir deneyim
  istenirse `roleToPersona()` içinde üçüncü bir persona eklenir.

## Durumlar

Her veri ekranı `loading` (`LoadingSkeleton`) / `error` (`ErrorState`,
"Tekrar dene" butonlu) / `empty` (`EmptyState`) durumunu
`src/components/ui/*` üzerinden standart şekilde gösterir. Backend'e hiç
ulaşılamıyorsa (yanlış `EXPO_PUBLIC_API_URL` veya `npm run dev` kapalı),
istekler `NETWORK_ERROR` ile başarısız olur ve `ErrorState` "Tekrar dene" ile
görünür (`DevUnreachableState` de mevcut, `src/components/ui/states.tsx`).

## Tema

`ThemeProvider` (`src/theme/theme-context.tsx`) sistem temasını (`useColorScheme`)
izler; kullanıcı Hesabım ekranından Sistem/Açık/Koyu tercihini değiştirebilir,
tercih `expo-secure-store`'da kalıcıdır.
