# Şube Özeti ve Rol Modeli — Tasarım

**Tarih:** 2026-09-08 · **Branch:** `infra/vercel-test-environment`
**Durum:** TASARIM. Bu turda **hiçbir kod uygulanmadı, migration
oluşturulmadı/çalıştırılmadı, test DB'ye yazılmadı.**

Kaynak talep (owner UAT 2026-09-08): (4) Özet ekranında şubelere göre ayrı
özet bilgiler; (5) "kurum sahibi" ile "kurum müdürü" ayrı roller olmalı.

---

## 1. Mevcut durum (audit)

### 1.1 Roller
`src/lib/auth/types.ts` → `APP_ROLES` **beş** değer taşır:

```
SUPER_ADMIN · SCHOOL_ADMIN · TEACHER · STUDENT · AI_AGENT
```

- **Kurum sahibi / kurum müdürü ayrımı YOK.** Kurum tarafındaki her yetkili
  tek bir `SCHOOL_ADMIN` rolüyle temsil ediliyor.
- `STUDENT` hem öğrenci hem veli demek; ayrım rol değil,
  `StudentPortalAccess.accessType` (`GUARDIAN` | `SELF`) ile yapılıyor.
- İzinler `src/lib/auth/rbac.ts` içinde **rol → izin listesi** (`ROLE_PERMISSIONS`)
  biçiminde; 48 adet `Permission` tanımlı. Kapsam **yalnızca yetenek**
  düzeyinde — kaynak/şube düzeyinde değil.

### 1.2 Şube erişimi
- `User` modelinde **hiçbir şube alanı YOK** (`prisma/schema.prisma:77`):
  yalnız `tenantId`, `role`, `teacherId`, (deprecated) `studentId`.
  → **Bugün bir kullanıcıyı şubeye atamak MÜMKÜN DEĞİL.**
- Çoklu şube yalnızca `Teacher.branchIds` (Json) ile öğretmen için var.
- `Branch` modeli `tenantId` + `schoolId` altında; `teachers`, `students`
  ilişkileri mevcut.

### 1.3 Kurum ("kurum") kapsamı
`src/lib/institution/context.ts` → `getInstitutionContext(session)` +
`readScopedData(scope)`. `SUPER_ADMIN` birden çok kurumu **salt okunur,
birleşik** görebilir; her yazma tek bir tenant'a çözülür. Bu katman
**tenant** düzeyindedir, **şube** düzeyinde bir karşılığı yoktur.

### 1.4 Dashboard (`/panel`)
Tek bir `readScopedData(kurum.scope)` çağrısı ile tenant'ın TÜM verisi
okunur; tüm metrikler JS'te hesaplanır:
`getDashboardStats`, bugünkü dersler, açık telafiler, geciken/kısmi ödemeler,
toplam alacak, bekleyen yoklamalar, öğretmen hakediş özeti, kurulum ilerlemesi.

**Şube kırılımı YOKTUR.** Ayrıca bu, ölçülmüş bir performans borcudur:
route başına 1 tam-tenant okuması (db modunda ~500 ms @163 ms RTT —
bkz. `docs/performance/UAT_P0_2026_09_07_REPORT.md` §2).

---

## 2. Hedef rol modeli

### 2.1 Rol katmanları

| Katman | Rol | Kapsam | Not |
|---|---|---|---|
| Platform | `SUPER_ADMIN` | Tüm tenantlar | **Neviios Control Center**. Kurum içi bir rol DEĞİLDİR. |
| Kurum | `INSTITUTION_OWNER` (kurum sahibi) | Tek tenant, **tüm şubeler** | Kurum geneli yönetim, finans/personel özeti, rol & şube yönetimi, abonelik/paket |
| Kurum | `BRANCH_MANAGER` (kurum müdürü) | Tek tenant, **atandığı şube(ler)** | Günlük operasyon |
| Kurum | `STAFF` (personel) | Atandığı şube(ler) | Dar operasyon (ör. sekreterya) — *owner kararı, bkz. §8* |
| Kurum | `TEACHER` | Kendi dersleri | Değişmiyor |
| Dış | `STUDENT` | Kendi/velisi olduğu öğrenci | Değişmiyor (`accessType` ile veli/öğrenci) |
| Sistem | `AI_AGENT` | Tool Layer üzerinden | Değişmiyor |

