/**
 * DB egress dilimlerinin DB (Prisma) üretimini, tam okumadan türetilen saf daraltmayla
 * KARŞILAŞTIRIR — yerel tek kullanımlık PostgreSQL'de, iki kurumla (seed-egress-bench.ts).
 * Salt okur (bildirim sayfalaması dahil). Başarısızlıkta çıkış kodu 1.
 *
 *   STORE_MODE=db DATABASE_URL=postgresql://<user>@127.0.0.1:5432/neviihub_egress_bench \
 *     npx tsx scripts/bench/verify-db-slices.ts
 *
 * Denetlenen: öğrenci/referans/ders penceresi/öğrenci listesi dilimleri ≡ `narrow*(readData())`;
 * `readStudentById` ≡ `students.find`; kurumlar arası kimlikle okuma → boş; bildirim sayfaları ≡
 * eski bellek içi sayfalama; kurum listeleri ≡ eski `include: { schools: true }` sonucu.
 */
import { isDeepStrictEqual } from "node:util";
import { DEFAULT_TENANT_ID } from "../../src/lib/auth/config";
import { assertDisposableLocalTarget, OTHER_TENANT_ID } from "./seed-egress-bench";

let failures = 0;
let checks = 0;
function expectEqual(label: string, actual: unknown, expected: unknown) {
  checks++;
  if (!isDeepStrictEqual(actual, expected)) {
    failures++;
    console.error(`✗ ${label}`);
  }
}
function expectTrue(label: string, cond: boolean) {
  checks++;
  if (!cond) {
    failures++;
    console.error(`✗ ${label}`);
  }
}

/** JSON gidiş-dönüşü: undefined alanlar/sıra farkı olmadan karşılaştırma (RSC prop'larıyla aynı). */
const norm = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

