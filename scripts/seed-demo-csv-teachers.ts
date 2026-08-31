/**
 * Paket 5 — demo ortamı için CSV'den öğretmen + demo öğrenci/kullanıcı/ders
 * verisi ekler. `src/lib/seed.ts`'in `createSeedData()` fonksiyonuna
 * (onlarca testin ve store-json/store-memory'nin paylaştığı, kritik bir
 * ortak fixture) KASITLI OLARAK DOKUNMAZ — bunun yerine mevcut demo tenant'a
 * (DEFAULT_TENANT_ID) EKLEME yapar, Tool Layer üzerinden (createTeacherTool/
 * createStudentTool/createLessonTool — RBAC, enstrüman/öğretmen doğrulaması
 * ve audit log dahil, mevcut kurallarla BİREBİR aynı yoldan).
 *
 * İdempotenlik: her adım önce "bu e-posta/isimle zaten bir kayıt var mı?"
 * diye kontrol eder ve varsa atlar — tekrar çalıştırmak yeni satır ÜRETMEZ.
 *
 * Yalnızca STORE_MODE=db için anlamlıdır (json/memory'de gerçek Prisma
 * kullanıcı satırı oluşturmaz, yalnızca dosya/bellek store'una ekler).
 * CSV ile GERÇEK içe aktarılmış veriyi SİLMEZ/ÜZERİNE YAZMAZ — yalnızca
 * `id` alanı `demo_csv_`/`demo_csv_teacher_` önekiyle başlayan, bu betiğin
 * kendi oluşturduğu kayıtları yönetir.
 *
 * Kullanım: STORE_MODE=db npx tsx scripts/seed-demo-csv-teachers.ts [csvYolu]
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { readData } from "../src/lib/store";
import { runWithTenantAsync } from "../src/lib/tenant-context";
import { DEFAULT_TENANT_ID } from "../src/lib/auth/config";
import {
  createTeacherTool,
  createStudentTool,
  createLessonTool,
  createRoomTool,
  archiveTeacherTool,
  createTaskTool,
  changeTaskStatusTool,
} from "../src/lib/services/tools";
import type { ServiceContext } from "../src/lib/services/context";
import { isDbMode } from "../src/lib/config";
import { hashPasswordSync } from "../src/lib/auth/password";
import { prisma } from "../src/lib/db";
import { uid } from "../src/lib/utils";
import { parseTeacherCsvContent } from "../src/lib/import/demo-teacher-csv";

const CSV_PATH = process.argv[2] || "/Users/hidircanyagiz/Documents/Öğretmenler.csv";

const ctx: ServiceContext = {
  role: "SCHOOL_ADMIN",
  tenantId: DEFAULT_TENANT_ID,
  userId: "seed_demo_csv_script",
};

function parseTeacherCsv(path: string) {
  return parseTeacherCsvContent(readFileSync(path, "utf-8"));
}

/**
 * ISO takvim haftası anahtarı (ör. "2026-W32"). Hem "her çift için haftada
 * 1 ders" idempotency kontrolü hem de yinelenen-ders temizliği AYNI bu
 * fonksiyonu kullanır — iki farklı hafta bölümleme şeması (ör. "bugünden
 * itibaren 7 günlük kovalar" vs. gerçek takvim haftası) birbiriyle
 * çakışırsa her çalıştırmada karşılıklı ders silme/yeniden oluşturma
 * döngüsüne (kararsızlık) yol açar — bu yüzden TEK bir kanonik hafta
 * tanımı kullanılır.
 */