> `SCHOOL_ADMIN` **kaldırılmaz**: geriye dönük uyumluluk için korunur ve
> `INSTITUTION_OWNER`'a eşdeğer sayılır (bkz. §6).

### 2.2 Kurum sahibi vs kurum müdürü — kesin fark

| Yetenek | Kurum sahibi | Kurum müdürü |
|---|---|---|
| Şube oluşturma / düzenleme / kapatma | ✅ | ❌ |
| Kurum içi rol atama, şube erişimi verme | ✅ | ❌ |
| Abonelik / paket / faturalama | ✅ | ❌ |
| **Finans özeti** (kurum geneli ciro, alacak, hakediş) | ✅ tüm şubeler | ❌ |
| **Personel özeti** (maaş/hakediş/özlük) | ✅ | ❌ |
| Ödeme tahsilatı (operasyonel) | ✅ | ✅ *yalnız kendi şubesi* |
| Öğrenci/öğretmen/ders/program/yoklama/telafi | ✅ tüm şubeler | ✅ *yalnız kendi şubesi* |
| Sözleşme oluşturma/görüntüleme | ✅ | ✅ *yalnız kendi şubesi* |
| Kurum ayarları (isim, logo, dönem, politika) | ✅ | ❌ |
| Veri dışa aktarım (kurum) | ✅ | ❌ |
| Denetim kaydı görüntüleme | ✅ | ❌ *(owner kararı, §8)* |

---

## 3. Şube erişim modeli

**Bir kullanıcı bir veya birden fazla şubeye atanabilir.**

Önerilen ilişki (yeni tablo — `Teacher.branchIds` Json'ı TEKRAR ETMEZ,
onu zamanla bu tabloya taşımak ayrı bir iştir):

```
UserBranchAccess
  id        String  @id
  tenantId  String
  userId    String
  branchId  String
  createdAt DateTime
  @@unique([tenantId, userId, branchId])
  @@index([tenantId, userId])
  @@index([tenantId, branchId])
```

Kurallar:
- `INSTITUTION_OWNER` için satır **gerekmez** — tanım gereği tüm şubeler.
- `BRANCH_MANAGER` / `STAFF` için **en az bir satır zorunludur**; hiç satırı
  yoksa erişim **fail-closed** (hiçbir şube) olmalıdır — "hepsi" DEĞİL.
- Şube listesi **oturumdan/DB'den** çözülür, istemciden gelen `branchId`'ye
  ASLA güvenilmez (mevcut tenant kuralının aynısı).

### 3.1 Sorgu kuralı (tenant + branch scoped)
Bugün her sorgu `tenantId` ile kapsanıyor. Yeni kural:

```
where: { tenantId, ...(scope.branchIds ? { branchId: { in: scope.branchIds } } : {}) }
```

`scope.branchIds === null` yalnız kurum sahibi/SUPER_ADMIN için üretilir.
Kapsam çözümü tek bir yerde olmalı (`src/lib/institution/context.ts` yanında
`resolveBranchScope(session)`), Tool Layer'daki her okuma/yazma bunu kullanmalı.

---

## 4. Dashboard: şube kırılımı

### 4.1 Metrik → rol görünürlüğü

