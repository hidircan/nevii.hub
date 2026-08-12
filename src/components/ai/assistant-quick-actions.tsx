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

/** Pathname-first starters; entity refines wording when present. */
export function getRouteQuickActions(
  pathname: string | null | undefined,
  session: AssistantSession,
  entity: AssistantEntity | null
): QuickAction[] {
  const path = normalizePath(pathname);
  const role = session?.role;
  const isStaff = role ? STAFF.includes(role) : false;
  const actions: QuickAction[] = [];

  // --- Entity-specific (student / teacher detail or payment subpages) ---
  if (entity?.kind === "student") {
    const who = `${entity.label} (${entity.id})`;
    if (path.includes("/odemeler/") || path.endsWith(`/odemeler/${entity.id}`)) {
      actions.push(
        {
          id: "route-student-payment-status",
          label: "Tahsilat durumu",
          message: `${who} tahsilat durumunu değerlendir`,
        },
        {
          id: "route-student-payment-plan",
          label: "Ödeme planı",
          message: `${who} için ödeme planı ve gecikme riskini özetle`,
        },
        {
          id: "route-student-payment-next",
          label: "Sonraki adım",
          message: `${who} için tahsilatta sonraki operasyon adımlarını öner`,
        }
      );
    } else {
      actions.push(
        {
          id: "route-student-risk",
          label: "Program ve devam",
          message: `${who} program ve devamlılık risklerini değerlendir`,
        },
        {
          id: "route-student-schedule",
          label: "Programını göster",
          message: `${who} programı`,
        }
      );
      if (isStaff || role === "PARENT") {
        actions.push({
          id: "route-student-balance",
          label: "Bakiye",
          message: `${who} bakiyesi`,
        });
      }
      if (isStaff) {
        actions.push({
          id: "route-student-progress",
          label: "Gelişim özeti",
          message: `${who} gelişim ve yoklama özetini çıkar`,
        });
      }
    }
  }

  if (entity?.kind === "teacher") {
    const who = `${entity.label} (${entity.id})`;
    actions.push(
      {
        id: "route-teacher-perf",
        label: "Performans özeti",
        message: `${who} performans verisini özetle`,
      },
      {
        id: "route-teacher-schedule",
        label: "Programını göster",
        message: `${who} programı`,
      }
    );
    if (isStaff) {
      actions.push(
        {
          id: "route-teacher-availability",
          label: "Uygunluk",
          message: `${who} müsaitlik ve yük dengesini değerlendir`,
        },
        {
          id: "route-teacher-payout",
          label: "Hakediş bağlamı",
          message: `${who} hakediş ve ücret kuralı bağlamını özetle`,
        }
      );
    }
  }

  // --- Path-based (no entity or fill remaining slots) ---
  if (isStaff) {
    if (path === "/panel" || path === "/panel/") {
      actions.push(
        {
          id: "route-panel-critical",
          label: "Bugünün kritikleri",
          message: "Bugünün kritik operasyonlarını özetle",
        },
        {
          id: "route-panel-priorities",
          label: "Kurum öncelikleri",
          message: "Kurum genelinde öncelikli işleri ve riskleri listele",
        },
        {
          id: "route-panel-collections",
          label: "Tahsilat özeti",
          message: "Bu ayki tahsilat özetini göster",
        }
      );
    }

    if (path === "/panel/odemeler" || path.startsWith("/panel/odemeler/")) {
      if (!actions.some((a) => a.id.startsWith("route-student-payment"))) {
        actions.push(
          {
            id: "route-payments-overdue",
            label: "Gecikmiş ödemeler",
            message: "Gecikmiş ödemeleri ve öncelikli tahsilatları özetle",
          },
          {
            id: "route-payments-month",
            label: "Aylık tahsilat",
            message: "Bu ayki tahsilat özetini göster",
          }
        );
      }
    }

    if (path === "/panel/telafi" || path.startsWith("/panel/telafi")) {
      actions.push(
        {
          id: "route-makeup-priority",
          label: "Açık talepleri önceliklendir",
          message: "Açık telafi taleplerini önceliklendir",
        },
        {
          id: "route-makeup-plan",
          label: "Planlama önerisi",
          message: "Telafi planlama için operasyonel öneriler ver",
        },
        {
          id: "route-makeup-sla",
          label: "SLA riski",
          message: "Süresi yaklaşan veya geciken telafi taleplerini özetle",
        }
      );
    }

    if (path === "/panel/is-takip" || path.startsWith("/panel/is-takip")) {
      actions.push(
        {
          id: "route-tasks-overdue",
          label: "Geciken işler",
          message: "Geciken ve bugün tamamlanması gereken işleri özetle",
        },
        {
          id: "route-tasks-assign",
          label: "Atamalar",
          message: "Atanmış açık görevleri ve yoğun sorumluları özetle",
        },
        {
          id: "route-tasks-kanban",
          label: "Kanban özeti",
          message: "İş takip panosundaki öncelikleri özetle",
        }
      );
    }

    if (path === "/panel/ogretmenler" || path.startsWith("/panel/ogretmenler")) {
      if (!actions.some((a) => a.id.startsWith("route-teacher"))) {
        actions.push(
          {
            id: "route-teachers-list",
            label: "Öğretmen yükü",
            message: "Öğretmen yükü ve performans görünümünü özetle",
          },
          {
            id: "route-teachers-guitar",
            label: "Gitar öğretmenleri",
            message: "Gitar öğretmenlerini listele",
          }
        );
      }
    }

    if (path === "/panel/yoklama" || path.startsWith("/panel/yoklama")) {
      actions.push({
        id: "route-attendance",
        label: "Yoklama özeti",
        message: "Yoklama ve devam risklerini özetle",
      });
    }

    if (path === "/panel/program" || path.startsWith("/panel/program")) {
      actions.push({
        id: "route-schedule",
        label: "Program densitesi",
        message: "Ders programı yoğunluğunu ve boşlukları özetle",
      });
    }

    if (path === "/panel/paketler" || path.startsWith("/panel/paketler")) {
      actions.push({
        id: "route-packages",
        label: "Paketler",
        message: "Aktif paket ve fiyat yapısını özetle",
      });
    }
  }

  // Session self-shortcuts
  if (role === "TEACHER" && session?.teacherId && entity?.kind !== "teacher") {
    actions.push({
      id: "self-teacher-schedule",
      label: "Bugünkü programım",
      message: `${session.teacherId} programı`,
    });
  }
  if (role === "PARENT" && session?.studentId && entity?.kind !== "student") {
    actions.push(
      {
        id: "self-student-schedule",
        label: "Çocuğumun programı",
        message: `${session.studentId} programı`,
      },
      {
        id: "self-student-balance",
        label: "Bakiyem ne kadar?",
        message: `${session.studentId} bakiyesi`,
      }
    );
  }

  // Generic fill
  if (isStaff) {
    actions.push(
      { id: "generic-teachers", label: "Gitar öğretmenleri", message: "Gitar öğretmenlerini listele" },
      { id: "generic-collections", label: "Tahsilat özeti", message: "Bu ayki tahsilat özetini göster" }
    );
  }
  if (role === "TEACHER") {
    actions.push({
      id: "generic-teacher-slots",
      label: "Piyano öğretmenleri",
      message: "Piyano öğretmenlerini listele",
    });
  }
  actions.push({
    id: "generic-identity",
    label: "Hangi yapay zekasın?",
    message: "Hangi modelsin?",
  });

  const seen = new Set<string>();
  return actions.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true))).slice(0, 5);
}

/** Backward-compatible entry — prefers entity-only when pathname unknown. */
export function getQuickActions(session: AssistantSession, entity: AssistantEntity | null): QuickAction[] {
  return getRouteQuickActions(null, session, entity);
}
