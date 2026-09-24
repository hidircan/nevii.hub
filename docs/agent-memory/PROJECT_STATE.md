# NeviiHub — Güncel snapshot (resume-from-here)

Kısa tutulur (~50 satır): oturum sonunda yalnız "Güncel snapshot" bölümünün ÜZERİNE yazılır; eski snapshot
`archive/`'e taşınır. Ayrıntı → ilgili `docs/testing/UAT_*.md`, `docs/operations/*`. Yönlendirici: `nevii-hub` skill.
Tam tarihçe (2026-08-30 → 09-24): `archive/PROJECT_STATE_LOG_2026-08-30_to_2026-09-24.md`.

## Ürün / kalıcı kararlar (yeniden tartışma)
- Çok kiracılı müzik okulu SaaS; Next.js 16 + Prisma/PostgreSQL; json/memory/db store parity (bkz. CLAUDE.md).
- Telafi: eğitim yılı başına 2 hak, kaçan dersten itibaren 30 gün. Ödeme penceresi: kart 1–5, havale/nakit 1–15, merkezi.
- KDV: fiyatlar KDV dahil ("Tüm eğitim ücretleri KDV dahildir."). Gerekçe: `docs/contracts/LEGAL_POLICY_TEXT_DISCREPANCY_REPORT.md`.
- Kritik işlem kapısı TEK: `checkCriticalPassword` + `canRunCriticalActions` (tools.ts).
- Rol modeli: tek HYPER_ADMIN platform sahibi; kurum sahibi SUPER_ADMIN.

## Güncel snapshot — 2026-09-24 (5. tur, A–G)
- **Dal:** `fix/uat-round-5` → `test` (ayrı worktree `../nevii-hub-uat-round5`; ana ağaçta paralel oturum vardı).
- **Önceki commit (test):** `29b2b8a` (log saklama cron'u, mobil devralma onayı, toplu öğretmen devri).
- **Bu tur:** tahakkuk sözleşme-farkında, TC filtresi, ortalama aylık ücret, sözleşme↔kayıt geri dönüş,
  dashboard masonry, takvim taksit→dönem ayı eşlemesi, portallı ModalShell. **Migration yok.**
  UAT: `docs/testing/UAT_2026_09_24_ROUND_5.md`.
- **Hafıza düzeni:** `.claude/skills/` artık git'te (önce `.gitignore` dışlıyordu); router skill `nevii-hub`.

## Ortamlar
- Test: `test` dalı → Vercel → `test.neviihub.com`; test DB Supabase `vxzewyiwfshobjizzetw` (repo migration'ları uygulandı,
  son kontrol 2026-09-21; 22–23.09 additive migration'ları için `docs/operations/RUNBOOK_2026_09_22_CSV_CONTRACT_DELETE.md`).
- Production: dokunulmaz (owner kararı). Yerel `.env` production'ı gösterebilir — DB komutundan önce hedefi kanıtla.
- Vercel Cron: günlük 00:30 UTC retention (`vercel.json`, `CRON_SECRET`).

## Açık iş
- Owner UAT: 5. tur (yukarıdaki belge) + 4. tur `docs/testing/UAT_2026_09_23_OPS_ROUND_4.md`.
- Mobil: devralma onayı için yeni EAS build (ayrı tur; `apps/mobile/*` bu turda dokunulmadı).
- Tahsilat hatırlatmaları iptal/yenilenmiş sözleşmenin ödenmemiş taksitlerini hâlâ "gecikmiş" görebilir — özet düzeltildi,
  hatırlatma/liste akışı ayrı kontrol edilmeli (5. tur kapsamı dışı).
- Uzun vadeli açıklar (PDF sayfa altbilgisi, toplu tarihsel sözleşme importu, aynı-gün iptal bildirimi): arşivdeki "Open work".

## Riskler / bilinen durum
- Tam test paketinde tarihe bağlı bilinen başarısızlıklar olabilir — baseline'ı `origin/test` üzerinde koşup karşılaştır.
- `docs/project-brain/CURRENT_STATE.md` 2026-08-31'de donmuş; güncel durum burası.