| Metrik | Sahip | Müdür | Öğretmen |
|---|---|---|---|
| Bugünkü ders sayısı | tüm şubeler + şube kırılımı | yalnız kendi şubeleri | kendi dersleri |
| Bekleyen yoklama | ✅ kırılımlı | ✅ kendi şubesi | kendi dersleri |
| Açık telafi talepleri | ✅ kırılımlı | ✅ kendi şubesi | ❌ |
| Aktif öğrenci / öğretmen sayısı | ✅ kırılımlı | ✅ kendi şubesi | ❌ |
| **Toplam alacak, geciken ödeme** | ✅ kırılımlı | ⚠️ yalnız kendi şubesinin tahsilat listesi; **kurum geneli finans özeti YOK** | ❌ |
| **Öğretmen hakediş özeti** | ✅ | ❌ | kendi hakedişi |
| **Personel özeti** | ✅ | ❌ | ❌ |
| Abonelik/paket durumu | ✅ | ❌ | ❌ |
| Kurulum ilerlemesi | ✅ | ❌ | ❌ |

### 4.2 Sunum
`/panel` üstte **kurum toplamı**, altında **şube kartları** (şube başına:
bugünkü ders, bekleyen yoklama, açık telafi, aktif öğrenci; sahip ayrıca
alacak). Müdür için "kurum toplamı" satırı **hiç render edilmez** — gizlenmez,
sunucuda üretilmez.

### 4.3 Performans — tam tenant okuması YASAK
Bugünkü `readScopedData()` (tam `AppData`) dashboard'da **kullanılmamalıdır**.
Yerine **şube+rol kapsamlı özet sorguları**:

```
-- örnek: şube başına bugünkü ders sayısı
SELECT "branchId", count(*) FROM "Lesson"
WHERE "tenantId" = $1 AND "branchId" = ANY($2) AND "startAt" >= $3 AND "startAt" < $4
GROUP BY "branchId";
```

Kural: dashboard'un her metriği **tek bir toplu (aggregate) sorgu** ile
gelmeli; satır listesi çekilip JS'te sayılmamalı. Bağımsız metrikler
`Promise.all` ile paralel. Hedef: dashboard sunucu süresi ≤ 1 gidiş-dönüş
dalgası.

---

## 5. Neviios Control Center ↔ Kurum Yönetimi ayrımı

| | Neviios Control Center | Kurum Yönetimi |
|---|---|---|
| Kim | Platform `SUPER_ADMIN` | `INSTITUTION_OWNER` |
| Kapsam | Tüm tenantlar | Tek tenant |
| Tipik iş | Kurum açma/kapatma, plan/abonelik, platform sağlığı, çapraz kurum raporu | Şube, kurum içi rol, kurum ayarı, kurum finans özeti |
| Veri | Tenant'lar arası **salt okunur birleşik** görünüm (mevcut `getInstitutionContext`) | Tek tenant, yazma |

**Kural:** kurum sahibi platform ekranlarını, `SUPER_ADMIN` ise kurum içi
rol atamalarını *rutin olarak* görmez. `SUPER_ADMIN`'in mevcut "rol
kapılarını bypass etme" davranışı korunur (destek/operasyon için) ama
**denetim kaydına yazılır**.

---

## 6. Şema değişiklikleri ve migration listesi

> **Bu turda HİÇBİRİ oluşturulmadı/çalıştırılmadı.**

| # | Değişiklik | Tip | Risk |
|---|---|---|---|
| M1 | `UserBranchAccess` tablosu (§3) | Additive (yeni tablo) | Düşük |
| M2 | `User.role` yeni değerleri kabul eder (`INSTITUTION_OWNER`, `BRANCH_MANAGER`, `STAFF`) | Veri değişikliği yok — `role` zaten `String` | Düşük |
| M3 | (Opsiyonel) `Teacher.branchIds` (Json) → `UserBranchAccess`/ilişki tablosuna taşıma | Veri taşıma | **Orta** — ayrı sprint |
| M4 | (Opsiyonel) Denetim kaydına `branchId` alanı | Additive | Düşük |

`role` alanı `String` olduğu için yeni roller **enum migration'ı
gerektirmez**; kod tarafındaki `APP_ROLES` + `ROLE_PERMISSIONS` genişler.

