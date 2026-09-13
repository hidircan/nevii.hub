# Mobil P0 — Handoff (Claude → Muse / entegrasyon)

- Tarih: 2026-09-13 · Branch: `feature/mobile-p0` (base `origin/test` @ `4c1b599`).
- Tüm Mobil P0 işi TEK local commit'te: `feat(mobile): close P0 API contracts and teacher readiness`
  (push YOK). Route kararları: `docs/mobile/MOBILE_API_ROUTE_DECISIONS.md`.

## Muse Cherry-Pick Handoff

- **Cherry-pick edilecek commit:** `feature/mobile-p0` üzerindeki `feat(mobile): close P0 API contracts and teacher readiness`
  commit'i. SHA'yı commit içinden yazmak mümkün değil (commit kendi hash'ini içeremez); kesin SHA son raporda
  verilmiştir ve şu komutla doğrulanır: `git log -1 --format=%H feature/mobile-p0`.
- Uygulama: `git cherry-pick <SHA>` (Muse branch'i de `origin/test` tabanlı olmalı).

### Canonical rol/persona davranışı

| Login role | portalAccessType | Persona |
|---|---|---|
| STUDENT | SELF | `student` |
| STUDENT | GUARDIAN | `parent` (veli) |
| STUDENT | null (aktif erişim yok) | unsupported (fail-closed) |
| TEACHER | — | `teacher` |
| SUPER_ADMIN / SCHOOL_ADMIN | — | `admin` (mevcut sekmeler, yeni feature yok) |
| HYPER_ADMIN / BRANCH_MANAGER (unified + branch_scoped) / AI_AGENT / bilinmeyen | — | unsupported (fail-closed) |

- **Backend'de PARENT login rolü yoktur.** Mobil `AppRole` artık `"PARENT"` içermez; `resolveMobilePersona({role:"PARENT"})`
  fail-closed döner. `user.role === "PARENT"` yazmak **yasak** — mobil testi (`role-to-persona.test.ts`) kaynakta
  bu deseni bulursa kırılır.
- Veli/öğrenci ayrımı: `personaOf(user) === "parent"` veya `user.portalAccessType === "GUARDIAN"`.

### Guardian homework CTA hatası — düzeltildi (bu commit'te)

`src/features/student-scope/homework-screen.tsx`: `canStudentSubmit = personaOf(user) === "student" && …`;
veli metni `isGuardian = personaOf(user) === "parent"`. Veli artık "teslim et" görmez (sunucu zaten 403 veriyordu).
PARENT tipinin kaldırılması bu dosyada derleme hatası üreteceği için minimum değişiklik burada yapıldı.

### Öğrenci/veli için servis / hook / fallback sözleşmesi

```ts
import { useAuth, personaOf } from "../../src/auth/auth-context";
import { useMakeupRequests, usePaymentReceipt, MOBILE_ENDPOINTS } from "../../src/api/hooks";
import { FEATURE_UNAVAILABLE, type ApiError } from "../../src/api/errors";

const makeup = useMakeupRequests();            // GET /api/v1/makeup → { makeupRequests: MakeupRequest[] }
const receipt = usePaymentReceipt(paymentId);  // GET /api/v1/payments/:id/receipt → PaymentReceiptResponse
// Her ikisi useApiGet durumu döner: { status: "loading" } | { status: "error", message, code } | { status: "success", data }
// <ErrorState message={x.message} code={x.code} onRetry={x.refresh} />
```

| Özellik | Sözleşme | UI davranışı |
|---|---|---|
| Telafi | `useMakeupRequests()`; sunucu SELF → kendi, GUARDIAN → bağlı öğrenci(ler) | Liste; boşsa EmptyState; `MakeupRequest.status` domain değeri (`makeupStatusBadge` ile etiket, `src/lib/makeup-view.ts`) |
| Makbuz | `usePaymentReceipt(id)` → `{eligible:true, receipt}` veya `{eligible:false, ineligibleReason}`; başka öğrencinin ödemesi 403, yok 404 | `eligible:false` → `ineligibleReason` metni; 403/404 → nötr ErrorState |
| Devamsızlık bildirimi | **Backend'de yok.** Çağrı kaldırıldı. | Gerekiyorsa `FEATURE_UNAVAILABLE.message` ile bilgilendirme; sahte form/bildirim YOK |
| Ödeme | Salt-okunur (`/students/:id/balance`); ödeme başlatma/kart/banka CTA'sı YOK | — |

Hata kodları (`src/api/errors.ts`): 401 `UNAUTHORIZED` (istemci refresh dener, olmazsa otomatik çıkış) · 403
`FORBIDDEN` · 404 `NOT_FOUND` · 429 `RATE_LIMITED` · 5xx `SERVER_ERROR`/`INTERNAL_ERROR` · `NETWORK_ERROR` ·
`FEATURE_UNAVAILABLE`. Mesajlar Türkçe; ekranda yeniden çevirme.

### Muse'un dokunmaması gereken shared dosyalar

`apps/mobile/src/auth/**`, `apps/mobile/src/api/**` (hooks.ts dahil), `apps/mobile/src/types/api.ts` (ekleme gerekiyorsa
not düş), `apps/mobile/src/components/persona-guard.tsx`, `apps/mobile/app/index.tsx`, `apps/mobile/app/_layout.tsx`,
`apps/mobile/app/(teacher)/**`, `apps/mobile/src/lib/{attendance,makeup-view}.ts`, `apps/mobile/app.json`,
`apps/mobile/assets/**`, `apps/mobile/eas.json`, `src/app/api/v1/{mobile,makeup,auth}/**`,
`src/app/api/v1/payments/[paymentId]/receipt/**`, `src/lib/services/mobile-read.ts`.

Bu commit'in Muse alanına yakın dokunduğu dosyalar (çakışma adayı): `src/features/student-scope/homework-screen.tsx`
(guardian CTA), `src/features/student-scope/lessons-screen.tsx` (stale absence çağrısı kaldırıldı).
`app/(student)/**`, `app/(parent)/**`, `src/features/{student,parent}/**` DEĞİŞTİRİLMEDİ.

### Guardian Device UAT Prerequisite

Gerçek cihazda veli persona'sını test etmek için test ortamında (production DEĞİL) şunlar hazır olmalı — bu turda
hiçbir DB'ye yazılmadı:

1. Login role = `STUDENT` olan, gerçek bir kişiye ait OLMAYAN test hesabı (ör. `veli.uat@<test-domain>`).
2. Bu hesap için `StudentPortalAccess` kaydı: `accessType = "GUARDIAN"`, `status = "active"`, test tenant'ında.
3. Kaydın bağlı olduğu öğrenci test tenant'ında gerçekten var (sunucu ilişkiyi `hasActiveStudentAccess` ile doğrular).
4. Kurulum yalnız canonical yönetim akışıyla (kurum yöneticisinin veli daveti / portal erişimi) — SQL/seed ile değil.
5. Parola, token veya davet bağlantısı hiçbir dokümana/Git'e yazılmaz; hesap bilgisi owner'dan güvenli kanalla alınır.
6. Doğrulama: mobilde giriş → `GET /api/v1/mobile/session` yanıtında `portalAccessType: "GUARDIAN"` → Veli sekmeleri.
7. Mevcut gerçek kullanıcı hesapları (ör. Selin) değiştirilmez. Not: json/memory demo verisinde erişim kayıtları
   paylaşımlı test store'undan geldiği için demo hesapların SELF/GUARDIAN sonucu değişebilir — UAT bu hesaplara dayanmamalı.

## Değişen dosyalar (özet)

- Backend: `src/app/api/v1/mobile/session/route.ts`, `src/app/api/v1/makeup/route.ts`,
  `src/app/api/v1/payments/[paymentId]/receipt/route.ts`, `src/lib/services/mobile-read.ts`,
  `src/app/api/v1/auth/logout/route.ts` (gövdede `refreshToken`).
- Mobil shared: `src/auth/{auth-context.tsx,role-to-persona.ts,session-status.ts}`, `src/api/{client,errors,hooks}.ts`,
  `src/types/api.ts`, `src/components/persona-guard.tsx`, `app/index.tsx`, `src/features/account/account-screen.tsx`.
- Öğretmen: `app/(teacher)/telafi.tsx` (yeni), `_layout.tsx`, `bugun/index.tsx`, `bugun/[lessonId].tsx`, `hesabim/index.tsx`,
  `src/lib/{attendance,makeup-view}.ts`.
- Asset/config: `apps/mobile/assets/{icon,adaptive-icon}.png`, `app.json`, `eas.json`.
- Testler: mobil `src/api/__tests__/{client,errors,api-contract}.test.ts`, `src/auth/__tests__/role-to-persona.test.ts`,
  `src/lib/__tests__/{attendance,makeup-view,app-assets}.test.ts`; root `src/lib/__tests__/{mobile-session-route,mobile-read-tools,mobile-read-routes}.test.ts`.

## Merge / entegrasyon

1. Bu commit review edilir (push/merge owner kararı).
2. Muse cherry-pick eder; çakışma adayı yalnız student-scope'taki iki dosya.
3. Birleşik ağaçta: `cd apps/mobile && npx tsc --noEmit && npx vitest run`; root
   `npx vitest run src/lib/__tests__/mobile-*.test.ts`.
