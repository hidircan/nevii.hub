"use client";

/**
 * İş 2 — header'ın solundaki boş alanı sayfa bağlamına çevirir: sakin bir
 * breadcrumb + (yalnız SUPER_ADMIN için) aktif kurum pill'i. Etiketler
 * ikinci bir katalog İCAT ETMEDEN sidebar'ın TEK kaynağından
 * (`panel-nav.ts`) türetilir — pathname'e en uzun eşleşen href seçilir.
 * Varlık adı (ör. öğrenci adı) zaten var olan `AssistantEntity` context'i
 * (`useAssistantEntity`, sayfalar tarafından ayrıca kayıt ediliyor) OKUNARAK
 * elde edilir — ikinci bir veri çekme eklenmedi.
 */
import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, Building2 } from "lucide-react";
import {
  PANEL_MAIN_NAV,
  PANEL_FINANCE_NAV,
  PANEL_OPS_NAV,
  PANEL_AI_NAV,
  PANEL_SYSTEM_NAV,
  PANEL_SEARCH_ONLY_NAV,
  type PanelNavItem,
} from "@/lib/nav/panel-nav";
import { useAssistant } from "@/components/ai/assistant-context";
import { actionSetKurum } from "@/lib/actions";
import type { AppRole } from "@/lib/auth/types";

const ALL_NAV: PanelNavItem[] = [
  ...PANEL_MAIN_NAV,
  ...PANEL_FINANCE_NAV,
  ...PANEL_OPS_NAV,
  ...PANEL_AI_NAV,
  ...PANEL_SYSTEM_NAV,
  ...PANEL_SEARCH_ONLY_NAV,
].sort((a, b) => b.href.length - a.href.length);

/** Bilinen "detay" rotaları — varlık adı burada AssistantEntity'den eklenir. */
const DETAIL_ROUTES: { prefix: string; parentLabel: string; entityKind: string }[] = [
  { prefix: "/panel/ogrenciler/", parentLabel: "Öğrenciler", entityKind: "student" },
  { prefix: "/panel/ogretmenler/", parentLabel: "Öğretmenler", entityKind: "teacher" },
];

function breadcrumbSegments(pathname: string, entity: ReturnType<typeof useAssistant>["entity"]): string[] {
  if (pathname === "/panel") return ["Genel Bakış"];

  for (const route of DETAIL_ROUTES) {
    if (pathname.startsWith(route.prefix) && entity && entity.kind === route.entityKind) {
      return [route.parentLabel, entity.label];
    }
  }

  const match = ALL_NAV.find((item) => {
    const base = item.href.split("#")[0] ?? item.href;
    return pathname === base || pathname.startsWith(`${base}/`);
  });
  if (!match) return ["Genel Bakış"];
  // PANEL_SEARCH_ONLY_NAV etiketleri zaten "Üst Bağlam › Alt Sayfa" biçiminde.
  return match.label.split(" › ").map((s) => s.trim());
}

export function ContextHeader({
  role: _role,
  kurumAvailable,
  kurumSelection,
  canSeeAllKurumlar,
}: {
  role: AppRole;
  kurumAvailable: { tenantId: string; name: string }[];
  kurumSelection: string;
  canSeeAllKurumlar: boolean;
}) {
  const pathname = usePathname();
  const { entity } = useAssistant();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(kurumSelection);

  const segments = breadcrumbSegments(pathname, entity);
  const current = segments[segments.length - 1];
  const parents = segments.slice(0, -1);

  const showKurumPill = canSeeAllKurumlar && kurumAvailable.length > 1;

  function handleKurumChange(next: string) {
    setValue(next);
    startTransition(async () => {
      await actionSetKurum(next);
      router.refresh();
    });
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      <nav aria-label="Sayfa konumu" className="flex min-w-0 items-baseline gap-1 text-sm">
        {parents.map((p) => (
          <span key={p} className="hidden items-baseline gap-1 sm:inline-flex" style={{ color: "var(--color-text-muted)" }}>
            {p}
            <ChevronRight className="relative top-px h-3 w-3 shrink-0" aria-hidden />
          </span>
        ))}
        <span className="truncate font-semibold" style={{ color: "var(--color-text)" }}>
          {current}
        </span>
      </nav>

      {showKurumPill ? (
        <label
          className="hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium md:inline-flex"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface-muted)", color: "var(--color-text-muted)" }}
        >
          <Building2 className="h-3 w-3 shrink-0" aria-hidden />
          <span className="sr-only">Aktif kurum</span>
          <select
            value={value}
            onChange={(e) => handleKurumChange(e.target.value)}
            disabled={pending}
            className="bg-transparent text-xs font-medium outline-none"
            style={{ color: "var(--color-text-muted)" }}
          >
            {canSeeAllKurumlar ? <option value="ALL">Tüm kurumlar</option> : null}
            {kurumAvailable.map((k) => (
              <option key={k.tenantId} value={k.tenantId}>
                {k.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