### Geriye dönük uyumluluk
- Mevcut tüm `SCHOOL_ADMIN` kullanıcıları **davranış değiştirmeden** çalışmaya
  devam eder ve `INSTITUTION_OWNER` ile **eşdeğer** kabul edilir.
- Yeni roller yalnız açıkça atandığında devreye girer.
- `UserBranchAccess` satırı olmayan `BRANCH_MANAGER` → fail-closed.
  Bu yüzden rol atama akışı, şube seçimini **zorunlu** kılmalıdır.

---

## 7. Test / rollout / rollback

**Test**
- İzin matrisi tablo-güdümlü birim testi (rol × izin, §2.2'nin birebir karşılığı).
- Negatif testler: müdür → finans özeti/personel özeti/şube oluşturma/rol
  atama = `FORBIDDEN`.
- Şube kapsamı: müdür yalnız atandığı şubenin öğrenci/ders/ödeme verisini
  görür; başka şubenin kaydına erişim `FORBIDDEN`.
- Fail-closed: `UserBranchAccess` satırı yok → hiçbir şube.
- Store parity (json/memory/db) — yeni kapsam çözümü üç modda aynı.
- Performans: dashboard'un tam-tenant okuması YAPMADIĞINI kilitleyen test.

**Rollout**
1. M1+M2 migration (additive) → kimse etkilenmez.
2. Kod: yeni roller + `resolveBranchScope`, `SCHOOL_ADMIN` eşdeğerliği açık.
3. Dashboard şube kartları (önce sahip için, sonra müdür).
4. Operatör birkaç kullanıcıyı `BRANCH_MANAGER`'a taşır (şube seçerek).

**Rollback**
- Kod geri alınır; `UserBranchAccess` satırları zararsız kalır (okuyan yok).
- Rol değeri değiştirilen kullanıcılar `SCHOOL_ADMIN`'e döndürülür —
  bu bir UPDATE'tir, veri kaybı yoktur.

---

## 8. OWNER DECISIONS — karar bekleyen belirsizlikler

| # | Soru | Neden belirsiz |
|---|---|---|
| 1 | `STAFF` (personel) ayrı bir rol olacak mı, yoksa şimdilik yalnız sahip/müdür mü? | Talepte "personel" bir rol olarak değil, "personel özeti" metriği olarak geçiyor. |
| 2 | Kurum müdürü **tahsilat** yapabilir mi? (tabloda ✅ *kendi şubesi* varsayıldı) | "Finans özetine erişmemeli" deniyor; günlük tahsilat operasyonel sayıldı ama bu bir karardır. |
| 3 | Kurum müdürü **sözleşme** oluşturabilir mi? | Sözleşme hem operasyon hem mali taahhüt. |
| 4 | Müdür **denetim kaydını** görebilir mi? | Şeffaflık ↔ yetki ayrımı dengesi. |
| 5 | Bir kullanıcı aynı anda hem müdür hem öğretmen olabilir mi? | Bugün `User.role` **tek** değer; çoklu rol şema değişikliği demek. |
| 6 | Kurum sahibi **birden fazla** olabilir mi? | Devir/ortaklık senaryosu. |
| 7 | Şube kapatıldığında o şubeye atanmış müdürün erişimi ne olur? | Otomatik kaldırma mı, engelleme mi? |
| 8 | `SUPER_ADMIN` kurum içi rol atayabilmeli mi (destek senaryosu)? | Bugün rol kapılarını bypass ediyor; denetim kaydı şart. |
| 9 | "Finans özeti" tam olarak neyi kapsıyor: ciro + alacak + hakediş mi, yoksa hakediş ayrı mı? | Metrik sınırı net değil. |

---

## 9. Bu turda YAPILMAYANLAR (teyit)

- Kod implementasyonu **yok**.
- Migration oluşturulmadı/çalıştırılmadı.
- Test Supabase'e seed/reset/cleanup/SQL yazımı **yok**.
- Mevcut `SCHOOL_ADMIN` davranışı **değiştirilmedi**.
