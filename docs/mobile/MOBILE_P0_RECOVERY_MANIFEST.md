# NeviiHub Mobil P0 — Recovery ve Contract Manifesti

- Tarih: 2026-09-13 · Worktree: `~/Projects/neviihub-feature-mobile-p0` · Branch: `feature/mobile-p0`
- Base: `origin/test` = `4c1b5999a945a8a44783e6708b7bdfb7b9f92a63` (başlangıçta HEAD == origin/test, çalışma ağacı temiz,
  `git diff --check` temiz, bu worktree'de başka yazan süreç yok).
- Commit/push/deploy/EAS build/store upload/DB yazımı YOK. Orphan worktree'lere yazılmadı.

## 1. Canonical Source

- **Source-of-truth: `apps/mobile`** (bu branch). Expo SDK 54, expo-router 6, RN 0.81, React 19.1.
- **Neden `origin/test`:** test kabulü almış güncel backend (NeviiOS Control Center rol sözleşmesi, HYPER_ADMIN,
  BRANCH_MANAGER + `access.managerPreset`, Karma Öğrenci Portalı = PARENT rolünün kaldırılması,
  `/api/v1/mobile/policy`) yalnız burada. Mobil contract bu backend'e karşı doğrulanmalı.
- **Parity durumu (başlangıç):** mobil `typecheck` ✓, mobil `vitest` 12 dosya / 80 test ✓. Ancak mobil auth katmanı
  backend'in **eski** rol sözleşmesini varsayıyordu:
  - Mobil `AppRole` içinde `PARENT` var, `HYPER_ADMIN`/`BRANCH_MANAGER` yok; backend'de `PARENT` rolü YOK
    (veli = `STUDENT` + `StudentPortalAccess.accessType = "GUARDIAN"`).
  - `roleToPersona` bilinmeyen rolleri (HYPER_ADMIN, BRANCH_MANAGER, AI_AGENT) **parent persona'sına düşürüyordu (fail-open)**.
  - Soğuk açılışta `/api/v1/auth/me` herhangi bir hatada (ağ dahil) token'ları siliyordu → çevrimdışı açılış = zorunlu çıkış.
  - Çıkış yalnız yerel token silme; sunucu oturumu (`sid`) kapatılmıyordu (logout route refresh'i yalnız cookie'den okuyor).
  - Refresh başarısız olunca token siliniyor ama auth state `signedIn` kalıyordu (ekranlar sonsuz 401 hatası).

## 2. Orphan Recovery Kararı

| Kaynak | Karar |
|---|---|
| `~/Projects/nevii-hub/.claude/worktrees/mobile-quality-fix` (MQF) | Source-of-truth DEĞİL. Yalnız seçilmiş P0 hunk kaynağı. Git metadata'sı kırık (`fatal: not a git repository … notaplan/.git/worktrees/mobile-quality-fix`) — **onarılmadı**, yalnız `diff -r` ile salt-okunur okundu. |
| `mobile-product-redesign` (MPR) | Archive-first. Bu sprintte hiçbir dosya okunmadı/alınmadı/merge edilmedi. |

Orphan worktree'lere yazma, taşıma, silme, `.git` onarımı YAPILMADI.

### 2.1 MQF fark sınıflandırması (`apps/mobile/app` + `apps/mobile/src`, diff yönü: canonical ↔ MQF)

MQF 2026-08-28 tarihli; canonical sonrasında lint/doğruluk düzeltmeleri (`05e0f1c`, `43ee05f`, `8dee8b0`,
`d588947`, `b0fcb78`) ve NotaPlan→Nevii Hub marka geçişi aldı. **Her farklı hunk'ta canonical daha yeni.**

| Dosya(lar) | MQF'teki hâl | Sınıf | Karar |
|---|---|---|---|
| `src/api/client.ts` | "[NotaPlan]" log öneki + gereksiz generic | P2 / eski | reject |
| `src/hooks/use-api.ts` | effect gövdesinde senkron `setState` (react-hooks/set-state-in-effect ihlali) | reject (regresyon) | reject |
| `src/lib/date.ts` (+test) | `isPast` yok | reject (regresyon) | reject |
| `app/(teacher)/bugun/[lessonId].tsx`, `ogrencilerim/[studentId].tsx`, `ui/homework-card.tsx`, `ui/task-card.tsx`, admin `yoklama.tsx`/`ogrenci/[id].tsx`/`ogretmen/[id]/index.tsx`, student-scope `gelisim/home/homework/lessons` | render sırasında `Date.now()` (canonical `useNow` + `isPast` ile düzeltti) | reject (regresyon) | reject |
| `ui/states.tsx` | `ErrorState` `code` prop'u yok (canonical'da FORBIDDEN/NOT_FOUND nötr ton) | reject (regresyon) | reject |
| `ui/screen.tsx`, `list-screen.tsx`, `teacher/odevler/index.tsx` | sabit `paddingBottom: 100` (canonical gerçek tab bar yüksekliğini ölçüyor) | P1 UX / eski | reject |
| `ui/avatar.tsx`, `ui/loading-skeleton.tsx`, `app/notifications.tsx` | effect'te senkron setState / render'da ref okuma | reject (regresyon) | reject |
| `theme/tokens.ts`, `teacher/bugun/index.tsx`, `student-scope/home-screen.tsx`, `package.json`, `app.json` | NotaPlan adı/slug/scheme/bundle id `com.notaplan.mobile` | P2 marka / eski | reject (bundle id'yi geri almak store kimliğini değiştirir) |
| `(admin)/ozet.tsx`, `(admin)/islemler/finans.tsx` | eski "Hoş geldiniz" başlığı / kullanılmayan import | P2 | reject |
| `(parent)/hesabim/iletisim-tercihi.tsx` | kullanılmayan `View` import'u | reject | reject (Muse alanı, dokunulmadı) |
| canonical-only: `hooks/use-now.ts`, `lib/__tests__/route-integrity.test.ts` | MQF'te yok | — | canonical korunur |

**Sonuç: MQF'ten alınan hunk sayısı = 0.** Açık P0 gerekçesi olan (canonical'da eksik, MQF'te doğru) tek bir hunk
bulunamadı. Kanıt: yukarıdaki her satır için `diff -u canonical MQF` çıktısında `+` (MQF) tarafı eski davranış.
Geri alma: gerek yok (hiçbir şey alınmadı).

## 3. Role → Mobile Persona Matrisi

Tek kaynak: `apps/mobile/src/auth/role-to-persona.ts` → `resolveMobilePersona(session)`. Girdi yalnız sunucu
yanıtıdır (`GET /api/v1/mobile/session`); istemci rol yükseltmez, tenant/şube kapsamı hesaplamaz.

| Login Role | Effective Role (sunucu) | Mobile Persona / Davranış | P0 Durumu | Güvenlik Kuralı |
|---|---|---|---|---|
| HYPER_ADMIN | HYPER_ADMIN | `unsupported` (`platform_web`): "Platform hesabı mobil kullanmaz — web'deki platform konsolunu kullanın" + çıkış | Tamam (fail-closed) | Mobil platform UI YOK; `/api/v1/mobile/policy` zaten 403 |
| SUPER_ADMIN | SUPER_ADMIN | `admin` — mevcut yönetici sekmeleri (yeni feature YOK) | Mevcut, P0 dışı geliştirme | Sunucu RBAC |
| SCHOOL_ADMIN | SCHOOL_ADMIN | `admin` — mevcut yönetici sekmeleri (yeni feature YOK) | Mevcut, P0 dışı geliştirme | Sunucu RBAC |
| BRANCH_MANAGER (unified) | SCHOOL_ADMIN | `unsupported` (`manager_web`): "Şube müdürü mobil portalı henüz yok — web paneli" | Tamam (fail-closed) | Login role'e bakılır; efektif SCHOOL_ADMIN admin sekmesine **açmaz**, TEACHER/STUDENT'a düşmez |
| BRANCH_MANAGER (branch_scoped) | BRANCH_MANAGER | `unsupported` (`manager_web`) | Tamam (fail-closed) | Kurum geneli API'ler sunucuda zaten 403; istemci şube kapsamı tahmin etmez |
| TEACHER | TEACHER | `teacher` | P0 (bu sprint) | Her tool `ctx.teacherId` sahipliği doğrular |
| STUDENT (+ `accessType=SELF`) | STUDENT | `student` | P0 (Muse UI) | `canAccessStudent` + StudentPortalAccess |
| STUDENT (+ `accessType=GUARDIAN`) = veli | STUDENT | `parent` | P0 (Muse UI) | Veli yalnız ilişkili öğrenci; SELF-only işlemler (ödev teslimi, foto) sunucuda reddedilir |
| STUDENT (aktif erişim kaydı yok) | STUDENT | `unsupported` (`no_portal_access`) | Tamam (fail-closed) | Sessizce student'a birleştirilmez |
| (legacy) PARENT | — | backend artık üretmez; gelirse `parent` | Uyumluluk | — |
| AI_AGENT | AI_AGENT | `unsupported` (`no_mobile_persona`) | Tamam (fail-closed) | — |
| Bilinmeyen rol | — | `unsupported` (`no_mobile_persona`) | Tamam (fail-closed) | Asla fail-open |

## 4. API/Auth Contract Matrisi

| Mobil Akış | Endpoint/Service | Auth | Tenant Scope | Role Scope | Durum | P0 Risk |
|---|---|---|---|---|---|---|
| Login | `POST /api/v1/auth/login` → `{user, accessToken, refreshToken}` | public, rate-limit (IP 20 / IP+e-posta 5 / 15 dk) | JWT | user.role = **login role** | Mevcut | 401 metni İngilizce → mobil Türkçe eşler |
| Me/session | **YENİ** `GET /api/v1/mobile/session` → `{userId, role, loginRole, tenantId, teacherId?, studentId?, portalAccessType}` | Bearer | JWT | effective + login role; BRANCH_MANAGER dahil yanıtlanır | Bu sprintte eklendi (additive, salt-okunur) | — |
| Me (eski) | `GET /api/v1/auth/me` | Bearer | JWT | yalnız effective role döner (loginRole yok) | Mevcut; mobil artık kullanmıyor | BRANCH_MANAGER unified'ı ayırt edemez |
| Refresh | `POST /api/v1/auth/refresh {refreshToken}` | public | kullanıcı kaydından yeniden | rol her refresh'te güncel | Mevcut | revoked `sid` → 401; mobil logout'a düşer |
| Logout | `POST /api/v1/auth/logout {refreshToken}` | public | — | — | Bu sprintte body `refreshToken` desteği eklendi (imza doğrulanmadan `sid`'e güvenilmez) | Önceden mobil sunucu oturumunu kapatamıyordu |
| Şifre değiştir | `POST /api/v1/auth/change-password` | Bearer | JWT | kendi hesabı | Mevcut (`hesabim/sifre-degistir`) | — |
| Şifremi unuttum | `POST /api/v1/auth/forgot-password`, `reset-password` | public | — | — | Mevcut ekran | Gerçek e-posta test ortamında gönderilmemeli |
| Student program/ders | `GET /api/v1/students/:id/schedule` | Bearer | JWT | `canAccessStudent` | Mevcut | — |
| Teacher program/ders | `GET /api/v1/teachers/:teacherId/schedule` | Bearer | JWT | `canAccessTeacher` | Mevcut | teacherId yalnız sunucu yanıtından |
| Teacher öğrenci listesi | `GET /api/v1/teachers/:teacherId/students` | Bearer | JWT | `canAccessTeacher` + `ownStudents` | Mevcut | — |
| Teacher öğrenci detayı | `GET /api/v1/students/:id` (+ `/score`, `/homework`, `/curriculum`) | Bearer | JWT | `canAccessStudent` | Mevcut | — |
| Teacher yoklama | `POST /api/v1/lessons/:lessonId/ops {flag, confirmSwitch?}` | Bearer | JWT | TEACHER yalnız kendi dersi | Mevcut; sunucu `alreadySet` ile doğal idempotent, idempotency-key YOK | Statü değişimi `needsConfirmation` döner — mobil önceden yok sayıyordu (düzeltildi) |
| Ders başlat/bitir | `POST /api/v1/lessons/:lessonId/start`, `/end` | Bearer | JWT | TEACHER | Mevcut | — |
| Teacher telafi | `GET /api/v1/makeup` (closeout'ta eklendi, salt-okunur) | Bearer | JWT | TEACHER kendi · STUDENT aktif erişim · admin kurum · HYPER/BM/AI 403 | Tamam | — (bkz. MOBILE_API_ROUTE_DECISIONS.md) |
| Teacher ödev | `GET /api/v1/homework/mine`, `POST /api/v1/homework`, `/homework/:id/*` | Bearer | JWT | `homework:write` | Mevcut | — |
| Teacher materyal | `GET /api/v1/teaching-materials/mine`, `POST /api/v1/teaching-materials` | Bearer | JWT | `materials:write` | Mevcut | Dosya yükleme mevcut akış; yeni fake upload yok |
| Teacher Hakediş | `GET /api/v1/teachers/:teacherId/payouts` | Bearer | JWT | TEACHER yalnız kendi (`canAccessTeacher` + `ownPayouts`) | Mevcut, salt-okunur | Mobilde hesaplama/ödeme aksiyonu yok |
| Student ödeme | `GET /api/v1/students/:id/balance`, `/api/v1/payments/:id/receipt` | Bearer | JWT | `canAccessStudent` | Mevcut, salt-okunur | Gerçek ödeme akışı yok |
| Notifications | `GET/POST /api/v1/notifications` | Bearer | JWT | `notifications:read` | Mevcut | Push sağlayıcı bağlı değil (policy `providerConfigured:false`) |
| Mobile policy/config | `GET /api/v1/mobile/policy?platform&appVersion` | Bearer | JWT | HYPER_ADMIN 403 | Backend mevcut; **mobil henüz tüketmiyor** | P1: bakım/min sürüm kapısı |
| Network error | istemci `src/api/errors.ts` | — | — | — | Bu sprintte standartlaştı | — |

### 4.1 Backend'de karşılığı olmayan mobil yollar (kanıt: `apps/mobile/src/api/__tests__/api-contract.test.ts`)

`src/app/api/v1/**/route.ts` taraması (route group / catch-all yok; `git log --all` bu yollarda hiç route kaydı
bulmadı — hiç var olmamışlar). **Hiçbiri öğretmen portalında değil.**

| Yol | Kullanan ekran | Sahip | Önem |
|---|---|---|---|
| ~~`GET /api/v1/makeup`~~ | — | — | **Closeout: route eklendi** |
| ~~`/api/v1/absence-notices`, `/:id`~~ | — | — | **Closeout: domain yok → mobil stale çağrı kaldırıldı** |
| ~~`/api/v1/payments/:id/receipt`~~ | — | — | **Closeout: route eklendi** |
| `/api/v1/dashboard/summary`, `branches`, `rooms`, `instruments`, `lessons`, `lessons/:id/reassign`, `homework/report`, `students/:id/documents`, `students/:id/social-media-consent`, `teachers/payouts/:id/mark-paid` | admin sekmeleri | — | post-launch (yönetici mobil kapsam dışı) |

Hata eşlemesi (mobil, Türkçe): 401 → oturum süresi doldu (refresh başarısızsa güvenli çıkış) · 403 → yetki/kapsam dışı
· 404 → bulunamadı · 429 → çok fazla deneme · 5xx → sunucu hatası · ağ → bağlantı kurulamadı · 400/409 → sunucunun iş
kuralı mesajı (Türkçe domain mesajları) korunur.

## 5. Öğretmen Mobil P0 Scope

| Madde | Durum |
|---|---|
| Login/logout/session refresh | Tamam (sunucu oturumu da kapanır) |
| Bugünkü dersler / yaklaşan / yoklama bekleyen | Tamam (yoklama bekleyen bölümü eklendi) |
| Haftalık program | Mevcut (`bugun/hafta`) |
| Ders detayı | Mevcut; kapsam dışı ders → "Ders bulunamadı" (sahte veri yok) |
| İzinli öğrenci listesi/detayı | Mevcut (sunucu `ownStudents`) |
| Yoklama + double-submit koruması | Tamam (tek uçuşta kilit, tüm butonlar kilitli, onay diyaloğu, ağ hatasında "kaydedildi" yok) |
| Telafi | **Blocker**: öğretmen kapsamlı telafi liste endpoint'i yok → UI uydurulmadı |
| Ödev/materyal | Mevcut API ile mevcut ekranlar |
| Hakediş (salt-okunur) | Mevcut, sunucu kaynaklı |
| Bildirimler | Mevcut (`/notifications`) |
| Hesap/profil/logout/şifre | Mevcut |
| Loading/empty/error/network | Ortak `ErrorState` + Türkçe hata eşlemesi |

## 6. P0 Dışı Scope

Yönetici mobil portal yeni özellikleri · öğrenci/öğretmen web portal genişletmeleri · gerçek ödeme/payout/banka ·
gerçek WhatsApp/SMS/push gönderimi · gelişmiş offline sync · public store release garantisi · branch-scoped Hakediş ·
mobile-product-redesign toptan merge · `/api/v1/mobile/policy` istemci entegrasyonu (P1).

## 7. Uygulanan değişiklikler

Tam dosya listesi: `docs/mobile/MOBILE_P0_HANDOFF.md` §1. Özet:

- **Auth/persona:** `resolveMobilePersona` (fail-closed) + `GET /api/v1/mobile/session` (yeni, additive) ile login role /
  effective role / portal erişim türü sunucudan; BRANCH_MANAGER ve HYPER_ADMIN güvenli "desteklenmiyor" ekranı.
- **Session:** soğuk açılışta ağ/5xx hatası artık çıkış yaptırmaz ("oturum doğrulanamadı · tekrar dene"); refresh
  başarısızsa otomatik çıkış; çıkışta sunucu oturumu kapatılır (logout route gövdede `refreshToken` kabul eder);
  çıkış sonrası geç dönen refresh token yazamaz.
- **Hata eşlemesi:** 401/403/404/429/5xx/ağ → sabit Türkçe mesaj (`src/api/errors.ts`).
- **Öğretmen:** yoklama tek uçuş kilidi + tüm butonlar kilitli + `needsConfirmation` onay diyaloğu + yalnız sunucu
  `ok`'unda "kaydedildi"; ana sayfada "Yoklama bekleyen dersler" (son 14 gün).
- **MQF:** 0 hunk alındı (§2.1).

Test kanıtı: mobil `tsc` ✓ · mobil vitest 15 dosya / 108 test ✓ (başlangıç 12/80) · root
`mobile-session-route` + `logout-route` 10/10 ✓ · root `typecheck` ✓ · `prisma validate` ✓ · `git diff --check` ✓.
Geri alma: tüm değişiklikler commit'lenmemiş çalışma ağacında; dosya bazında `git restore`/silme ile geri alınabilir,
DB/migration yok.
