/**
 * TEST-ONLY — mobil UAT SELF + GUARDIAN fixture'ı için idempotent SQL üretir.
 *
 * Neden SQL üretir: test Supabase'e (`neviihub-test`) yerelde güvenli bir connection
 * string yok; SQL, project ref'i SABİT (TEST_SUPABASE_REF) Supabase SQL aracına
 * uygulanır. Şifre hash'i uygulamanın gerçek `hashPassword`'ü (bcrypt) ile üretilir.
 * Şifre/e-posta YALNIZ env'den okunur; kaynakta/Git'te/çıktıda yer almaz. SQL dosyası
 * hash içerdiği için 0600 yazılır — repo DIŞINDA bir yol verin.
 *
 * Kullanım:
 *   UAT_SELF_EMAIL=… UAT_SELF_PASSWORD=… UAT_GUARDIAN_EMAIL=… UAT_GUARDIAN_PASSWORD=… \
 *     npx tsx scripts/uat-mobile-portal-fixtures.ts --out /güvenli/yol/uat.sql
 *
 * Tekrar çalıştırma: sabit id + ON CONFLICT — kopya user/student/access oluşmaz; ders
 * tarihleri bugüne göre yenilenir. Aynı e-posta fixture DIŞI bir kullanıcıya aitse
 * transaction hata ile durur (gerçek hesaplara dokunulmaz).
 */
import { writeFileSync } from "fs";
import { hashPassword } from "../src/lib/auth/password";
import { assertNotProductionRuntime, TEST_SUPABASE_REF } from "../src/lib/env/test-target-guard";

// neviihub-test kurum tenant'ı ve mevcut referans kayıtları (salt-okunur kullanılır).
const TENANT = "tenant_nilufer_acar";
const SCHOOL = "cmtq11ecc0000kbrgm38tmuwk";
const BRANCH = "erzene";
const TEACHER = "t1";
const ROOM = "r1";

function need(name: string, min = 1): string {
  const v = (process.env[name] ?? "").trim();
  if (v.length < min) throw new Error(`${name} gerekli (en az ${min} karakter).`);
  return v;
}

const q = (v: string | null) => (v === null ? "NULL" : `'${v.replace(/'/g, "''")}'`);

type Fixture = { key: string; email: string; hash: string; accessType: "SELF" | "GUARDIAN"; userName: string; studentName: string };

