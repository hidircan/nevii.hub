# Şifre Sıfırlama — Güvenlik Tasarımı ve Audit

**Tarih:** 2026-09-08 · **Branch:** `infra/vercel-test-environment`
**Kapsam:** "Şifremi unuttum" akışının mevcut durumu, güvenlik özellikleri ve
bu turda yapılan değişiklik.

> **AUDIT SONUCU — ÖZET:** Backend akış **zaten vardı ve güvenliydi**. Eksik
> olan tek şey kullanıcının kodu isteyebileceği ARAYÜZ adımıydı:
> `/api/v1/auth/forgot-password` uç noktası UI'dan **hiç çağrılmıyordu**, kod
> ancak bir yönetici sıfırlama tetiklerse geliyordu. Bu turda yalnızca o adım
> ve giriş ekranındaki bağlantı eklendi — **yeni token/mail altyapısı
> KURULMADI**, mevcut altyapı yeniden kullanıldı.

---

## 1. Mevcut bileşenler (audit)

| Katman | Dosya | Durum |
|---|---|---|
| Token deposu | `src/lib/auth/password-reset.ts` | ✅ var |
| Talep ucu | `src/app/api/v1/auth/forgot-password/route.ts` | ✅ var |
| Sıfırlama ucu | `src/app/api/v1/auth/reset-password/route.ts` | ✅ var |
| Sıfırlama sayfası | `src/app/sifre-sifirla/page.tsx` | ✅ var |
| Form | `src/components/reset-password-form.tsx` | ⚠️ yalnız "kod + yeni şifre" adımı vardı → **talep adımı eklendi** |
| Giriş ekranı bağlantısı | `src/components/login-form.tsx` | ❌ yoktu → **eklendi** |
| E-posta gönderimi | `src/lib/auth/invitation.ts` → `sendPasswordResetEmail` | ✅ var (davet akışıyla AYNI fonksiyon) |
| Mail taşıyıcı | `src/lib/email/*` | ✅ var (`smtp` \| `console`) |
| Testler | `src/lib/__tests__/password-reset.test.ts` | ✅ var |

---

## 2. Güvenlik özellikleri (kodda DOĞRULANDI)

### 2.1 Enumeration koruması
`forgot-password` hesap var/yok fark etmeksizin **aynı nötr metni** döner:
> "Bu e-posta adresine kayıtlı bir hesap varsa, şifre sıfırlama talimatları gönderildi."

Rate limit aşıldığında da **aynı nötr yanıt** döner — limitin devreye
girdiği bile sızdırılmaz. E-posta gönderimi hata verirse yanıt yine
değişmez; hata yalnız sunucuda loglanır.

### 2.2 Token
- **Tek kullanımlık:** `consumePasswordResetToken` doğrular ve `usedAt` yazar.
- **Kısa ömürlü:** 30 dakika (`TOKEN_TTL_MS`).
- **DB'de HASH saklanır:** `sha256(token)`; ham token yalnızca üretildiği
  yanıtta bir kez dolaşır, **asla saklanmaz/loglanmaz**.
- **Önceki tokenlar geçersizleşir:** yeni talep, aynı kullanıcının
  kullanılmamış tüm tokenlarını `usedAt` ile kapatır.
- **Elle yazılabilir kod:** karışabilen karakterler (0/O, 1/I/L) hariç
  32 harfli alfabeden 8 karakter → ~40 bit entropi. Deep-link değil,
  kullanıcı koda elle de girebilir.
- **Mod paritesi:** `db` → Prisma `PasswordResetToken`; `json`/`memory` →
  dosya tabanlı, AYNI sözleşme.

### 2.3 Rate limit
| Uç | Anahtar | Limit |
|---|---|---|
| `forgot-password` | e-posta | 5 / 15 dk |
| `forgot-password` | IP | 20 / 15 dk |
| `reset-password` | IP | 10 / 15 dk |
| `login` | IP+e-posta | 5 / 15 dk |
| `login` | IP | 20 / 15 dk |

> **Bilinen sınır:** limitleyici **süreç-içi bellektedir**
> (`src/lib/auth/password-reset.ts` `attemptLog`). Serverless'ta her lambda
> örneği kendi sayacını tutar ve yeniden başlatma sayacı sıfırlar; yani limit
> gerçek bir dağıtık kota DEĞİL, kaba bir yavaşlatmadır. Dağıtık limit
> (Redis/Upstash veya DB tabanlı) ayrı bir altyapı kararıdır — §7'de listeli.

### 2.4 Audit
- Talep: `auth.password_reset_requested` (userId, tenantId, role, requestId).
- Sıfırlama: `reset-password` ucunda `auditLog` çağrılır.
- Ham token hiçbir audit kaydına yazılmaz.

### 2.5 Tenant / kullanıcı kapsamı
Token satırı `tenantId` + `userId` taşır; `consumePasswordResetToken` ikisini
birlikte döner ve şifre yalnızca o kullanıcı için güncellenir. Çapraz tenant
kullanım mümkün değildir.

---

## 3. Sıfırlama sonrası oturum davranışı — AÇIK MADDE

`reset-password` başarıyla tamamlandığında `buildPasswordSetupSessionResponse`
ile kullanıcıya **yeni bir oturum verilir** (davet/şifre-belirleme akışıyla
aynı desen; kullanıcı tekrar giriş yapmak zorunda kalmaz).

