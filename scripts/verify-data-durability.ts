/**
 * G — VERİ KALICILIĞI DOĞRULAMASI (salt okunur).
 *
 * "Canlıya geçerken veri kaybolmasın" sözünü LAFLA değil, çalıştırılabilir
 * bir kontrolle verir. Yalnız SELECT çalıştırır; hiçbir şey yazmaz/siler.
 *
 *   npm run verify:durability            # hedefi DATABASE_URL'den okur
 *   npm run verify:durability -- --json  # makine-okunur çıktı (CI için)
 *
 * Çıkış kodu: tüm kontroller geçerse 0, en az bir KRİTİK bulguda 1.
 *
 * Kontrol ettikleri (hepsi gerçek veri kaybı senaryolarından türetildi):
 *   1. Ortam kalıcılığı  — uygulama gerçekten kalıcı bir store'da mı?
 *      (`STORE_MODE=json` + Vercel = /tmp = her cold start'ta SIFIRLANIR)
 *   2. Şema tamlığı      — beklenen tablolar var mı, migration sayısı tutuyor mu?
 *   3. Satır sayıları    — öğrenci/sözleşme/ödeme/evrak/ders hacmi
 *   4. Yetim kayıt       — sözleşmesi olmayan taksit, öğrencisi olmayan ödeme vb.
 *   5. Belge bütünlüğü   — sözleşmenin dondurulmuş nüshası ve imzalı dosyası
 *      gerçekten saklanıyor mu (boş `renderedHtml` / kayıp `DocumentInstance`)
 *   6. Para değişmezleri — sözleşme toplamı ile taksit toplamı tutuyor mu
 *
 * Bkz. docs/operations/DATA_DURABILITY_AND_GO_LIVE.md
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { classifyDatabaseTarget } from "../src/lib/env/test-target-guard";
import { resolvePgConnection } from "../src/lib/db/connection";

type Severity = "critical" | "warning" | "info";
type Finding = { severity: Severity; check: string; message: string; detail?: unknown };

const findings: Finding[] = [];
const add = (severity: Severity, check: string, message: string, detail?: unknown) =>
  findings.push({ severity, check, message, detail });

/** Beklenen çekirdek tablolar — biri eksikse şema kurulmamıştır. */
const CORE_TABLES = [
  "Tenant",
  "User",
  "Student",
  "Teacher",
  "Lesson",
  "LessonSeries",
  "Payment",
  "StudentContract",
  "DocumentInstance",
  "DocumentTemplate",
  "ClosedDay",
  "Task",
];

function committedMigrationCount(): number {
  const dir = path.join(process.cwd(), "prisma", "migrations");
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
}

/**
 * 1. ORTAM KALICILIĞI — en kritik ve en sık gözden kaçan kontrol.
 *
 * `STORE_MODE=json` Vercel/Lambda üzerinde `/tmp/notaplan-data` altına yazar
 * (bkz. src/lib/config.ts `resolveDataDir`). `/tmp` her cold start'ta ve her
 * dağıtımda SIFIRLANIR. Yani bu kombinasyonda girilen öğrenci, sözleşme,
 * ödeme ve evrak KALICI DEĞİLDİR. `memory` modu zaten diske hiç yazmaz.
 */
function checkRuntimePersistence() {
  const storeMode = process.env.STORE_MODE ?? "json";
  const onServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (storeMode === "db") {
    add("info", "runtime", "STORE_MODE=db — veriler PostgreSQL'de, kalıcı.");
    return;
  }
  if (storeMode === "memory") {
    add(
      "critical",
      "runtime",
      "STORE_MODE=memory — hiçbir veri diske YAZILMAZ; her cold start'ta sıfırlanır. Gerçek kullanıcı verisi için ASLA kullanılmamalıdır."
    );
    return;
  }
  if (onServerless) {
    add(
      "critical",
      "runtime",
      "STORE_MODE=json + serverless (Vercel/Lambda): veriler /tmp/notaplan-data altına yazılır ve her cold start/dağıtımda SİLİNİR. Gerçek veri girilen bir ortamda STORE_MODE=db zorunludur."
    );
    return;
  }
  add(
    "warning",
    "runtime",
    "STORE_MODE=json (yerel dosya). Yerel geliştirme için uygundur; gerçek kullanıcı verisi giriliyorsa yedeklenebilir bir veritabanına (STORE_MODE=db) geçin."
  );
}

