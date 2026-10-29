/**
 * 2026-10-09 — ÇOKLU BRANŞ: eski (branş bağı NULL) kayıtları kesin olarak belirlenebildiği yerde branş kaydına bağlar.
 *
 * Kural (tahmin YOK):
 * - Kalıcı branş kaydı olmayan öğrencinin branşları eski alanlarından türetilip kalıcı yapılır (kimlik öğrenci +
 *   enstrümandan DETERMİNİSTİK — uygulama içi `ensurePersistedEnrollments` ile aynı kimlik).
 * - Öğrencinin TEK branşı varsa: tüm bağsız sözleşmeler, yapısal sahibi belli ödemeler (kayıt ilk tahsilatı, sözleşme taksidi,
 *   aylık plan, derse bağlı tahsilat) ve enstrümanı eşleşen ders/seriler o branşa bağlanır. Elle girilmiş genel ödemeler
 *   (kitap, kira, cezai işlem…) OTOMATİK bağlanmaz (2026-10-10) — "genel" kalır, "Branşa bağla" ile açıkça bağlanır.
 * - Birden fazla branşı varsa YALNIZ açık ilişkiden bağlanır: ders/seri → enstrümanı (gerekirse öğretmeni) TEK branşla
 *   eşleşiyorsa; sözleşme → kendisinden üretilmiş serilerin hepsi aynı branşa çözülüyorsa (sürüm zinciriyle);
 *   ödeme → sözleşmesinin veya kaynak dersinin branşı. Kalan her şey "belirsiz" olarak RAPORLANIR ve değişmez;
 *   uygulamada "Branşa bağla" (Sözleşme Merkezi / Ödemeler sekmesi) ile açıkça bağlanır.
 *
 * Kullanım (önce her zaman kuru çalıştırma; hedef DB'yi doğrulayın — production yalnız owner onayıyla):
 *   STORE_MODE=db npx tsx scripts/backfill-enrollment-links.ts                 # rapor, yazım yok
 *   STORE_MODE=db npx tsx scripts/backfill-enrollment-links.ts --tenant <id>   # tek kurum
 *   STORE_MODE=db npx tsx scripts/backfill-enrollment-links.ts --report out.json
 *   STORE_MODE=db npx tsx scripts/backfill-enrollment-links.ts --apply         # yazar
 *
 * Tekrar çalıştırılabilir: yalnız `enrollmentId IS NULL` satırlar yazılır; ikinci --apply yeni bir şey bulmaz.
 * Önkoşul: 20261009120000_payment_enrollment_link migration'ı hedef DB'ye uygulanmış olmalı (Payment.enrollmentId).
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import { prisma } from "../src/lib/db";
import { materializedEnrollmentId } from "../src/lib/enrollment-links";
import { effectiveEnrollments, isAutoLinkablePaymentSource, lessonEnrollmentId, primaryFieldsFromEnrollments } from "../src/lib/student-enrollments";
import type { Prisma } from "@prisma/client";
import type { Instrument, Payment, Student, StudentEnrollment } from "../src/lib/types";

type Ambiguous = { tenantId: string; studentId: string; studentName: string; kind: "contract" | "payment" | "lesson" | "series"; id: string; detail: string };

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (process.env.STORE_MODE !== "db") {
    throw new Error("Bu betik yalnızca STORE_MODE=db ile çalışır. Örnek: STORE_MODE=db npx tsx scripts/backfill-enrollment-links.ts");
  }
  const apply = process.argv.includes("--apply");
  const onlyTenant = argValue("--tenant");
  const reportPath = argValue("--report");
  console.log(`== Branş bağı backfill — ${apply ? "APPLY (kalıcı yazım)" : "DRY-RUN (yalnızca rapor)"} ==\n`);

  const tenants = onlyTenant ? [onlyTenant] : (await prisma.student.findMany({ distinct: ["tenantId"], select: { tenantId: true } })).map((t) => t.tenantId);
  const totals = { materialized: 0, contracts: 0, payments: 0, lessons: 0, series: 0 };
  const ambiguous: Ambiguous[] = [];

  for (const tenantId of tenants) {
    const [students, teachers, contracts, payments, lessons, series] = await Promise.all([
      prisma.student.findMany({
        where: { tenantId },
        select: { id: true, name: true, enrollments: true, instruments: true, teacherId: true, lessonDurationMinutes: true, branchId: true, weeklyLessonCount: true, createdAt: true },
      }),
      prisma.teacher.findMany({ where: { tenantId }, select: { id: true, instruments: true } }),
      prisma.studentContract.findMany({ where: { tenantId }, select: { id: true, studentId: true, enrollmentId: true, previousContractId: true, contractNumber: true } }),
      prisma.payment.findMany({
        where: { tenantId, enrollmentId: null },
        select: { id: true, studentId: true, contractId: true, lessonId: true, source: true, clubMembershipId: true, description: true },
      }),
      prisma.lesson.findMany({
        where: { tenantId },
        select: { id: true, studentId: true, enrollmentId: true, instrument: true, teacherId: true, type: true, clubSessionId: true, seriesId: true },
      }),
      prisma.lessonSeries.findMany({
        where: { tenantId },
        select: { id: true, studentId: true, enrollmentId: true, instrument: true, teacherId: true, contractId: true },
      }),
    ]);
    const teacherRefs = teachers.map((t) => ({ id: t.id, instruments: (t.instruments as Instrument[] | null) ?? [] }));
    let tenantChanges = 0;

    for (const st of students) {
      const base = {
        id: st.id,
        enrollments: (st.enrollments as unknown as StudentEnrollment[] | null) ?? undefined,
        instruments: (st.instruments as string[] | null) ?? [],
        teacherId: st.teacherId,
        lessonDurationMinutes: st.lessonDurationMinutes ?? undefined,
        branchId: st.branchId,
        weeklyLessonCount: st.weeklyLessonCount,
        createdAt: st.createdAt.toISOString(),
      } as unknown as Student;
      let list: StudentEnrollment[] = base.enrollments ?? [];
      if (list.length === 0) {
        const derived = effectiveEnrollments(base, teacherRefs);
        if (derived.length === 0) continue;
        list = derived.map(({ legacy, ...rest }) => {
          void legacy;
          return { ...rest, id: materializedEnrollmentId(st.id, rest.instrument) };
        });
        totals.materialized++;
        tenantChanges++;
        if (apply) {
          const prim = primaryFieldsFromEnrollments(list, base);
          await prisma.student.update({
            where: { id: st.id },
            data: { enrollments: list as unknown as Prisma.InputJsonValue, teacherId: prim.teacherId, instruments: prim.instruments },
          });
        }
      }
      const student = { ...base, enrollments: list } as Student;
      const myLessons = lessons.filter((l) => l.studentId === st.id);
      const mySeries = series.filter((s) => s.studentId === st.id);
      const myContracts = contracts.filter((c) => c.studentId === st.id);
      const myPayments = payments.filter((p) => p.studentId === st.id && p.source !== "club" && !p.clubMembershipId);
      const plan = new Map<string, { contracts: string[]; payments: string[]; lessons: string[]; series: string[] }>();
      const add = (enrollmentId: string, kind: "contracts" | "payments" | "lessons" | "series", id: string) => {
        const p = plan.get(enrollmentId) ?? { contracts: [], payments: [], lessons: [], series: [] };
        p[kind].push(id);
        plan.set(enrollmentId, p);
      };
      const lessonBranch = (l: { enrollmentId: string | null; instrument: string; teacherId: string }) =>
        lessonEnrollmentId(student, { enrollmentId: l.enrollmentId ?? undefined, instrument: l.instrument as Instrument, teacherId: l.teacherId }, teacherRefs);

      if (list.length === 1) {
        const only = list[0]!;
        for (const c of myContracts) if (!c.enrollmentId) add(only.id, "contracts", c.id);
        // 2026-10-10 — yalnız YAPISAL olarak sahibi belli ödeme kaynakları (sözleşme taksidi, kayıt ilk tahsilatı, aylık plan, derse
        // bağlı tahsilat) otomatik bağlanır; elle girilmiş genel satırlar (kitap, kira, cezai işlem…) bir branşa ait olmayabilir:
        // "genel" kalır ve uygulamada "Branşa bağla" ile AÇIKÇA bağlanır (finansal tahmin yok).
        for (const p of myPayments) {
          if (isAutoLinkablePaymentSource(p.source as Payment["source"])) add(only.id, "payments", p.id);
        }
        for (const l of myLessons) {
          if (l.enrollmentId || l.type === "group" || l.clubSessionId) continue;
          if (l.instrument === only.instrument) add(only.id, "lessons", l.id);
          else ambiguous.push({ tenantId, studentId: st.id, studentName: st.name, kind: "lesson", id: l.id, detail: `Ders enstrümanı (${l.instrument}) öğrencinin tek branşıyla (${only.instrument}) eşleşmiyor — geçmiş ders, bağlanmadı.` });
        }
        for (const s of mySeries) if (!s.enrollmentId && s.instrument === only.instrument) add(only.id, "series", s.id);
      } else {
        const resolvedLesson = new Map<string, string>();
        for (const l of myLessons) {
          if (l.type === "group" || l.clubSessionId) continue;
          const id = lessonBranch(l);
          if (id) resolvedLesson.set(l.id, id);
          if (l.enrollmentId) continue;
          if (id) add(id, "lessons", l.id);
          else ambiguous.push({ tenantId, studentId: st.id, studentName: st.name, kind: "lesson", id: l.id, detail: `${l.instrument} dersi birden fazla branşla eşleşiyor veya hiçbiriyle eşleşmiyor.` });
        }
        const seriesBranch = new Map<string, string>();
        for (const s of mySeries) {
          const id = s.enrollmentId ?? lessonBranch({ enrollmentId: null, instrument: s.instrument, teacherId: s.teacherId });
          if (id) seriesBranch.set(s.id, id);
          if (s.enrollmentId) continue;
          if (id) add(id, "series", s.id);
          else ambiguous.push({ tenantId, studentId: st.id, studentName: st.name, kind: "series", id: s.id, detail: `${s.instrument} serisi tek bir branşla eşleşmiyor.` });
        }
        // Sözleşme: kendisinden üretilmiş serilerin HEPSİ aynı branşa çözülüyorsa (sürüm zinciriyle birlikte).
        const contractBranch = new Map<string, string>();
        for (const c of myContracts) if (c.enrollmentId) contractBranch.set(c.id, c.enrollmentId);
        const chainOf = (startId: string) => {
          const chain = new Set([startId]);
          let grew = true;
          while (grew) {
            grew = false;
            for (const c of myContracts) {
              if (chain.has(c.id) && c.previousContractId && !chain.has(c.previousContractId)) {
                chain.add(c.previousContractId);
                grew = true;
              }
              if (c.previousContractId && chain.has(c.previousContractId) && !chain.has(c.id)) {
                chain.add(c.id);
                grew = true;
              }
            }
          }
          return chain;
        };
        const handled = new Set<string>();
        for (const c of myContracts) {
          if (c.enrollmentId || handled.has(c.id)) continue;
          const chain = chainOf(c.id);
          chain.forEach((id) => handled.add(id));
          const branchIds = new Set(mySeries.filter((s) => s.contractId && chain.has(s.contractId)).map((s) => seriesBranch.get(s.id)));
          const unassignedInChain = myContracts.filter((x) => chain.has(x.id) && !x.enrollmentId);
          if (branchIds.size === 1 && !branchIds.has(undefined)) {
            const id = [...branchIds][0]!;
            for (const x of unassignedInChain) {
              add(id, "contracts", x.id);
              contractBranch.set(x.id, id);
            }
          } else {
            for (const x of unassignedInChain) {
              ambiguous.push({ tenantId, studentId: st.id, studentName: st.name, kind: "contract", id: x.id, detail: `${x.contractNumber}: hangi branşa ait olduğu kayıtlardan kesin belirlenemedi (Sözleşme Merkezi → "Branşa bağla").` });
            }
          }
        }
        for (const p of myPayments) {
          const id = (p.contractId ? contractBranch.get(p.contractId) : undefined) ?? (p.lessonId ? resolvedLesson.get(p.lessonId) : undefined);
          if (id) add(id, "payments", p.id);
          else ambiguous.push({ tenantId, studentId: st.id, studentName: st.name, kind: "payment", id: p.id, detail: `"${p.description}" (${p.source}) branşı belirlenemedi (Ödemeler sekmesi → "Branşa bağla").` });
        }
      }

      for (const [enrollmentId, p] of plan) {
        totals.contracts += p.contracts.length;
        totals.payments += p.payments.length;
        totals.lessons += p.lessons.length;
        totals.series += p.series.length;
        tenantChanges += p.contracts.length + p.payments.length + p.lessons.length + p.series.length;
        if (!apply) continue;
        const guard = { tenantId, enrollmentId: null };
        await prisma.$transaction([
          prisma.studentContract.updateMany({ where: { ...guard, id: { in: p.contracts } }, data: { enrollmentId } }),
          prisma.payment.updateMany({ where: { ...guard, id: { in: p.payments } }, data: { enrollmentId } }),
          prisma.lesson.updateMany({ where: { ...guard, id: { in: p.lessons } }, data: { enrollmentId } }),
          prisma.lessonSeries.updateMany({ where: { ...guard, id: { in: p.series } }, data: { enrollmentId } }),
        ]);
      }
    }
    console.log(`[${tenantId}] ${students.length} öğrenci · ${tenantChanges} değişiklik planı`);
  }

  console.log(
    `\nKalıcı yapılan branş kaydı (öğrenci): ${totals.materialized}\nBağlanan: ${totals.contracts} sözleşme, ${totals.payments} ödeme, ${totals.lessons} ders, ${totals.series} seri\nBelirsiz (değiştirilmedi): ${ambiguous.length}`
  );
  const byKind = ambiguous.reduce<Record<string, number>>((acc, a) => ({ ...acc, [a.kind]: (acc[a.kind] ?? 0) + 1 }), {});
  if (ambiguous.length) console.log(`  türe göre: ${JSON.stringify(byKind)}`);
  if (reportPath) {
    writeFileSync(reportPath, JSON.stringify({ generatedAt: new Date().toISOString(), apply, totals, ambiguous }, null, 2));
    console.log(`Rapor yazıldı: ${reportPath}`);
  } else if (ambiguous.length) {
    for (const a of ambiguous.slice(0, 50)) console.log(`  - [${a.tenantId}] ${a.studentName} (${a.studentId}) ${a.kind} ${a.id}: ${a.detail}`);
    if (ambiguous.length > 50) console.log(`  … ${ambiguous.length - 50} satır daha (--report ile tam liste).`);
  }
  console.log(apply ? "\n✅ Yazım tamamlandı." : "\nBu bir DRY-RUN'dı — hiçbir kayıt değiştirilmedi. Onaylıyorsanız --apply ile tekrar çalıştırın.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
