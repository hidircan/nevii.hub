import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedReferenceData } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { PageHeader } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { FeeRuleManager } from "@/components/fee-rule-manager";
import { activeInstrumentOptions } from "@/lib/instrument-options";
import { FeeRoundingModeSelector } from "@/components/fee-rounding-mode-selector";

export const dynamic = "force-dynamic";

export default async function FeeRulesPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/ucret-kurallari");
  }
  // Hakediş erişimi: kurum politikası (SUPER_ADMIN her zaman; SCHOOL_ADMIN / unified BRANCH_MANAGER kuruma göre).
  const { canAccessTeacherEarnings } = await import("@/lib/platform/teacher-earnings-access");
  if (!(await canAccessTeacherEarnings(session))) {
    redirect("/panel");
  }

  const kurum = await getInstitutionContext(session);
  const data = await readScopedReferenceData(kurum.scope);

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <BackButton fallbackHref="/panel" label="Panele dön" className="mb-3" />
      <PageHeader title="Ücret Kuralları" />
      <FeeRoundingModeSelector
        currentMode={data.settings.feeRoundingMode}
        canWrite={kurum.scope.mode === "single"}
      />
      <FeeRuleManager
        teachers={data.teachers
          .filter((t) => t.active)
          .map((t) => ({ id: t.id, name: t.name }))}
        branches={data.settings.branches.map((b) => ({ id: b.id, shortName: b.shortName }))}
        rules={data.teacherFeeRules}
        canWrite={kurum.scope.mode === "single"}
        instrumentOptions={await activeInstrumentOptions(session)}
      />
    </div>
  );
}