async function main() {
  assertDisposableLocalTarget(process.env.DATABASE_URL);
  if (process.env.STORE_MODE !== "db") throw new Error("STORE_MODE=db olmalı");
  const { runWithTenantAsync } = await import("../../src/lib/tenant-context");
  const db = await import("../../src/lib/store-db");
  const slices = await import("../../src/lib/reference-data");
  const notifications = await import("../../src/lib/notifications");
  const platform = await import("../../src/lib/platform/store");
  const institution = await import("../../src/lib/recruitment/institution");
  const { prisma } = await import("../../src/lib/db");

  const idsByTenant = new Map<string, Set<string>>();
  for (const tid of [DEFAULT_TENANT_ID, OTHER_TENANT_ID]) {
    await runWithTenantAsync(tid, async () => {
      const full = await db.readData();
      idsByTenant.set(tid, new Set([...full.students.map((s) => s.id), ...full.lessons.map((l) => l.id), ...full.payments.map((p) => p.id)]));

      // Referans dilimi
      expectEqual(`${tid} readReferenceData`, norm(await db.readReferenceData()), norm(slices.toReferenceData(full)));

      // Kariyer/İK kurum bilgisi: tek okul sorgusu ≡ eski `readData().settings` türetimi (logo dahil).
      const s = full.settings;
      expectEqual(
        `${tid} getInstitutionInfo`,
        norm(await institution.getInstitutionInfo(tid)),
        norm({ name: s.name || "Kurum", logoUrl: s.logoUrl || undefined, phone: s.phone || undefined, email: s.email || undefined, website: s.website || undefined })
      );

      // Öğrenci listesi dilimi
      expectEqual(
        `${tid} readStudentListData`,
        norm(await db.readStudentListData()),
        norm({ ...slices.toReferenceData(full), payments: full.payments.map(slices.toPaymentStatusRow) })
      );

      // Ödemeler dilimi (tüm ödemeler + yalnız bağlı dersler)
      expectEqual(`${tid} readPaymentsPageData`, norm(await db.readPaymentsPageData()), norm(slices.narrowToPaymentsPage(full)));

      // Hakediş penceresi + Panel özeti: dilim eşitliği VE finans hesabı sonuç eşitliği (tam veri ↔ dilim), her ay.
      const { buildPayoutOverviewRows } = await import("../../src/lib/payout-overview");
      const { computeTeacherPayoutOverview } = await import("../../src/lib/teacher-payout-overview");
      const { buildDashboardSummary } = await import("../../src/lib/dashboard/daily-summary");
      const { computeSetupProgress } = await import("../../src/lib/setup-progress");
      const day = (ymd: string, deltaDays: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + deltaDays * 86_400_000);
      for (const month of ["2026-07", "2026-08", "2026-09", "2026-10", "2027-01", "2027-06"]) {
        const [y, m] = month.split("-").map(Number) as [number, number];
        const periodStart = `${month}-01`;
        const periodEnd = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
        const from = day(periodStart, -2);
        const to = day(periodEnd, 3);
        const win = await db.readPayoutWindow(from.toISOString(), to.toISOString());
        expectEqual(`${tid} readPayoutWindow(${month})`, norm(win), norm(slices.narrowToPayoutWindow(full, from, to)));
        expectEqual(
          `${tid} hakediş satırları ${month} (tam ↔ dilim)`,
          norm(buildPayoutOverviewRows(win, periodStart, periodEnd)),
          norm(buildPayoutOverviewRows(full, periodStart, periodEnd))
        );
        // Panel özeti: "bugün" ayın 17'si varsayımıyla (bugünün dersleri + ay hakediş özeti aynı pencerede).
        const today = `${month}-17`;
        const now = new Date(`${today}T09:30:00Z`);
        const dash = await db.readDashboardData(day(periodStart, -2).toISOString(), day(today, 3).toISOString(), now.toISOString());
        expectEqual(
          `${tid} readDashboardData(${month})`,
          norm(dash),
          norm(slices.narrowToDashboard(full, day(periodStart, -2), day(today, 3), now))
        );
        expectEqual(
          `${tid} ay hakediş özeti ${month} (tam ↔ dilim)`,
          computeTeacherPayoutOverview(dash, periodStart, today),
          computeTeacherPayoutOverview(full, periodStart, today)
        );
        for (const branchId of ["all", ...full.settings.branches.map((b) => b.id)]) {
          expectEqual(
            `${tid} panel özeti ${month} şube=${branchId} (tam ↔ dilim)`,
            norm(buildDashboardSummary(dash, { branchId, today, now }, new Map(), [], new Set())),
            norm(buildDashboardSummary(full, { branchId, today, now }, new Map(), [], new Set()))
          );
        }
        expectEqual(`${tid} kurulum ilerlemesi ${month}`, computeSetupProgress(dash, now), computeSetupProgress(full, now));
      }

      // Öğretmen portalı hakediş detayı: sayfanın kullandığı pencere (kayıt dönemi −2/+3 gün) ile ders dökümü ≡ tam veri.
      const { computeTeacherEarningsWithRevisions } = await import("../../src/lib/teacher-payout");
      const nowIso = new Date().toISOString();
      expectEqual(`${tid} hakediş listesi (boş pencere)`, norm((await db.readPayoutWindow(nowIso, nowIso)).teacherPayouts), norm(full.teacherPayouts));
      for (const p of full.teacherPayouts) {
        const win = await db.readPayoutWindow(
          new Date(Date.parse(p.periodStart) - 2 * 86_400_000).toISOString(),
          new Date(Date.parse(p.periodEnd) + 3 * 86_400_000).toISOString()
        );
        const detail = computeTeacherEarningsWithRevisions(win, p.teacherId, p.periodStart, p.periodEnd);
        expectEqual(
          `${tid} öğretmen hakediş detayı ${p.id} (tam ↔ dilim)`,
          norm(detail),
          norm(computeTeacherEarningsWithRevisions(full, p.teacherId, p.periodStart, p.periodEnd))
        );
        expectTrue(`${tid} ${p.id} döküm boş değil`, detail.lines.length > 0);
      }

      // Her öğrenci için öğrenci dilimi + tek satır okuma
      for (const s of full.students) {
        const scope = await db.readStudentScope(s.id);
        expectEqual(`${tid} readStudentScope(${s.id})`, norm(scope), norm(slices.narrowToStudentScope(full, s.id)));
        expectEqual(`${tid} readStudentById(${s.id})`, norm(await db.readStudentById(s.id)), norm(s));
        // Hiçbir öğrenci satırı eksik değil (sessiz "ders yok / 0 TL" koruması)
        expectTrue(
          `${tid} ${s.id} ders sayısı tam`,
          scope.lessons.length === full.lessons.filter((l) => l.studentId === s.id).length
        );
        expectTrue(
          `${tid} ${s.id} ödeme sayısı tam`,
          scope.payments.length === full.payments.filter((p) => p.studentId === s.id).length
        );
      }
      expectEqual(`${tid} readStudentById(bilinmeyen)`, await db.readStudentById("yok-boyle-bir-ogrenci"), undefined);
      expectEqual(`${tid} readStudentById("")`, await db.readStudentById(""), undefined);

      // Ders penceresi: birkaç hafta + sınır anı dahil mi
      const starts = full.lessons.map((l) => l.startAt).sort();
      const probes = [starts[0], starts[Math.floor(starts.length / 2)], starts[starts.length - 1]].filter(Boolean) as string[];
      for (const iso of probes) {
        const from = new Date(new Date(iso).getTime() - 3 * 86_400_000);
        const to = new Date(iso); // sınır anı: tam `startAt` pencerede olmalı
        const got = await db.readLessonWindow(from.toISOString(), to.toISOString());
        expectEqual(`${tid} readLessonWindow(${iso})`, norm(got), norm(slices.narrowToLessonWindow(full, from, to)));
        expectTrue(`${tid} pencere sınır dersi dahil (${iso})`, got.lessons.some((l) => l.startAt === new Date(iso).toISOString()));
      }
    });
  }

  // Kurum izolasyonu: B kurumunda A'nın kimlikleriyle okuma boş döner (ve tersi).
  for (const [tid, other] of [
    [DEFAULT_TENANT_ID, OTHER_TENANT_ID],
    [OTHER_TENANT_ID, DEFAULT_TENANT_ID],
  ] as const) {
    await runWithTenantAsync(tid, async () => {
      const foreign = [...idsByTenant.get(other)!].filter((id) => id.startsWith("s") || id.startsWith("b_s")).slice(0, 25);
      for (const id of foreign) {
        expectEqual(`${tid} yabancı öğrenci ${id} görünmez`, await db.readStudentById(id), undefined);
        const scope = await db.readStudentScope(id);
        expectTrue(`${tid} yabancı öğrenci ${id} dilimi boş`, scope.students.length === 0 && scope.lessons.length === 0 && scope.payments.length === 0);
      }
      const ref = await db.readReferenceData();
      const own = idsByTenant.get(tid)!;
      expectTrue(`${tid} referans dilimi yalnız kendi öğrencileri`, ref.students.every((s) => own.has(s.id)));
      const list = await db.readStudentListData();
      expectTrue(`${tid} öğrenci listesi ödemeleri yalnız kendi öğrencileri`, list.payments.every((p) => own.has(p.studentId)));
    });
  }

  // Bildirim sayfalaması (db) ≡ eski bellek içi sayfalama (tam liste, createdAt desc + id desc).
  const recipient = { tenantId: DEFAULT_TENANT_ID, userId: "user_owner_nilufer" };
  const all = (await notifications.listNotificationsForUser(recipient)).sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
  );
  const unread = all.filter((n) => !n.readAt).length;
  for (const limit of [1, 7, 20, 100]) {
    let cursor: string | undefined;
    const walked: string[] = [];
    for (let guard = 0; guard < 1000; guard++) {
      const page = await notifications.listNotificationsPageForUser(recipient, { cursor, limit });
      expectTrue(`bildirim okunmamış sayısı (limit ${limit})`, page.unreadCount === unread);
      walked.push(...page.notifications.map((n) => n.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expectEqual(`bildirim sayfaları tüm listeyi aynı sırada verir (limit ${limit})`, walked, all.map((n) => n.id));
  }
  const bad = await notifications.listNotificationsPageForUser(recipient, { cursor: "bozuk" });
  expectTrue("bozuk imleç → boş sayfa + doğru sayı", bad.notifications.length === 0 && bad.nextCursor === null && bad.unreadCount === unread);
  const otherTenant = await notifications.listNotificationsPageForUser({ tenantId: OTHER_TENANT_ID, userId: "user_owner_nilufer" });
  expectTrue("başka kurumun bildirimi görünmez", otherTenant.notifications.length === 0 && otherTenant.unreadCount === 0);

  // Kurum listeleri: eski `include: { schools: true }` sonucu ile aynı.
  const legacyTenants = await prisma.tenant.findMany({ where: { active: true }, include: { schools: true }, orderBy: { name: "asc" } });
  expectEqual(
    "listTenants ≡ eski sorgu",
    await db.listTenants(),
    legacyTenants.map((t) => ({ tenantId: t.id, name: t.schools[0]?.name ?? t.name }))
  );
  const legacyPlatform = await prisma.tenant.findMany({
    where: { id: { not: "tenant_platform" } },
    include: { schools: true },
    orderBy: { createdAt: "desc" },
  });
  const listed = await platform.listPlatformTenants();
  expectEqual("listPlatformTenants kimlik sırası ≡ eski sorgu", listed.map((t) => t.tenantId), legacyPlatform.map((t) => t.id));
  expectEqual(
    "listPlatformTenants adları ≡ eski sorgu",
    listed.map((t) => t.name),
    legacyPlatform.map((t) => t.schools[0]?.name ?? t.name)
  );
  for (const t of listed) {
    expectEqual(`getPlatformTenant(${t.tenantId}) ≡ listeden bulma`, norm(await platform.getPlatformTenant(t.tenantId)), norm(t));
  }
  expectEqual("getPlatformTenant(platform) → null", await platform.getPlatformTenant("tenant_platform"), null);
  expectEqual("getPlatformTenant(bilinmeyen) → null", await platform.getPlatformTenant("tenant_yok"), null);

  await prisma.$disconnect();
  console.log(`${checks} kontrol, ${failures} hata`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
