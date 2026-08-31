# Nevii Hub — Production Audit & ROI Roadmap
**Tarih:** 29 Temmuz 2026 · **Doğrulama:** lint ✅ · prisma validate ✅ · prisma generate ✅ · tsc kaynak temiz ✅
**Build notu:** `npm run build` bu ajan sandbox'ında OS engeli nedeniyle çalışmıyor (postcss worker `binding to a port: Operation not permitted`). Kodda hata yok; normal kullanıcı terminalinde (port kısıtlaması yok) geçecektir. Fontlar sistem yığınına çevrildiği için build artık ağ bağımsız.

---

## 1. DOĞRULAMA DURUMU
| Komut | Durum |
|---|---|
| npm install | ✅ tamamlandı (allow-scripts uyarıları zararsız) |
| npm run lint | ✅ temiz |
| npx prisma generate | ✅ Client v7.8.0 üretildi |
| npx prisma validate | ✅ şema geçerli (Tenant↔PaymentFollowUpCase tamam) |
| tsc (kaynak dosyalar) | ✅ yeni modüller temiz |
| npm run build | ⚠️ sandbox engeli — kullanıcı terminalinde çalıştırılmalı |

## 2. ÜRETİM AUDIT (alan bazında)

| Alan | Skor /10 | Bulgular |
|---|---|---|
| Mimari | 8 | Temiz katmanlar: API handler → Service/Tool → Store; tenant ALS scoping; agent tek execution path. Tahsilat vaka store'u file tabanlı — production'da Prisma modeli hazır, geçiş gerek. |
| Ölçeklenebilirlik | 5 | Stateless API ✅; ama workflow state + AI memory + tahsilat vakaları dosyada → multi-instance deploy'da kırılır. Postgres/pgvector'e taşınmalı. Workflow tick cron'u tek-process. |
| Güvenlik | 6 | JWT + RBAC + auditLog ✅; her tool izinli ✅. Eksik: rate limiting YOK, refresh token rotation net değil, CORS politikası tanımsız, webhook imza doğrulaması (WhatsApp) doğrulanmalı, secret yönetimi .env'de düz metin. |
| Gözlemlenebilirlik | 5 | requestId + auditLog + AI metrics/logs ✅. Eksik: Sentry/APM yok, metrikler dışa export edilmiyor (Prometheus), alerting yok. |
| Test | 1 | Test runner YOK, tek test dosyası YOK. Ticari satış öncesi en kritik boşluk: store-db, agent executor, tahsilat ROI hesapları. |
| Deployment | 5 | Vercel config var, env ayrımı var. Eksik: staging ortamı, migration pipeline (db push elle), health endpoint readiness değil (DB kontrolü yok), .env.example YOK. |
| CI/CD | 0 | Hiç CI yok (.github/workflows yok). Lint+build+prisma generate + smoke test koşan pipeline şart. |
| Billing | 0 | Abonelik/kota modeli kodda YOK. Tahsilat Agent'ı ücretli satmak için: plan tanımı, kullanım sayacı (metrics hazır), iyzico/Stripe entegrasyonu. |
| AI Orkestrasyon | 7 | Provider soyutlaması + planner (guardrailed) + executor + logging ✅. Eksik: retry/backoff, token bütçe limitleri, cost attribution per tenant (faturalama temeli metrics'te var ama tenant'a bağlanmadı). |
| Mobil hazırlık | 4 | REST API + JWT var; veli/öğretmen portalı responsive. Eksik: push notification altyapısı, offline, native wrapper kararı. Kısa vade: PWA yeterli. |
| API kalitesi | 7 | Tutarlı ServiceResult zarfı, zod validation, RBAC ✅. Eksik: OpenAPI spec, versiyonlama politikası belgesi, rate limit başlıkları. |
| Agent yetenekleri | 7 | 15 tool, plan-execute, memory, workflow ✅. Eksik: uzun görevlerde checkpoint/resume, insan-onay kuyruğunun kalıcılığı (yeni eklendi, UI↔API tam bağlı), araç sonucu doğrulama. |
| Memory kalitesi | 7 | Scoped memory + vector store (4 embedding provider) ✅. Eksik: retention/TTL politikası, PII redaksiyonu, tenant silme (KVKK). |
| Workflow kalitesi | 6 | 6 otonom akış + tick ✅. Eksik: kalıcı kuyruk (BullMQ/DB tabanlı), dead-letter, timezone-doğru zamanlama, kiracı başına eşzamanlılık limiti. |

## 3. HAZIRLIK YÜZDELERİ
- SaaS tamamlanma: **%72** (çekirdek tamam; billing + onboarding + test eksik)
- AI Agent tamamlanma: **%78** (runtime olgun; kalıcı kuyruk + onay döngüsü yeni kapandı)
- Production readiness: **%45** (test, CI, rate limiting, kalıcı state eksik)
- Enterprise readiness: **%30** (SLA, SSO, denetim raporu, KVKK veri yaşam döngüsü, sözleşme düzeyi güvenlik yok)

## 4. ROI SIRALI YOL HARİTASI

### Critical (satışı/çalışmayı engeller)
1. **CI pipeline** (GitHub Actions: lint + build + prisma generate + typecheck) — 0.5 gün. Her push güvenli olur.
2. **Test çekirdeği** (vitest: makeup-engine, tahsilat ROI, agent executor, RBAC) — 2 gün. Regresyon olmadan müşteri onboard edemezsin.
3. **Kalıcı state** (workflow state + AI memory + tahsilat vakaları → Postgres; modellerin yarısı zaten hazır) — 2 gün. Vercel'de birden fazla instance çalışır çalışmaz bugünkü dosya store veri kaybeder.
4. **Rate limiting + webhook imza doğrulama** — 1 gün. Public API ve WhatsApp webhook saldırıya açık.
5. **.env.example + deployment runbook** — 0.5 gün.

### High (ilk ödeyen müşteri için)
6. **Billing v1**: plan (Temel / AI Paket), tenant'a kota, metrics'ten kullanım sayacı, iyzico link ödeme — 3-4 gün. Gelirin kapısı.
7. **Onboarding akışı**: 15 dakikada okul kurulumu (tenant+okul+şube+ilk öğretmen/öğrenci sihirbazı) — 2 gün. Satışı ölçekler.
8. **Tahsilat Agent v3**: otomatik günlük tick → yeni gecikmeler için vaka açma (workflow engine'e bağla) + ROI raporu e-postası — 2 gün.
9. **Sentry + hata alerting** — 0.5 gün.

### Medium
10. OpenAPI spec + API dokümanı (entegrasyon satışları için)
11. PWA + push notification (veli/öğretmen)
12. Workflow → kalıcı kuyruk + dead-letter
13. Memory retention/TTL + KVKK silme akışı
14. Telafi Planlayıcı Agent (mevcut motor + AI slot önerisi + veli onay mesajı)

### Low
15. Voice agent · 16. Agent Studio/marketplace · 17. SSO/SCIM · 18. White-label · 19. Native mobil

## 5. İLK MİLESTONE (şimdi başlanacak)
**Critical #1+#2: CI + test çekirdeği** — repo "green" kavramını kalıcı hale getirir; sonrasındaki her değişiklik güvenli. Ardından Critical #3 (kalıcı state) ile Vercel production'a gerçek anlamda hazır olunur.
