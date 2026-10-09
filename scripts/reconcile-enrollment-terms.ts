/**
 * 2026-10-10 — ÇOKLU BRANŞ v2: branş koşullarını BRANŞ KAYDINA taşıma (mutabakat) betiği.
 *
 * Arka plan: bir önceki sürümde ek branşlar kendi değerlerini taşıyor, ana kaydın koşulları ise öğrenci satırındaki eski
 * alanlarda duruyordu (ana/ek ayrımı). v2'de HER branş kaydı kendi koşullarını (`termsVersion: 2`) taşır; öğrenci satırı
 * yalnız uyumluluk aynasıdır. Uygulama bu geçişi tembelce yapar (branşa yönelik ilk yazımda tüm kayıtlar ya hep ya hiç v2
 * olur). Bu betik aynı dönüşümü ÖNCEDEN, deterministik ve tekrar çalıştırılabilir biçimde yapar ve belirsizlikleri raporlar.
 *
 * Kural (tahmin YOK):
 * - Yalnız `materializeEnrollmentTerms` (uygulamadaki AYNI saf fonksiyon) çalışır: ana kaydın koşulları öğrenci satırından
 *   o kayda KOPYALANIR (ekranda zaten görünen değerler), ek kayıtlar kendi değerlerini korur. Yeni değer UYDURULMAZ.
 * - Öğrenci SATIRI DEĞİŞTİRİLMEZ (ayna zaten ana kayıttan geliyordu); yalnız `Student.enrollments` yazılır.
 * - Tek branşlı öğrenci atlanır (öğrenci satırı zaten onun koşullarıdır; uygulama gerektiğinde tembelce çıkarır).
 * - Raporlanan, DEĞİŞTİRİLMEYEN belirsizlikler: sonlandırılmış ana kayıt (koşullar o kayda kopyalanır, aynası başka branştan
 *   gelmelidir), eksik öğretmen/süre, aynı enstrüman+öğretmenle birden fazla aktif kayıt, ilk tahsilatı olmayan branş.
 *
 * Kullanım (önce her zaman kuru çalıştırma; hedef DB'yi doğrulayın — production yalnız owner onayıyla ve yedekle):
 *   STORE_MODE=db npx tsx scripts/reconcile-enrollment-terms.ts                       # rapor, yazım yok
 *   STORE_MODE=db npx tsx scripts/reconcile-enrollment-terms.ts --tenant <id>         # tek kurum
 *   STORE_MODE=db npx tsx scripts/reconcile-enrollment-terms.ts --report out.json     # JSON rapor
 *   STORE_MODE=db npx tsx scripts/reconcile-enrollment-terms.ts --apply               # yazar
 *
 * Tekrar çalıştırılabilir: `termsVersion: 2` olan öğrenci atlanır; ikinci --apply yeni bir şey bulmaz. Yazım iyimser kilitlidir
 * (`enrollments` değeri okunduğu andaki halinden değiştiyse o öğrenci atlanır ve raporlanır — başka biri düzenlemiştir).
 * Geri alma: --apply öncesi `Student(id, enrollments)` yedeğini alın (betik `--backup backup.json` ile aynı dosyayı yazar).
 * Önkoşul: 20261009120000_payment_enrollment_link migration'ı hedef DB'ye uygulanmış olmalı. Bu işlem YENİ migration gerektirmez.
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import { prisma } from "../src/lib/db";
import { enrollmentTerms, materializeEnrollmentTerms } from "../src/lib/student-enrollments";
import { mapDbStudent } from "../src/lib/store-db";
import type { Prisma } from "@prisma/client";
import type { Instrument, Student, StudentEnrollment } from "../src/lib/types";

type Finding = { tenantId: string; studentId: string; studentName: string; kind: string; detail: string };

/** Anahtarları (iç içe dahil) sıralı, deterministik JSON — iki koşul kümesini birebir karşılaştırmak için. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function argValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (process.env.STORE_MODE !== "db") {
    throw new Error("Bu betik yalnızca STORE_MODE=db ile çalışır. Örnek: STORE_MODE=db npx tsx scripts/reconcile-enrollment-terms.ts");
  }
  const apply = process.argv.includes("--apply");
  const onlyTenant = argValue("--tenant");
  const reportPath = argValue("--report");
  const backupPath = argValue("--backup");
  console.log(`== Branş koşulları mutabakatı (v2) — ${apply ? "APPLY (kalıcı yazım)" : "DRY-RUN (yalnızca rapor)"} ==\n`);

  const tenants = onlyTenant ? [onlyTenant] : (await prisma.student.findMany({ distinct: ["tenantId"], select: { tenantId: true } })).map((t) => t.tenantId);
  const totals = { students: 0, single: 0, alreadyV2: 0, noEnrollments: 0, toMaterialize: 0, written: 0, skippedConcurrent: 0 };
  const findings: Finding[] = [];
  const backup: { id: string; tenantId: string; enrollments: unknown }[] = [];

  for (const tenantId of tenants) {
    const [students, teachers, firstPayments] = await Promise.all([
      // TAM satır: ana kaydın koşulları (ödeme yöntemi/günü, indirim, kayıt/ders tarihleri, MEB…) öğrenci satırından kopyalanır;
      // dar bir select bu alanları boş bırakıp veri kaybettirirdi. Eşleme uygulamadakiyle AYNI (`mapDbStudent`).
      prisma.student.findMany({ where: { tenantId, deletedAt: null } }),
      prisma.teacher.findMany({ where: { tenantId }, select: { id: true, instruments: true } }),
      prisma.payment.findMany({
        where: { tenantId, source: "registration_first_payment", NOT: { status: "voided" } },
        select: { studentId: true, enrollmentId: true },
      }),
    ]);
    const teacherRefs = teachers.map((t) => ({ id: t.id, instruments: (t.instruments as Instrument[] | null) ?? [] }));
    const firstPaymentKeys = new Set(firstPayments.map((p) => `${p.studentId}:${p.enrollmentId ?? ""}`));

    for (const st of students) {
      totals.students++;
      const list = (st.enrollments as unknown as StudentEnrollment[] | null) ?? [];
      if (list.length === 0) {
        totals.noEnrollments++;
        continue;
      }
      if (list.length === 1) {
        totals.single++;
        continue;
      }
      const note = (kind: string, detail: string) => findings.push({ tenantId, studentId: st.id, studentName: st.name, kind, detail });

      // Aynı enstrüman + öğretmenle birden fazla AKTİF kayıt (uygulama artık yeni kaydı engeller; eski veri olabilir).
      const seen = new Map<string, string>();
      for (const e of list.filter((x) => x.active)) {
        const key = `${e.instrument}::${e.teacherId ?? ""}`;
        if (seen.has(key)) note("duplicate-active", `${e.instrument} için aynı öğretmenle iki aktif kayıt (${seen.get(key)}, ${e.id}) — birini sonlandırın.`);
        else seen.set(key, e.id);
      }
      for (const e of list.filter((x) => x.active)) {
        if (!firstPaymentKeys.has(`${st.id}:${e.id}`)) {
          note("no-first-collection", `${e.instrument} (${e.id}) branşının kayıt anı ilk tahsilatı sistemde yok (sözleşmenin "İlk tahsilat" bölümünden girilebilir; geçmiş kayıt için tahmin yazılmaz).`);
        }
      }

      if (list.every((e) => e.termsVersion === 2)) {
        totals.alreadyV2++;
        continue;
      }

      const base: Student = mapDbStudent(st);

      const anchor = list.find((e) => e.primary) ?? list[0]!;
      if (!anchor.active) {
        note("ended-anchor", `Ana kayıt (${anchor.instrument}, ${anchor.id}) sonlandırılmış; öğrenci satırındaki koşullar bu (sonlandırılmış) kayda kopyalanır. Aktif branşların koşullarını Özet → Branş kayıtları'ndan kontrol edin.`);
      }
      for (const e of list.filter((x) => x.active)) {
        if (e !== anchor && (!e.teacherId || !e.lessonDurationMinutes)) {
          note("incomplete-terms", `${e.instrument} (${e.id}) kaydında öğretmen veya ders süresi eksik — uydurulmaz; branş düzenlemeden tamamlanmalı.`);
        }
      }

      const next = materializeEnrollmentTerms(base, list, teacherRefs);
      // DOĞRULAMA: materialize sonrası HER branşın koşulları, materialize ÖNCESİ görünenle birebir aynı olmalı. Fark varsa
      // (beklenmeyen alan/veri biçimi) o öğrenci YAZILMAZ, raporlanır — betik değer kaybettiremez.
      const view = (enr: StudentEnrollment[], id: string) => {
        const e = enr.find((x) => x.id === id)!;
        const { source, ...t } = enrollmentTerms({ ...base, enrollments: enr }, e, teacherRefs);
        void source;
        return stable(t);
      };
      const drift = list.filter((e) => view(list, e.id) !== view(next, e.id));
      if (drift.length > 0) {
        note("terms-drift", `Materialize sonrası koşullar farklı çıktı (${drift.map((e) => `${e.instrument}/${e.id}`).join(", ")}); öğrenci atlandı — elle inceleyin.`);
        continue;
      }
      totals.toMaterialize++;
      if (backupPath) backup.push({ id: st.id, tenantId, enrollments: st.enrollments });
      if (!apply) continue;
      // İyimser kilit: yalnız okunduğumuz hâlin aynısı hâlâ duruyorsa yaz.
      const res = await prisma.student.updateMany({
        where: { id: st.id, tenantId, enrollments: { equals: st.enrollments as unknown as Prisma.InputJsonValue } },
        data: { enrollments: next as unknown as Prisma.InputJsonValue },
      });
      if (res.count === 1) totals.written++;
      else {
        totals.skippedConcurrent++;
        note("changed-meanwhile", "Okunduktan sonra başka bir işlemle değişti; atlandı. Betiği yeniden çalıştırın.");
      }
    }
  }

  console.log("Özet:", JSON.stringify(totals, null, 2));
  const byKind = new Map<string, number>();
  for (const f of findings) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
  console.log("\nBelirsizlik / dikkat gerektirenler:", Object.fromEntries(byKind));
  for (const f of findings.slice(0, 40)) console.log(` - [${f.kind}] ${f.studentName} (${f.studentId}): ${f.detail}`);
  if (findings.length > 40) console.log(` … ${findings.length - 40} kayıt daha (--report ile tam liste).`);
  if (reportPath) {
    writeFileSync(reportPath, JSON.stringify({ apply, totals, findings }, null, 2));
    console.log(`\nRapor yazıldı: ${reportPath}`);
  }
  if (backupPath) {
    writeFileSync(backupPath, JSON.stringify(backup, null, 2));
    console.log(`Yedek (önceki enrollments değerleri) yazıldı: ${backupPath}`);
  }
  if (!apply) console.log("\nDRY-RUN: hiçbir şey yazılmadı. Yazmak için önce yedek alın, sonra --apply ile çalıştırın.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