function fixtureSql(f: Fixture, now: Date): string {
  const userId = `user_uat_mobile_${f.key}`;
  const studentId = `stu_uat_mobile_${f.key}`;
  const self = f.accessType === "SELF";
  const lessons = [1, 8, 15, 22].map((days, i) => {
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() + days);
    start.setUTCHours(12, 0, 0, 0); // 15:00 Europe/Istanbul
    const end = new Date(start.getTime() + 45 * 60 * 1000);
    return `INSERT INTO "Lesson" (id,"tenantId","studentId","teacherId","roomId","branchId","schoolId",instrument,"startAt","endAt",type,status)
  VALUES (${q(`les_uat_mobile_${f.key}_${i + 1}`)},${q(TENANT)},${q(studentId)},${q(TEACHER)},${q(ROOM)},${q(BRANCH)},${q(SCHOOL)},'Piyano',${q(start.toISOString())},${q(end.toISOString())},'regular','scheduled')
  ON CONFLICT (id) DO UPDATE SET "startAt"=EXCLUDED."startAt","endAt"=EXCLUDED."endAt",status='scheduled';`;
  });
  const due = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  return `
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "User" WHERE "tenantId"=${q(TENANT)} AND lower(email)=lower(${q(f.email)}) AND id<>${q(userId)}) THEN
    RAISE EXCEPTION 'UAT e-postası fixture dışı bir kullanıcıya ait — durduruldu';
  END IF;
END $$;
INSERT INTO "Student" (id,"tenantId",name,email,phone,"parentName","accountResponsibility","branchId","schoolId",instruments,"teacherId","packageName","weeklyLessonCount","monthlyFee",active,notes)
  VALUES (${q(studentId)},${q(TENANT)},${q(f.studentName)},${q(f.email)},'',${q(self ? null : f.userName)},${q(self ? "SELF_MANAGED" : "PARENT_MANAGED")},${q(BRANCH)},${q(SCHOOL)},'["Piyano"]',${q(TEACHER)},'Bireysel Aylık — 4 ders',1,0,true,'TEST-ONLY mobil UAT fixture')
  ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,active=true,"archivedAt"=NULL;
INSERT INTO "User" (id,"tenantId",email,"passwordHash",role,"studentId",active,"displayName","updatedAt")
  VALUES (${q(userId)},${q(TENANT)},lower(${q(f.email)}),${q(f.hash)},'STUDENT',${q(self ? studentId : null)},true,${q(f.userName)},now())
  ON CONFLICT (id) DO UPDATE SET "passwordHash"=EXCLUDED."passwordHash",active=true,"deletedAt"=NULL,"studentId"=EXCLUDED."studentId","updatedAt"=now();
INSERT INTO "StudentPortalAccess" (id,"tenantId","userId","studentId","accessType",status,"invitedBy","activatedAt","updatedAt")
  VALUES (${q(`spa_uat_mobile_${f.key}`)},${q(TENANT)},${q(userId)},${q(studentId)},${q(f.accessType)},'active','uat_fixture_script',now(),now())
  ON CONFLICT ("tenantId","userId","studentId") DO UPDATE SET status='active',"accessType"=EXCLUDED."accessType","revokedAt"=NULL,"activatedAt"=COALESCE("StudentPortalAccess"."activatedAt",now()),"updatedAt"=now();
${lessons.join("\n")}
INSERT INTO "Homework" (id,"tenantId","teacherId","studentId",title,description,"dueDate","updatedAt")
  VALUES (${q(`hw_uat_mobile_${f.key}_1`)},${q(TENANT)},${q(TEACHER)},${q(studentId)},'UAT: Do majör gam','TEST-ONLY — haftada 3 gün 10 dk çalışın.',${q(due)},now())
  ON CONFLICT (id) DO UPDATE SET "dueDate"=EXCLUDED."dueDate","updatedAt"=now();`;
}

async function main() {
  assertNotProductionRuntime();
  if (!TEST_SUPABASE_REF) {
    throw new Error("TEST_SUPABASE_REF tanımlı değil: uzak test DB'si yok (local-first). Önce geçici test projesini açıp ref'ini verin.");
  }
  const outIdx = process.argv.indexOf("--out");
  const out = outIdx > 0 ? process.argv[outIdx + 1] : "";
  if (!out || out.startsWith(process.cwd())) throw new Error("--out repo DIŞINDA bir dosya yolu olmalı.");

  const now = new Date();
  const fixtures: Fixture[] = [
    {
      key: "self",
      email: need("UAT_SELF_EMAIL"),
      hash: await hashPassword(need("UAT_SELF_PASSWORD", 12)),
      accessType: "SELF",
      userName: "Mobile UAT Self Student",
      studentName: "Mobile UAT Self Student",
    },
    {
      key: "guardian",
      email: need("UAT_GUARDIAN_EMAIL"),
      hash: await hashPassword(need("UAT_GUARDIAN_PASSWORD", 12)),
      accessType: "GUARDIAN",
      userName: "Mobile UAT Guardian",
      studentName: "Mobile UAT Guardian Student",
    },
  ];
  const sql = `-- TEST-ONLY: yalnız Supabase projesi ${TEST_SUPABASE_REF} (neviihub-test).
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Tenant" WHERE id=${q(TENANT)}) THEN RAISE EXCEPTION 'beklenen test tenant yok — durduruldu'; END IF;
END $$;
${fixtures.map((f) => fixtureSql(f, now)).join("\n")}
COMMIT;
`;
  writeFileSync(out, sql, { mode: 0o600 });
  console.log(`[OK] UAT fixture SQL yazıldı (0600). Yalnız ${TEST_SUPABASE_REF} projesine uygulayın.`);
}

main().catch((e) => {
  console.error("[HATA]", e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