/**
 * AI katmanı (sohbet geçmişi, metrikler, hafıza/vektör) bilinçli olarak
 * yalnız DOSYA tabanlıdır — `isDbMode` dalı yoktur. Serverless'ta bu
 * kayıtlar kalıcı değildir. Operasyonel/finansal veriyi etkilemez, ama
 * "her şey kalıcı" sanılmasın diye açıkça raporlanır.
 */
function checkKnownEphemeralStores() {
  const onServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (!onServerless) return;
  add(
    "warning",
    "ephemeral-ai-stores",
    "AI sohbet geçmişi, AI metrikleri ve AI hafıza/vektör deposu yalnız dosya tabanlıdır (src/lib/ai/conversations.ts, ai/metrics.ts, ai/memory/*). Serverless'ta bunlar cold start'ta kaybolur. Öğrenci/sözleşme/ödeme/evrak verisi ETKİLENMEZ."
  );
}

async function main() {
  const asJson = process.argv.includes("--json");
  const url = process.env.DATABASE_URL;

  checkRuntimePersistence();
  checkKnownEphemeralStores();

  if (!url) {
    add("critical", "database", "DATABASE_URL tanımlı değil — veritabanı kontrolleri çalıştırılamadı.");
    return report(asJson);
  }

  const target = classifyDatabaseTarget(url);
  add("info", "target", `Veritabanı hedefi: ${target.safeLabel}`);

  const pool = new Pool(resolvePgConnection(url));
  try {
    // --- 2. Şema tamlığı ---
    const tables = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    );
    const present = new Set(tables.rows.map((r) => r.table_name));
    const missing = CORE_TABLES.filter((t) => !present.has(t));
    if (missing.length > 0) {
      add("critical", "schema", `Beklenen tablolar eksik: ${missing.join(", ")}. Şema kurulmamış olabilir.`);
      return report(asJson, pool);
    }
    add("info", "schema", `${CORE_TABLES.length} çekirdek tablo mevcut.`);

    const applied = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`
    );
    const appliedCount = Number(applied.rows[0]?.n ?? 0);
    const committed = committedMigrationCount();
    if (appliedCount < committed) {
      add(
        "critical",
        "migrations",
        `Uygulanan migration sayısı (${appliedCount}) repo'daki sayıdan (${committed}) az — bekleyen migration var. "npx prisma migrate deploy" çalıştırın.`
      );
    } else {
      add("info", "migrations", `${appliedCount} migration uygulanmış (repo: ${committed}).`);
    }

    // --- 3. Satır sayıları ---
    const counts = await pool.query<{ entity: string; n: string }>(`
      SELECT 'tenant' AS entity, count(*)::text AS n FROM "Tenant"
      UNION ALL SELECT 'student', count(*)::text FROM "Student"
      UNION ALL SELECT 'teacher', count(*)::text FROM "Teacher"
      UNION ALL SELECT 'lesson', count(*)::text FROM "Lesson"
      UNION ALL SELECT 'payment', count(*)::text FROM "Payment"
      UNION ALL SELECT 'contract', count(*)::text FROM "StudentContract"
      UNION ALL SELECT 'document', count(*)::text FROM "DocumentInstance"
    `);
    add(
      "info",
      "counts",
      counts.rows.map((r) => `${r.entity}=${r.n}`).join(" · "),
      Object.fromEntries(counts.rows.map((r) => [r.entity, Number(r.n)]))
    );

    // --- 4. Yetim kayıtlar ---
    const orphanPayments = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM "Payment" p LEFT JOIN "Student" s ON s.id = p."studentId" WHERE s.id IS NULL`
    );
    if (Number(orphanPayments.rows[0]?.n) > 0) {
      add("critical", "orphans", `${orphanPayments.rows[0]!.n} ödeme kaydının öğrencisi yok.`);
    }

    const orphanInstallments = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM "Payment" p
       WHERE p."contractId" IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM "StudentContract" c WHERE c.id = p."contractId")`
    );
    if (Number(orphanInstallments.rows[0]?.n) > 0) {
      add("critical", "orphans", `${orphanInstallments.rows[0]!.n} taksit satırının sözleşmesi yok.`);
    }

    const orphanContracts = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM "StudentContract" c LEFT JOIN "Student" s ON s.id = c."studentId" WHERE s.id IS NULL`
    );
    if (Number(orphanContracts.rows[0]?.n) > 0) {
      add("critical", "orphans", `${orphanContracts.rows[0]!.n} sözleşmenin öğrencisi yok.`);
    }

    // --- 5. Belge bütünlüğü ---
    const contractsWithoutDocument = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM "StudentContract" c
       WHERE c."documentInstanceId" IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM "DocumentInstance" d WHERE d.id = c."documentInstanceId")`
    );
    if (Number(contractsWithoutDocument.rows[0]?.n) > 0) {
      add(
        "critical",
        "documents",
        `${contractsWithoutDocument.rows[0]!.n} sözleşmenin dondurulmuş belge nüshası (DocumentInstance) KAYIP. Sözleşme PDF'i yeniden üretilemez.`
      );
    }

    const emptyRendered = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM "DocumentInstance"
       WHERE ("renderedHtml" IS NULL OR length("renderedHtml") = 0)
         AND "fileData" IS NULL`
    );
    if (Number(emptyRendered.rows[0]?.n) > 0) {
      add(
        "critical",
        "documents",
        `${emptyRendered.rows[0]!.n} evrakta ne dondurulmuş içerik ne de yüklenmiş dosya var — bu belgeler boş.`
      );
    }

    const draftDocs = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM "DocumentInstance" WHERE status = 'draft'`
    );
    if (Number(draftDocs.rows[0]?.n) > 0) {
      add(
        "warning",
        "documents",
        `${draftDocs.rows[0]!.n} evrak hâlâ "draft" statüsünde. 20260920120000 migration'ı bunları "issued"a taşır; uygulanmamış olabilir.`
      );
    }

    // --- 6. Para değişmezleri ---
    const amountMismatch = await pool.query<{ id: string; contract_total: string; installment_total: string }>(
      `SELECT c.id,
              c."totalContractAmount"::text AS contract_total,
              COALESCE(SUM(p.amount), 0)::text AS installment_total
       FROM "StudentContract" c
       LEFT JOIN "Payment" p ON p."contractId" = c.id AND p."installmentSequence" IS NOT NULL
       WHERE c.status NOT IN ('cancelled', 'superseded')
       GROUP BY c.id, c."totalContractAmount"
       HAVING COALESCE(SUM(p.amount), 0) <> c."totalContractAmount"
          AND COALESCE(SUM(p.amount), 0) > 0`
    );
    if (amountMismatch.rowCount && amountMismatch.rowCount > 0) {
      add(
        "critical",
        "money",
        `${amountMismatch.rowCount} sözleşmede toplam tutar ile taksit toplamı uyuşmuyor.`,
        amountMismatch.rows.slice(0, 10)
      );
    } else {
      add("info", "money", "Sözleşme toplamı = taksit toplamı (aktif sözleşmelerde).");
    }

    // --- Tenant izolasyonu (çapraz kurum sızıntısı) ---
    const crossTenant = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM "Payment" p
       JOIN "Student" s ON s.id = p."studentId"
       WHERE s."tenantId" <> p."tenantId"`
    );
    if (Number(crossTenant.rows[0]?.n) > 0) {
      add("critical", "tenant", `${crossTenant.rows[0]!.n} ödeme kaydı başka bir kurumun öğrencisine bağlı.`);
    }
  } catch (error) {
    add("critical", "database", `Sorgu hatası: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await pool.end();
  }

  report(asJson);
}

function report(asJson: boolean, pool?: Pool) {
  void pool;
  const criticals = findings.filter((f) => f.severity === "critical");
  if (asJson) {
    console.log(JSON.stringify({ ok: criticals.length === 0, findings }, null, 2));
  } else {
    for (const f of findings) {
      const tag = f.severity === "critical" ? "[KRİTİK]" : f.severity === "warning" ? "[UYARI] " : "[bilgi] ";
      console.log(`${tag} ${f.check}: ${f.message}`);
      if (f.detail && f.severity !== "info") console.log("          ", JSON.stringify(f.detail));
    }
    console.log(
      criticals.length === 0
        ? "\n✅ Kritik bulgu yok — veri kalıcılığı kontrolleri geçti."
        : `\n❌ ${criticals.length} kritik bulgu — canlıya geçmeden önce giderilmelidir.`
    );
  }
  process.exitCode = criticals.length === 0 ? 0 : 1;
}

void main();
