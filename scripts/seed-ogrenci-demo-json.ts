/**
 * Karma Öğrenci Portalı — yerel STORE_MODE=json demo verisini `/ogrenci`
 * ekranının TÜM bölümlerini (Ödemelerim/Şimdi Öde, Yoklama Takvimi, Telafi
 * hakları, Ödeme geçmişi) gösterecek şekilde tamamlar. Yalnızca demo
 * öğrenci s1'e (tenant_nilufer_acar) dokunur — production'a ASLA
 * çalıştırılmaz (bu script yalnızca ./data/store.json dosyasını hedefler).
 * İDEMPOTENT: sabit id'lerle (varsa) atlar, tekrar çalıştırmak kopya
 * üretmez.
 *
 * Kullanım: npx tsx scripts/seed-ogrenci-demo-json.ts
 */
import { readFileSync, writeFileSync } from "fs";
import path from "path";

const FILE = path.join(process.cwd(), "data", "store.json");

function main() {
  const raw = readFileSync(FILE, "utf8");
  const data = JSON.parse(raw);

  const before = {
    payments: data.payments.length,
    makeups: data.makeupRequests.length,
  };

  // 1) Açık (pending) ödeme — yaklaşan vade.
  if (!data.payments.some((p: { id: string }) => p.id === "demo_open_s1")) {
    data.payments.push({
      id: "demo_open_s1",
      studentId: "s1",
      amount: 3200,
      paidAmount: 0,
      status: "pending",
      dueDate: new Date(Date.now() + 5 * 86400000).toISOString(),
      description: "Ağustos 2026 — Piyano (Erzene)",
    });
  }

  // 2) Gecikmiş (overdue) ödeme.
  if (!data.payments.some((p: { id: string }) => p.id === "demo_overdue_s1")) {
    data.payments.push({
      id: "demo_overdue_s1",
      studentId: "s1",
      amount: 3200,
      paidAmount: 1000,
      status: "overdue",
      dueDate: new Date(Date.now() - 10 * 86400000).toISOString(),
      description: "Temmuz 2026 (ek ders) — Piyano (Erzene)",
    });
  }

  // 3) Açık (onay bekleyen) telafi talebi — kaynak ders l1 zaten s1'e ait.
  if (!data.makeupRequests.some((m: { id: string }) => m.id === "demo_makeup_s1")) {
    data.makeupRequests.push({
      id: "demo_makeup_s1",
      studentId: "s1",
      teacherId: "t1",
      branchId: "erzene",
      instrument: "Piyano",
      sourceLessonId: "l1",
      attendanceId: "demo_attendance_s1",
      status: "requested",
      reason: "Sağlık nedeniyle derse katılamadı",
      expiresAt: new Date(Date.now() + 25 * 86400000).toISOString(),
      suggestedSlots: [],
      createdAt: new Date().toISOString(),
      policyNote: "Demo — otomatik oluşturuldu",
    });
  }

  writeFileSync(FILE, JSON.stringify(data, null, 2));

  console.log("Önce: payments=%d makeups=%d", before.payments, before.makeups);
  console.log("Sonra: payments=%d makeups=%d", data.payments.length, data.makeupRequests.length);
  console.log("s1 payments:", data.payments.filter((p: { studentId: string }) => p.studentId === "s1").map((p: { id: string; status: string }) => `${p.id}:${p.status}`));
  console.log("s1 makeups:", data.makeupRequests.filter((m: { studentId: string }) => m.studentId === "s1").map((m: { id: string; status: string }) => `${m.id}:${m.status}`));
}

main();