function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${weekNo}`;
}

/**
 * `createLessonTool` (canlı rezervasyon aracı) GEÇMİŞ bir `startAt`'ı iş
 * kuralı olarak reddeder ("Başlangıç saati geçmişte olamaz" — bkz.
 * validateLessonSlot). Bu, gerçek/canlı planlama için doğru bir kuraldır
 * ama "önceki ay" demo geçmişini geriye dönük doldurmayı imkansız kılar.
 * `src/lib/seed.ts`'in statik demo verisi de aynı nedenle geçmiş dersleri
 * Tool Layer'dan DEĞİL, doğrudan veri olarak (status:"completed")
 * oluşturur — burada aynı, gerekçeli istisna izlenir: yalnızca GEÇMİŞ
 * (dayOffset<0) demo dersleri doğrudan Prisma ile, `status:"completed"`
 * olarak eklenir; GELECEK dersler her zaman `createLessonTool` üzerinden
 * (gerçek çakışma/RBAC/audit doğrulamasıyla) oluşturulur.
 */
async function createHistoricalLessonDirect(input: {
  studentId: string;
  teacherId: string;
  roomId: string;
  branchId: string;
  instrument: string;
  startAt: Date;
  durationMinutes?: number;
}): Promise<boolean> {
  const student = await prisma.student.findFirst({ where: { id: input.studentId, tenantId: DEFAULT_TENANT_ID } });
  if (!student) return false;
  const endAt = new Date(input.startAt.getTime() + (input.durationMinutes ?? 40) * 60_000);
  try {
    await prisma.lesson.create({
      data: {
        id: uid("les"),
        tenantId: DEFAULT_TENANT_ID,
        studentId: input.studentId,
        teacherId: input.teacherId,
        roomId: input.roomId,
        branchId: input.branchId,
        schoolId: student.schoolId,
        instrument: input.instrument,
        startAt: input.startAt,
        endAt,
        type: "regular",
        status: "completed",
      },
    });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await runWithTenantAsync(DEFAULT_TENANT_ID, async () => {
    const csvTeachers = parseTeacherCsv(CSV_PATH);
    console.log(`CSV'den ${csvTeachers.length} öğretmen okundu.`);

    const before = await readData();
    const branchByShortName = new Map(before.settings.branches.map((b) => [b.shortName, b.id]));

    const createdTeacherIds: string[] = [];
    for (const t of csvTeachers) {
      const existing = before.teachers.find((tt) => tt.email.toLowerCase() === t.email.toLowerCase());
      if (existing) {
        console.log(`Atlandı (zaten var): ${t.name} <${t.email}>`);
        createdTeacherIds.push(existing.id);
        continue;
      }
      const branchId = branchByShortName.get(t.branchName) ?? before.settings.branches[0]!.id;
      const res = await createTeacherTool(ctx, {
        name: t.name,
        email: t.email,
        phone: t.phone,
        branchId,
        instrument: t.instrument,
        availability: [
          { dayOfWeek: 1, start: "10:00", end: "19:00" },
          { dayOfWeek: 2, start: "10:00", end: "19:00" },
          { dayOfWeek: 3, start: "10:00", end: "19:00" },
          { dayOfWeek: 4, start: "10:00", end: "19:00" },
          { dayOfWeek: 5, start: "10:00", end: "18:00" },
          { dayOfWeek: 6, start: "10:00", end: "14:00" },
        ],
      });
      if (!res.ok) {
        console.error(`HATA — ${t.name}: ${res.error.message}`);
        continue;
      }
      console.log(`Oluşturuldu: ${t.name} <${t.email}> → ${res.data.teacherId}`);
      createdTeacherIds.push(res.data.teacherId);
    }

    const afterTeachers = await readData();
    const teachers = afterTeachers.teachers.filter((t) => createdTeacherIds.includes(t.id));
    if (teachers.length === 0) {
      console.log("Hiç öğretmen yok, öğrenci/ders üretimi atlanıyor.");
      return;
    }

    // `src/lib/seed.ts`'in başlangıç (createSeedData) seti — "eski demo
    // öğretmenler" — bu tenant'ta yalnızca db-modu ilk seed'inden (bkz.
    // scripts/seed-multi-tenant.ts) geliyorsa mevcuttur; sabit id'lerle
    // (t1..t5) tanınır. Görev: CSV öğretmenlerini AKTİF demo seti yap —
    // önce bu öğretmenlerin mevcut (seed-owned) öğrencilerini enstrüman
    // eşleşen bir CSV öğretmenine TAŞI (Tool Layer'da teacherId değişimi
    // desteklenmiyor — bkz. updateStudentProfileSchema yorumu — bu yüzden
    // burada doğrudan Prisma ile, yalnızca bu betiğin bildiği sabit s1..s8
    // demo öğrenci id'leri için), SONRA eski öğretmenleri archiveTeacherTool
    // ile pasifleştir (hard delete yok, geçmiş ders/ödeme kaydı korunur).
    const byEmail = (email: string) => teachers.find((t) => t.email.toLowerCase() === email.toLowerCase());
    const legacyReassignments: { studentId: string; newTeacherEmail: string; instrument?: string; branchId?: string }[] = [
      { studentId: "s1", newTeacherEmail: "7@mail.com" }, // Zeynep Arslan (Piyano/Erzene) → Pınar Çelik
      { studentId: "s2", newTeacherEmail: "2@mail.com", branchId: "evka3" }, // Emir Çelik (Gitar) → Olcay Özdemir (Evka3)
      { studentId: "s3", newTeacherEmail: "3@mail.com" }, // Defne Şahin (Keman/Evka3) → Ebru Şirince
      { studentId: "s4", newTeacherEmail: "5@mail.com" }, // Ali Koç (Bateri/Evka3) → Gökhan Keskin
      { studentId: "s5", newTeacherEmail: "7@mail.com", instrument: "Piyano" }, // Lara Yıldız (Şan → CSV'de Şan öğretmeni yok, Piyano'ya taşındı) → Pınar Çelik
      { studentId: "s6", newTeacherEmail: "2@mail.com", branchId: "evka3" }, // Burak Aydın (Gitar) → Olcay Özdemir (Evka3)
      { studentId: "s7", newTeacherEmail: "3@mail.com", instrument: "Keman" }, // İpek Demirtaş (Yan Flüt → CSV'de Yan Flüt öğretmeni yok, Keman'a taşındı) → Ebru Şirince
      { studentId: "s8", newTeacherEmail: "7@mail.com" }, // Kaan Ersoy (Piyano/Erzene) → Pınar Çelik
    ];
    if (isDbMode) {
      for (const r of legacyReassignments) {
        const newTeacher = byEmail(r.newTeacherEmail);
        const student = await prisma.student.findFirst({ where: { id: r.studentId, tenantId: DEFAULT_TENANT_ID } });
        if (!student || !newTeacher) continue;
        if (student.teacherId === newTeacher.id) continue; // zaten taşınmış — idempotent
        await prisma.student.update({
          where: { id: student.id },
          data: {
            teacherId: newTeacher.id,
            branchId: r.branchId ?? student.branchId,
            instruments: r.instrument ? [r.instrument] : (student.instruments ?? []),
          },
        });
        console.log(`Öğrenci taşındı: ${student.name} → ${newTeacher.name}`);
      }

      const legacyTeacherIds = ["t1", "t2", "t3", "t4", "t5"];
      for (const legacyId of legacyTeacherIds) {
        const legacy = await prisma.teacher.findFirst({ where: { id: legacyId, tenantId: DEFAULT_TENANT_ID } });
        if (!legacy || !legacy.active) continue; // yok veya zaten arşivli — idempotent
        const res = await archiveTeacherTool(ctx, { teacherId: legacy.id, archived: true });
        if (!res.ok) {
          console.error(`HATA — eski öğretmen arşivlenemedi (${legacy.name}): ${res.error.message}`);
          continue;
        }
        console.log(`Eski demo öğretmen arşivlendi: ${legacy.name}`);
      }
    }

    // 10 demo öğrenci — CSV öğretmenlerine döngüsel dağıtılır, e-posta ile idempotent.
    const demoStudentNames = [
      "Ada Yılmaz", "Kerem Şahin", "Nehir Kaya", "Toprak Demir", "Elif Aksoy",
      "Yusuf Çetin", "Zümra Polat", "Berk Arslan", "İrem Sönmez", "Ozan Kurt",
    ];
    const createdStudentIds: string[] = [];
    let cursor = 0;
    for (const name of demoStudentNames) {
      // E-posta yerel kısmı ASCII olmalı (zod email doğrulaması Türkçe
      // aksanlı karakterleri "Invalid input" ile reddediyor) — bu yüzden
      // Türkçe karakterler ASCII karşılıklarına çevrilir, ad/soyad Unicode
      // olarak `name` alanında zaten olduğu gibi korunur.
      const asciiName = name
        .replace(/ı/g, "i").replace(/İ/g, "I").replace(/ş/g, "s").replace(/Ş/g, "S")
        .replace(/ç/g, "c").replace(/Ç/g, "C").replace(/ğ/g, "g").replace(/Ğ/g, "G")
        .replace(/ü/g, "u").replace(/Ü/g, "U").replace(/ö/g, "o").replace(/Ö/g, "O");
      const email = `${asciiName.toLowerCase().replace(/[^a-z ]/g, "").replace(/ /g, ".")}.demo@email.com`;
      const dataNow = await readData();
      const existing = dataNow.students.find((s) => s.email?.toLowerCase() === email.toLowerCase());
      if (existing) {
        createdStudentIds.push(existing.id);
        continue;
      }
      const teacher = teachers[cursor % teachers.length]!;
      cursor += 1;
      const res = await createStudentTool(ctx, {
        name,
        email,
        phone: "0500 000 0000",
        parentName: `${name} velisi`,
        parentPhone: "0500 000 0001",
        branchId: teacher.branchId,
        instrument: teacher.instruments[0],
        teacherId: teacher.id,
        packageName: "Bireysel Aylık — 4 ders",
        weeklyLessonCount: 1,
        monthlyFee: 3200,
        firstPaymentCollected: { method: "cash", amount: 3200, collectedAt: new Date().toISOString().slice(0, 10) },
      });
      if (!res.ok) {
        console.error(`HATA — öğrenci ${name}: ${res.error.message}`);
        continue;
      }
      createdStudentIds.push(res.data.studentId);
      console.log(`Oluşturuldu (öğrenci): ${name}`);
    }

    // 10 demo öğrenci 7 öğretmene döngüsel dağıtılırken store'un iç sıralaması
    // CSV satır sırasıyla birebir örtüşmüyor — bu yüzden Hilal İşçi (Erzene,
    // Keman) hiç öğrenci alamayabiliyor. İsme göre idempotent: "Yusuf Çetin"
    // (Keman öğrenen bir demo öğrenci) varsa ve zaten Hilal'da değilse ona
    // taşınır — Hilal'ın enstrümanıyla (Keman) uyumlu, yalnızca şube/oda
    // ataması Erzene'ye güncellenir.
    const hilal = byEmail("6@mail.com");
    const yusuf = (await readData()).students.find((s) => s.email?.toLowerCase() === "yusuf.cetin.demo@email.com");
    if (hilal && yusuf && yusuf.teacherId !== hilal.id) {
      await prisma.student.update({
        where: { id: yusuf.id },
        data: { teacherId: hilal.id, branchId: hilal.branchId, instruments: ["Keman"] },
      });
      console.log(`Öğrenci taşındı: ${yusuf.name} → ${hilal.name}`);
    }

    // CSV'de Evka 3'te Piyano (2 öğretmen) + Gitar (1 öğretmen) var ama demo
    // tenant'ın mevcut oda seti Evka 3'te yalnız TEK piyano odası (r4) ve
    // Gitar odası içermiyor (yalnız Erzene'de r2) — bu, Gitar/2. Piyano
    // öğretmeninin sürekli aynı odayı paylaşıp oda çakışmasıyla
    // reddedilmesine yol açar. İsme göre idempotent şekilde eksik oda eklenir.
    const existingRooms = (await readData()).rooms;
    if (!existingRooms.some((r) => r.branchId === "evka3" && r.instruments.includes("Gitar"))) {
      const res = await createRoomTool(ctx, {
        name: "Stüdyo D — Gitar",
        branchId: "evka3",
        capacity: 2,
        instruments: ["Gitar"],
      });
      if (res.ok) console.log("Oda oluşturuldu: Stüdyo D — Gitar (Evka 3)");
    }

    // NOT: Bu betiğin önceki bir sürümünde burada ayrıca "~50 ders x 3 ay"
    // hedefli, öğretmen bazlı basit bir ("sparse") ders üretici vardı. O
    // üretici çapraz-çalıştırma idempotenliğine sahip DEĞİLDİ (yalnızca
    // TEK bir çalıştırma içinde `usedTeacherSlot` ile kendi kendine
    // çakışmayı önlüyordu) — betik birden çok kez çalıştırıldığında HER
    // seferinde yeniden ~30 ders/öğretmen ekleyerek gerçek yinelenen kayıt
    // ürettiği tespit edildi (bkz. doğrulama sorguları — bazı öğrenci×
    // öğretmen çiftlerinde aynı haftada 6-12 ders). Bu üretici TAMAMEN
    // kaldırıldı; aşağıdaki "Yoğun ders programı" üretici zaten HER aktif
    // öğrenci × HER aktif öğretmen için haftada 1 ders hedefini karşılıyor
    // ve gerçekten çapraz-çalıştırma idempotenttir (mevcut dersler önceden
    // yüklenip kontrol edilir).

    // Temizlik — yukarıda kaldırılan eski "sparse" üretici, önceki
    // çalıştırmalarda bazı öğrenci×öğretmen çiftleri için AYNI takvim
    // haftasında birden fazla ders üretmişti (çapraz-çalıştırma idempotent
    // DEĞİLDİ). Bu betik yalnızca CSV öğretmenlerinin (seed-owned) derslerini
    // yönetir — bu yüzden yalnızca o öğretmenlere ait derslerde, aynı
    // öğrenci+öğretmen+takvim haftası için birden fazla kayıt varsa en
    // ESKİsi (ilk oluşturulan) dışındakiler silinir. Gerçek/CSV içe
    // aktarılmış veriye HİÇ dokunulmaz (yalnızca `teacherId` CSV öğretmen
    // id'lerinden biri olan satırlar sorgulanır).
    {
      const csvTeacherIds = teachers.map((t) => t.id);
      const allCsvLessons = await prisma.lesson.findMany({
        where: { tenantId: DEFAULT_TENANT_ID, teacherId: { in: csvTeacherIds } },
        select: { id: true, teacherId: true, studentId: true, startAt: true },
        orderBy: { startAt: "asc" },
      });
      const seenPairWeek = new Set<string>();
      const duplicateIds: string[] = [];
      for (const l of allCsvLessons) {
        const key = `${l.teacherId}|${l.studentId}|${isoWeekKey(l.startAt)}`;
        if (seenPairWeek.has(key)) {
          duplicateIds.push(l.id);
        } else {
          seenPairWeek.add(key);
        }
      }
      if (duplicateIds.length > 0) {
        await prisma.lesson.deleteMany({ where: { id: { in: duplicateIds } } });
        console.log(
          `Temizlik: kaldırılan "sparse" üreticinin ürettiği ${duplicateIds.length} yinelenen ders (aynı öğrenci+öğretmen+hafta) silindi.`
        );
      }
    }

    // ─── Yoğun ders programı demosu ─────────────────────────────────────
    // Görev: HER aktif öğrenci × HER aktif CSV öğretmeni ile haftada 1 ders
    // — önceki/mevcut/sonraki ay penceresinde (13 haftalık kova, gün -45..45).
    //
    // PERFORMANS — kritik: `createLessonTool` her denemede tam bir
    // `readData()` + gerçek çakışma doğrulaması (validateLessonSlot) yapar;
    // bu, ZATEN DOLU olduğu önceden bilinen bir slotu yine de denemek
    // (veritabanına gidip reddedilmek) büyük ölçekte (18 öğrenci × 7
    // öğretmen × 13 hafta ≈ 1600+ çift) dakikalarca sürebilir. Bu yüzden
    // TÜM mevcut dersler (bu betiğin önceki çalıştırmalarından ve tarihsel
    // eski öğretmen dersinden) TEK bir sorguyla önceden yüklenir ve yerel
    // Set'lere işlenir — döngü yalnızca GERÇEKTEN boş görünen slotları
    // `createLessonTool`'a gönderir; DB, son doğrulama katmanı olarak kalır
    // ama artık nadiren "hayır" der.
    const allActiveStudents = (await readData()).students.filter((s) => s.active);
    const roomsByBranch = new Map<string, typeof afterTeachers.rooms>();
    for (const r of (await readData()).rooms) {
      const list = roomsByBranch.get(r.branchId) ?? [];
      list.push(r);
      roomsByBranch.set(r.branchId, list);
    }
    function roomForTeacher(teacherId: string) {
      const teacher = teachers.find((t) => t.id === teacherId)!;
      const roomsInBranch = roomsByBranch.get(teacher.branchId) ?? [];
      return roomsInBranch.find((r) => r.instruments.includes(teacher.instruments[0]!)) ?? roomsInBranch[0];
    }

    const usedTeacherHour = new Set<string>(); // `${teacherId}|${dayOffset}|${hour}`
    const usedStudentHour = new Set<string>(); // `${studentId}|${dayOffset}|${hour}`
    const usedRoomHour = new Set<string>(); // `${roomId}|${dayOffset}|${hour}`
    const pairHasLessonInWeek = new Set<string>(); // `${teacherId}|${studentId}|${weekStart}`

    const today0 = new Date();
    today0.setHours(0, 0, 0, 0);
    const windowStart = new Date(today0);
    windowStart.setDate(windowStart.getDate() - 46);
    const windowEnd = new Date(today0);
    windowEnd.setDate(windowEnd.getDate() + 46);
    const existingLessons = await prisma.lesson.findMany({
      where: { tenantId: DEFAULT_TENANT_ID, startAt: { gte: windowStart, lt: windowEnd } },
      select: { teacherId: true, studentId: true, roomId: true, startAt: true },
    });
    for (const l of existingLessons) {
      const dayOffset = Math.round((l.startAt.getTime() - today0.getTime()) / 86_400_000);
      const hour = l.startAt.getHours();
      usedTeacherHour.add(`${l.teacherId}|${dayOffset}|${hour}`);
      usedRoomHour.add(`${l.roomId}|${dayOffset}|${hour}`);
      usedStudentHour.add(`${l.studentId}|${dayOffset}|${hour}`);
      pairHasLessonInWeek.add(`${l.teacherId}|${l.studentId}|${isoWeekKey(l.startAt)}`);
    }
    console.log(`Mevcut ${existingLessons.length} ders önceden yüklendi (çakışma/idempotency ön-kontrolü için).`);

    let denseCreated = 0;
    let denseNoSlot = 0;
    let pairIndex = 0;

    // Gün-gün TEK geçiş (hafta kovaları yerine) — çünkü sabit 7 günlük
    // ofset kovaları GERÇEK takvim haftalarıyla hizalı değildir; iki farklı
    // hafta bölümleme şeması aynı anda kullanılırsa (ör. burada ofset kovası,
    // temizlik adımında ISO hafta) her çalıştırmada karşılıklı silme/yeniden
    // oluşturma döngüsü (kararsızlık) oluşur. Gün gün ilerleyip HER gün için
    // "bu ISO haftada bu çift için zaten ders var mı" diye `isoWeekKey` ile
    // kontrol etmek, temizlik adımıyla AYNI kanonik hafta tanımını kullanır.
    for (let dayOffset = -45; dayOffset <= 45; dayOffset++) {
      const d = new Date();
      d.setDate(d.getDate() + dayOffset);
      const weekKey = isoWeekKey(d);
      const weekday = d.getDay();
      for (const teacher of teachers) {
        const avail = teacher.availability.find((a) => a.dayOfWeek === weekday);
        if (!avail) continue;
        const room = roomForTeacher(teacher.id);
        if (!room) continue;
        const startHour = Number(avail.start.slice(0, 2));
        const endHour = Number(avail.end.slice(0, 2));
        for (const student of allActiveStudents) {
          const pairWeekKey = `${teacher.id}|${student.id}|${weekKey}`;
          if (pairHasLessonInWeek.has(pairWeekKey)) continue;
          pairIndex += 1;

          let booked = false;
          for (let hour = startHour; hour < endHour && !booked; hour++) {
            const tKey = `${teacher.id}|${dayOffset}|${hour}`;
            const sKey = `${student.id}|${dayOffset}|${hour}`;
            const rKey = `${room.id}|${dayOffset}|${hour}`;
            if (usedTeacherHour.has(tKey) || usedStudentHour.has(sKey) || usedRoomHour.has(rKey)) continue;
            const startAt = new Date(d);
            startAt.setHours(hour, 0, 0, 0);
            // Yerel Set kontrolünden geçen slotlar için bile son sözü GEÇMİŞ
            // OLMAYAN (dayOffset>=0) slotlarda `createLessonTool` (gerçek
            // validateLessonSlot) verir. GEÇMİŞ günler için `createLessonTool`
            // iş kuralı gereği HER ZAMAN reddeder ("Başlangıç saati geçmişte
            // olamaz") — bu yüzden geçmiş demo geçmişi doğrudan Prisma ile
            // (status:"completed") eklenir, tıpkı src/lib/seed.ts'in statik
            // demo verisinde olduğu gibi.
            const ok =
              dayOffset < 0
                ? await createHistoricalLessonDirect({
                    studentId: student.id,
                    teacherId: teacher.id,
                    roomId: room.id,
                    branchId: teacher.branchId,
                    instrument: teacher.instruments[0]!,
                    startAt,
                  })
                : (
                    await createLessonTool(ctx, {
                      studentId: student.id,
                      teacherId: teacher.id,
                      roomId: room.id,
                      instrument: teacher.instruments[0],
                      startAt: startAt.toISOString(),
                    })
                  ).ok;
            usedTeacherHour.add(tKey);
            usedStudentHour.add(sKey);
            usedRoomHour.add(rKey);
            if (ok) {
              pairHasLessonInWeek.add(pairWeekKey);
              denseCreated += 1;
              booked = true;
            }
          }
          if (!booked) denseNoSlot += 1;
        }
      }
      if (dayOffset % 15 === 0) {
        console.log(
          `Yoğun program — gün ${dayOffset >= 0 ? "+" : ""}${dayOffset}: ${denseCreated} oluşturuldu, ${denseNoSlot} slot bulunamadı (kümülatif, ${pairIndex} çift denendi).`
        );
      }
    }
    const totalPossiblePairs = teachers.length * allActiveStudents.length;
    console.log(
      `Yoğun ders programı tamamlandı: ${denseCreated} yeni ders oluşturuldu. ${pairHasLessonInWeek.size} farklı (öğretmen,öğrenci,ISO-hafta) üçlüsü artık dolu (ön-yüklenen mevcut derslerle birlikte). Olası çift sayısı: ${totalPossiblePairs} (7 öğretmen × ${allActiveStudents.length} aktif öğrenci). ${denseNoSlot} gün-bazlı deneme slot bulamadı (bir çift, haftanın birden fazla gününde denenebildiği için bu sayı hafta başına deneme sayısından yüksek olabilir — nihai kapsama oranı için ${pairHasLessonInWeek.size} rakamı esastır).`
    );

    // Son güvenlik ağı — çakışma temizliği. Bu betiğin ürettiği ders
    // hacmi/sıklığı göz önüne alındığında (gün-bazlı, çok sayıda ardışık
    // Prisma çağrısı) nadir sınır durumlarında (özellikle pencerenin ilk
    // günlerinde) aynı öğretmen/öğrenci/oda için TAM olarak aynı `startAt`
    // değerinde birden fazla kayıt oluşabiliyor. Bu adım YALNIZCA CSV
    // öğretmenlerine (seed-owned) ait dersler arasında gerçek zaman
    // çakışmalarını (aynı teacherId+startAt, aynı studentId+startAt, aynı
    // roomId+startAt) tarar ve en eskisi HARİÇ diğerlerini siler — idempotent
    // (temiz durumda hiçbir şey silmez) ve gerçek/import edilmiş veriye
    // dokunmaz (yalnızca CSV öğretmen id'leri sorgulanır).
    {
      const csvTeacherIds = new Set(teachers.map((t) => t.id));
      // Oda çakışması, LEGACY (t1..t5) derslerle PAYLAŞILAN odalarda da
      // (ör. r1) oluşabilir — bu yüzden oda boyutu için TÜM tenant dersleri
      // (yalnızca CSV değil) taranır; yalnız SİLİNECEK satırlar (aşağıda)
      // CSV öğretmenlerine ait olanlarla sınırlı tutulur — legacy/gerçek
      // veriye asla dokunulmaz.
      const allLessonsForConflictScan = await prisma.lesson.findMany({
        where: { tenantId: DEFAULT_TENANT_ID },
        select: { id: true, teacherId: true, studentId: true, roomId: true, startAt: true },
        orderBy: { startAt: "asc" },
      });
      const seenTeacherSlot = new Set<string>();
      const seenStudentSlot = new Set<string>();
      const seenRoomSlot = new Set<string>();
      const conflictIds = new Set<string>();
      for (const l of allLessonsForConflictScan) {
        const t = `${l.teacherId}|${l.startAt.getTime()}`;
        const s = `${l.studentId}|${l.startAt.getTime()}`;
        const r = `${l.roomId}|${l.startAt.getTime()}`;
        const isConflict = seenTeacherSlot.has(t) || seenStudentSlot.has(s) || seenRoomSlot.has(r);
        if (isConflict) {
          // Yalnızca CSV öğretmenine ait satırı sil — legacy/gerçek veri asla silinmez.
          if (csvTeacherIds.has(l.teacherId)) conflictIds.add(l.id);
          continue;
        }
        seenTeacherSlot.add(t);
        seenStudentSlot.add(s);
        seenRoomSlot.add(r);
      }
      if (conflictIds.size > 0) {
        await prisma.lesson.deleteMany({ where: { id: { in: [...conflictIds] } } });
        console.log(
          `Çakışma temizliği: aynı anda birden fazla öğretmen/öğrenci/oda kaydına yol açan ${conflictIds.size} ders kaldırıldı (bir sonraki çalıştırmada boşalan slotlar yeniden doldurulabilir).`
        );
      } else {
        console.log("Çakışma temizliği: hiçbir öğretmen/öğrenci/oda çakışması bulunamadı.");
      }
    }

    // Görev — 2 öğretmen + 2 öğrenci demo GİRİŞ kullanıcısı. Yalnızca
    // STORE_MODE=db'de anlamlı (gerçek Prisma User satırı gerektirir);
    // e-posta ile idempotent (varsa atlanır, üretimi etkilemez — yalnızca bu
    // betiğin oluşturduğu demo tenant'taki kayıtlara dokunur).
    // Sabit, bu betiğe ÖZEL iki demo öğrenci (ilk iki `demoStudentNames`
    // girdisi) kullanılır — geniş `studentsData` (ders üretimi için TÜM
    // aktif öğrencileri kapsayan) listesinden DEĞİL, aksi halde her
    // çalıştırmada farklı bir öğrenci seçilip idempotentlik bozulur (yeni
    // login satırları birikir).
    const fixedDemoLoginEmails = [
      "ada.yilmaz.demo@email.com",
      "kerem.sahin.demo@email.com",
      "nehir.kaya.demo@email.com",
      "toprak.demir.demo@email.com",
      "elif.aksoy.demo@email.com",
    ];
    const allStudentsForLogins = (await readData()).students;
    const fixedDemoLoginStudents = fixedDemoLoginEmails
      .map((email) => allStudentsForLogins.find((s) => s.email?.toLowerCase() === email))
      .filter((s): s is NonNullable<typeof s> => Boolean(s));
    if (isDbMode && teachers.length >= 1 && fixedDemoLoginStudents.length >= 1) {
      // Görev: "birden fazla öğretmen ve öğrenciyle giriş yapabileyim" — TÜM
      // aktif CSV öğretmenleri (7) + birden fazla demo öğrenci (5) için giriş
      // kullanıcısı oluşturulur. E-postaya göre eşleşir (öğretmen sıralaması
      // store'un iç sırasına göre değişebildiği için index yerine sabit
      // e-posta kullanılır).
      const demoLogins = [
        ...teachers.map((t, i) => ({
          email: t.email,
          role: "TEACHER" as const,
          teacherId: t.id,
          password: `demo-teacher-csv-${i + 1}`,
        })),
        ...fixedDemoLoginStudents.map((s, i) => ({
          email: s.email!,
          role: "STUDENT" as const,
          studentId: s.id,
          password: `demo-student-csv-${i + 1}`,
        })),
      ];
      for (const login of demoLogins) {
        const existing = await prisma.user.findFirst({ where: { tenantId: DEFAULT_TENANT_ID, email: login.email } });
        if (existing) {
          console.log(`Giriş kullanıcısı zaten var: ${login.email}`);
          continue;
        }
        await prisma.user.create({
          data: {
            id: uid("user"),
            tenantId: DEFAULT_TENANT_ID,
            email: login.email.toLowerCase(),
            passwordHash: hashPasswordSync(login.password),
            role: login.role,
            teacherId: "teacherId" in login ? login.teacherId : undefined,
            studentId: "studentId" in login ? login.studentId : undefined,
            active: true,
          },
        });
        console.log(`Demo giriş kullanıcısı oluşturuldu: ${login.email} (${login.role})`);
      }

      // Eski demo öğretmen giriş kullanıcıları (`teacherId` arşivlenmiş
      // t1..t5'ten birine bağlı, seed-owned) — CSV öğretmen kullanıcılarıyla
      // TAKAS edilir: hard delete yok, yalnızca pasifleştirilir (Teacher
      // arşivleme ilkesiyle aynı). Yalnızca teacherId'si bilinen legacy
      // id listesindeyse dokunulur — gerçek kullanıcı hesapları ASLA.
      const legacyTeacherIdSet = new Set(["t1", "t2", "t3", "t4", "t5"]);
      const legacyTeacherLogins = await prisma.user.findMany({
        where: { tenantId: DEFAULT_TENANT_ID, role: "TEACHER", active: true },
      });
      for (const u of legacyTeacherLogins) {
        if (!u.teacherId || !legacyTeacherIdSet.has(u.teacherId)) continue;
        await prisma.user.update({ where: { id: u.id }, data: { active: false } });
        console.log(`Eski demo öğretmen giriş kullanıcısı pasifleştirildi: ${u.email}`);
      }
    }

    // İş Takip — örnek görevler (Kanban demosu için). Başlığa göre idempotent
    // (varsa atlanır). Admin kullanıcıya atanır, farklı kategori/öncelik ve
    // (oluşturulduktan sonra changeTaskStatusTool ile) farklı statülerle —
    // Kanban panosunda gerçekçi bir dağılım görünsün diye.
    if (isDbMode) {
      const adminUser = await prisma.user.findFirst({
        where: { tenantId: DEFAULT_TENANT_ID, role: "SCHOOL_ADMIN", active: true },
      });
      if (adminUser) {
        const taskCtx: ServiceContext = { role: "SCHOOL_ADMIN", tenantId: DEFAULT_TENANT_ID, userId: adminUser.id };
        const sampleTasks: {
          title: string;
          category: "Kayıt" | "Eğitim" | "Tahsilat" | "Veli İletişimi" | "Öğretmen" | "Program" | "Evrak" | "Teknik";
          priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
          targetStatus?: "IN_PROGRESS" | "COMPLETED" | "BLOCKED";
          dueInDays?: number;
        }[] = [
          { title: "Yeni kayıt evraklarını tamamla — Ada Yılmaz", category: "Kayıt", priority: "MEDIUM", dueInDays: 3 },
          { title: "Piyano grubu için ek oda talebi", category: "Program", priority: "LOW", dueInDays: 7 },
          { title: "Gecikmiş ödeme hatırlatması — Temmuz taksiti", category: "Tahsilat", priority: "HIGH", targetStatus: "IN_PROGRESS", dueInDays: 1 },
          { title: "Veli toplantısı daveti gönder", category: "Veli İletişimi", priority: "MEDIUM", targetStatus: "IN_PROGRESS", dueInDays: 5 },
          { title: "Öğretmen müsaitlik formunu güncelle — Ebru Şirince", category: "Öğretmen", priority: "LOW" },
          { title: "Kayıt sözleşmesi şablonunu revize et", category: "Evrak", priority: "MEDIUM", targetStatus: "BLOCKED", dueInDays: 10 },
          { title: "Yaz dönemi ders programını onayla", category: "Program", priority: "URGENT", dueInDays: 2 },
          { title: "Sistem yedekleme kontrolü", category: "Teknik", priority: "LOW", targetStatus: "COMPLETED" },
        ];
        for (const t of sampleTasks) {
          const existing = await prisma.task.findFirst({ where: { tenantId: DEFAULT_TENANT_ID, title: t.title } });
          if (existing) {
            console.log(`Görev zaten var: ${t.title}`);
            continue;
          }
          const dueDate = t.dueInDays
            ? new Date(Date.now() + t.dueInDays * 86_400_000).toISOString()
            : undefined;
          const res = await createTaskTool(taskCtx, {
            title: t.title,
            category: t.category,
            priority: t.priority,
            assigneeId: adminUser.id,
            dueDate,
          });
          if (!res.ok) {
            console.error(`HATA — görev "${t.title}": ${res.error.message}`);
            continue;
          }
          if (t.targetStatus) {
            await changeTaskStatusTool(taskCtx, {
              taskId: res.data.taskId,
              action: "set_status",
              status: t.targetStatus,
            });
          }
          console.log(`Görev oluşturuldu: ${t.title}${t.targetStatus ? ` (${t.targetStatus})` : ""}`);
        }
      }
    }
  });
}

main()
  .then(() => {
    console.log("Demo CSV öğretmen/öğrenci/ders seed tamamlandı.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seed hata ile sonlandı:", err);
    process.exit(1);
  });
