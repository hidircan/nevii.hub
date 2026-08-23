/**
 * Route + entity aware quick prompts for the global assistant.
 * Messages stay user-visible (no hidden PII injection); entity ids only when
 * already on that entity page so heuristics/LLMs can resolve them.
 */
import type { AppRole } from "@/lib/auth/types";
import type { AssistantEntity } from "./assistant-context";

export type QuickAction = { id: string; label: string; message: string };
export type AssistantSession = { role: AppRole; teacherId?: string; studentId?: string } | null;

const STAFF: AppRole[] = ["SUPER_ADMIN", "SCHOOL_ADMIN", "AI_AGENT"];

function normalizePath(pathname: string | null | undefined): string {
  if (!pathname) return "";
  const base = pathname.split("?")[0] ?? pathname;
  if (base.length > 1 && base.endsWith("/")) return base.slice(0, -1);
  return base;
}

function pushUnique(actions: QuickAction[], next: QuickAction[]) {
  const seen = new Set(actions.map((a) => a.id));
  for (const a of next) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    actions.push(a);
  }
}

/** Pathname-first starters; entity refines wording when present. */
export function getRouteQuickActions(
  pathname: string | null | undefined,
  session: AssistantSession,
  entity: AssistantEntity | null
): QuickAction[] {
  // Auth henüz yoksa hiç chip üretme (flicker / boş liste yok).
  if (!session?.role) return [];

  const path = normalizePath(pathname);
  const role = session.role;
  const isStaff = STAFF.includes(role);
  const actions: QuickAction[] = [];

  const studentEntity = entity?.kind === "student" ? entity : null;
  const teacherEntity = entity?.kind === "teacher" ? entity : null;

  const studentIdFromPath = path.match(/^\/panel\/ogrenciler\/([^/]+)$/)?.[1];
  const teacherIdFromPath = path.match(/^\/panel\/ogretmenler\/([^/]+)$/)?.[1];
  const paymentStudentFromPath = path.match(/^\/panel\/odemeler\/([^/]+)$/)?.[1];

  // --- Student detail / student payment ---
  if (studentEntity || (isStaff && studentIdFromPath && studentIdFromPath !== "yeni")) {
    const id = studentEntity?.id ?? studentIdFromPath!;
    const who = studentEntity ? `${studentEntity.label} (${studentEntity.id})` : `Öğrenci (${id})`;
    const onPayment =
      path.includes("/odemeler/") ||
      (paymentStudentFromPath != null && paymentStudentFromPath === id);

    if (onPayment) {
      pushUnique(actions, [
        { id: "route-student-payment-status", label: "Tahsilat durumu", message: `${who} tahsilat durumunu değerlendir` },
        { id: "route-student-payment-plan", label: "Ödeme planı", message: `${who} için ödeme planı ve gecikme riskini özetle` },
        { id: "route-student-payment-next", label: "Sonraki adım", message: `${who} için tahsilatta sonraki operasyon adımlarını öner` },
      ]);
    } else {
      pushUnique(actions, [
        { id: "route-student-risk", label: "Program ve devam", message: `${who} program ve devamlılık risklerini değerlendir` },
        { id: "route-student-schedule", label: "Programını göster", message: `${who} programı` },
      ]);
      if (isStaff || role === "STUDENT") {
        pushUnique(actions, [{ id: "route-student-balance", label: "Bakiye", message: `${who} bakiyesi` }]);
      }
      if (isStaff) {
        pushUnique(actions, [
          { id: "route-student-progress", label: "Gelişim özeti", message: `${who} gelişim ve yoklama özetini çıkar` },
        ]);
      }
    }
  }

  // --- Teacher detail ---
  if (teacherEntity || (isStaff && teacherIdFromPath && teacherIdFromPath !== "yeni")) {
    const id = teacherEntity?.id ?? teacherIdFromPath!;
    const who = teacherEntity ? `${teacherEntity.label} (${teacherEntity.id})` : `Öğretmen (${id})`;
    pushUnique(actions, [
      { id: "route-teacher-perf", label: "Performans özeti", message: `${who} performans verisini özetle` },
      { id: "route-teacher-schedule", label: "Programını göster", message: `${who} programı` },
    ]);
    if (isStaff) {
      pushUnique(actions, [
        { id: "route-teacher-availability", label: "Uygunluk", message: `${who} müsaitlik ve yük dengesini değerlendir` },
        { id: "route-teacher-payout", label: "Hakediş bağlamı", message: `${who} hakediş ve ücret kuralı bağlamını özetle` },
      ]);
    }
  }

  // --- Path / page context (staff) ---
  if (isStaff) {
    if (path === "/panel") {
      pushUnique(actions, [
        { id: "route-panel-critical", label: "Bugünün kritikleri", message: "Bugünün kritik operasyonlarını özetle" },
        { id: "route-panel-priorities", label: "Kurum öncelikleri", message: "Kurum genelinde öncelikli işleri ve riskleri listele" },
        { id: "route-panel-collections", label: "Tahsilat özeti", message: "Bu ayki tahsilat özetini göster" },
      ]);
    }

    if (path === "/panel/odemeler" || path.startsWith("/panel/odemeler/")) {
      if (!actions.some((a) => a.id.startsWith("route-student-payment"))) {
        pushUnique(actions, [
          { id: "route-payments-overdue", label: "Gecikmiş ödemeler", message: "Gecikmiş ödemeleri özetle" },
          { id: "route-payments-month", label: "Bu ayki tahsilat", message: "Bu ayki tahsilatı göster" },
          { id: "route-payments-priority", label: "Öncelikli tahsilatlar", message: "Öncelikli tahsilat adımlarını öner" },
        ]);
      }
    }

    if (path === "/panel/telafi" || path.startsWith("/panel/telafi")) {
      pushUnique(actions, [
        { id: "route-makeup-priority", label: "Açık telafileri önceliklendir", message: "Açık telafileri önceliklendir" },
        { id: "route-makeup-plan", label: "Önerilen planları değerlendir", message: "Önerilen planları değerlendir" },
        { id: "route-makeup-sla", label: "SLA riski", message: "Süresi yaklaşan veya geciken telafi taleplerini özetle" },
      ]);
    }

    if (path === "/panel/is-takip" || path.startsWith("/panel/is-takip")) {
      pushUnique(actions, [
        { id: "route-tasks-overdue", label: "Geciken işler", message: "Geciken ve bugün tamamlanması gereken işleri özetle" },
        { id: "route-tasks-assign", label: "Atamalar", message: "Atanmış açık görevleri ve yoğun sorumluları özetle" },
        { id: "route-tasks-kanban", label: "Kanban özeti", message: "İş takip panosundaki öncelikleri özetle" },
      ]);
    }

    if (path === "/panel/ogretmenler") {
      pushUnique(actions, [
        { id: "route-teachers-list", label: "Öğretmen yükü", message: "Öğretmen yükü ve performans görünümünü özetle" },
        { id: "route-teachers-guitar", label: "Gitar öğretmenleri", message: "Gitar öğretmenlerini listele" },
      ]);
    }

    if (path === "/panel/ogrenciler" || path === "/panel/ogrenciler/yeni") {
      pushUnique(actions, [
        { id: "route-students-list", label: "Öğrenci riskleri", message: "Devam ve tahsilat riski yüksek öğrencileri özetle" },
        { id: "route-students-balance", label: "Açık bakiyeler", message: "Açık bakiyesi olan öğrencileri özetle" },
      ]);
    }

    if (path === "/panel/yoklama" || path.startsWith("/panel/yoklama")) {
      pushUnique(actions, [
        { id: "route-attendance-today", label: "Bugünkü yoklama", message: "Bugünkü yoklama özetini çıkar" },
        { id: "route-attendance-risk", label: "Devamsızlık riskleri", message: "Devamsızlık risklerini özetle" },
        { id: "route-attendance-followup", label: "Takip gerekenler", message: "Yoklamaya göre takip gereken öğrencileri listele" },
      ]);
    }

    if (path === "/panel/program" || path.startsWith("/panel/program")) {
      pushUnique(actions, [
        { id: "route-schedule", label: "Program densitesi", message: "Ders programı yoğunluğunu ve boşlukları özetle" },
        { id: "route-schedule-conflicts", label: "Çakışma riski", message: "Programda olası çakışma veya boşlukları değerlendir" },
      ]);
    }

    if (path === "/panel/paketler" || path.startsWith("/panel/paketler")) {
      pushUnique(actions, [
        { id: "route-packages-fill", label: "Paket doluluk", message: "Paket doluluk ve aktif kullanımını özetle" },
        { id: "route-packages-sales", label: "Paket–satış", message: "Paketlerin kayıt ve satış etkisini değerlendir" },
        { id: "route-packages-payment", label: "Ödemeye etkisi", message: "Paket fiyatlandırmasının tahsilata etkisini özetle" },
      ]);
    }

    // kind: "page" — path eşleşmediyse etiketle genel ama ekran odaklı 1–2 chip
    if (entity?.kind === "page" && actions.length < 2) {
      pushUnique(actions, [
        {
          id: "route-page-context",
          label: `${entity.label} özeti`,
          message: `${entity.label} ekranı için kritik operasyonları özetle`,
        },
        {
          id: "route-page-next",
          label: "Sonraki adımlar",
          message: `${entity.label} için önerilen sonraki adımları listele`,
        },
      ]);
    }
  }

  // Session self-shortcuts
  if (role === "TEACHER" && session.teacherId && entity?.kind !== "teacher") {
    pushUnique(actions, [
      { id: "self-teacher-schedule", label: "Bugünkü programım", message: `${session.teacherId} programı` },
    ]);
  }
  if (role === "STUDENT" && session.studentId && entity?.kind !== "student") {
    pushUnique(actions, [
      { id: "self-student-schedule", label: "Çocuğumun programı", message: `${session.studentId} programı` },
      { id: "self-student-balance", label: "Bakiyem ne kadar?", message: `${session.studentId} bakiyesi` },
    ]);
  }

  // Generic fill (staff) — yalnız yer kaldıysa
  if (isStaff && actions.length < 5) {
    pushUnique(actions, [
      { id: "generic-collections", label: "Tahsilat özeti", message: "Bu ayki tahsilat özetini göster" },
      { id: "generic-teachers", label: "Gitar öğretmenleri", message: "Gitar öğretmenlerini listele" },
    ]);
  }
  if (role === "TEACHER" && actions.length < 5) {
    pushUnique(actions, [
      { id: "generic-teacher-slots", label: "Piyano öğretmenleri", message: "Piyano öğretmenlerini listele" },
    ]);
  }
  if (actions.length < 5) {
    pushUnique(actions, [
      { id: "generic-identity", label: "Hangi yapay zekasın?", message: "Hangi modelsin?" },
    ]);
  }

  return actions.slice(0, 5);
}

/** Backward-compatible entry — prefers entity-only when pathname unknown. */
export function getQuickActions(session: AssistantSession, entity: AssistantEntity | null): QuickAction[] {
  return getRouteQuickActions(null, session, entity);
}