**Mevcut durumda, o kullanıcının BAŞKA cihazlardaki mevcut refresh/access
token'ları geçersizleştirilmez.** "Şifre değişti → tüm oturumları düşür"
davranışı bu kod tabanında YOKTUR.

Bu, çalınmış bir oturumun şifre değişiminden sonra da yaşamaya devam etmesi
demektir. Önerilen çözüm (uygulanmadı, §7): `User` üzerinde bir
`sessionsValidFrom` (veya `tokenVersion`) alanı; JWT doğrulaması bu değeri
kontrol eder, şifre değişiminde ileri alınır. **Şema değişikliği gerektirir
→ migration → bu turun kapsamı dışı.**

---

## 4. E-posta davranışı ve ortam güvenliği

`src/lib/email/config.ts` sağlayıcıyı **fail-safe** seçer:
`EMAIL_PROVIDER` verilmemişse, `SMTP_HOST`+`SMTP_USER`+`SMTP_PASS` üçü de
tanımlıysa `smtp`, aksi hâlde **`console`**.

| Ortam | Beklenen davranış |
|---|---|
| Yerel geliştirme | `console` — mail gönderilmez, içerik sunucu log'una yazılır. `NODE_ENV !== "production"` iken yanıt gövdesine `devResetToken` eklenir (UI bunu **ekrana basmaz**). |
| **Test / Preview** | **`console` KALMALIDIR.** SMTP kimlik bilgileri preview'a TANIMLANMAMALIDIR — aksi hâlde test verisindeki gerçek adreslere gerçek e-posta gider. Kod bunu zaten sağlar (kimlik bilgisi yoksa `console`), ama bu bir **ortam disiplinidir**: preview'a SMTP eklenirse koruma kalkar. |
| Production | `smtp` — gerçek sağlayıcı, SPF/DKIM/DMARC yapılandırılmış bir gönderen alan adı, teslimat izleme. |

### Gerçek e-posta göndermeden test yaklaşımı
- **Birim/entegrasyon:** `setEmailTransportForTests` (`src/lib/email/index.ts`)
  ile taşıyıcı değiştirilir; gönderilen mesaj bellekte yakalanır ve içeriği
  (alıcı, konu, kodun varlığı) doğrulanır. Ağ çıkışı YOKTUR.
- **Uçtan uca (yerel):** `console` sağlayıcı + `NODE_ENV!=="production"`
  yanıtındaki `devResetToken` ile akış tamamlanabilir; bu token
  **production'da hiçbir zaman** üretilmez.
- **Preview:** gerçek gönderim beklenmez; akış "kod elle girilir" yolundan
  doğrulanır (form zaten elle kod girişini destekler).

---

## 5. Bu turda yapılan değişiklik (dar kapsam)

1. `login-form.tsx` → "Şifremi unuttum" bağlantısı (`/sifre-sifirla`).
2. `reset-password-form.tsx` → **talep adımı**: e-posta al, mevcut
   `/api/v1/auth/forgot-password` ucunu çağır, dönen **nötr** metni göster,
   sonra kod+şifre adımına geç. "Kodum var, devam et" ile adım atlanabilir.
3. `devResetToken` **ekrana basılmaz** (yalnız yanıt gövdesinde, yalnız
   production dışında bulunur).

Backend, token şeması, mail altyapısı ve rate limit **DEĞİŞMEDİ**.

---

## 6. Test planı

| Senaryo | Nerede |
|---|---|
| Var olmayan e-posta ile talep → nötr yanıt, token üretilmez | `password-reset.test.ts` (mevcut) |
| Token tek kullanımlık; ikinci kullanım reddedilir | mevcut |
| Süresi dolmuş token reddedilir | mevcut |
| Yeni talep, önceki kullanılmamış tokenı geçersiz kılar | mevcut |
| Token DB'de hash olarak saklanır (ham hâli yok) | mevcut |
| Giriş ekranında "Şifremi unuttum" bağlantısı var | **yeni** `password-reset-ui.test.ts` |
| Talep adımı `forgot-password` ucunu çağırır | **yeni** |
| UI nötr metni gösterir, hesap varlığını sızdırmaz | **yeni** |
| `devResetToken` arayüzde gösterilmez | **yeni** |

---

## 7. OPEN ITEMS — operatör/owner kararı gerektirenler

| # | Konu | Neden bu turda yapılmadı |
|---|---|---|
| 1 | **Şifre değişiminde diğer oturumların düşürülmesi** (`tokenVersion` / `sessionsValidFrom`) | Şema değişikliği + migration gerektirir; bu turda migration yasak. Güvenlik açısından ÖNEMLİ. |
| 2 | **Dağıtık rate limit** (bellek yerine Redis/DB) | Serverless'ta süreç-içi sayaç güvenilir kota değil. Altyapı kararı. |
| 3 | **Production SMTP + SPF/DKIM/DMARC** | Production'a dokunulmadı. Doğrulanmış gönderen alan adı gerekir. |
| 4 | **Preview'a SMTP kimlik bilgisi TANIMLANMAMASI** | Ortam disiplini; kod fail-safe ama env ile bozulabilir. |
| 5 | Token TTL (30 dk) ve kod uzunluğu (8 karakter, ~40 bit) yeterli mi | Ürün/güvenlik tercihi. |
| 6 | Sıfırlama sonrası kullanıcıya **otomatik oturum** verilmesi mi, yoksa yeniden girişe zorlanması mı | Mevcut davranış: oturum verilir. Owner kararı. |
