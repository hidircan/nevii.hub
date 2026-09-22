import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { BackButton } from "@/components/back-button";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { PerformanceWeightsEditor } from "@/components/performance-weights-editor";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext, readScopedData } from "@/lib/institution/context";
import {
  STAFF_PERFORMANCE_METRICS,
  TEACHER_PERFORMANCE_METRICS,
  resolvePerformanceWeights,
} from "@/lib/performance-weights";

export const dynamic = "force-dynamic";

/** Kurum sahibi — öğretmen ve personel performans puanının ağırlıkları. */
export default async function PerformanceWeightsPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/ayarlar/performans");
  }
  if (session.role !== "SUPER_ADMIN") redirect("/panel");

  const kurum = await getInstitutionContext(session);
  const data = await readScopedData(kurum.scope);
  const weights = resolvePerformanceWeights(data.settings.performanceWeights);

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <div className="mb-3">
        <BackButton fallbackHref="/panel/kurulum" label="Kuruluma dön" />
      </div>
      <PageHeader
        title="Performans Ağırlıkları"
        description="Öğretmen ve personel performans puanında her metriğin payı. Toplam 100 olmalı; 0 verilen metrik puana girmez."
      />
      <PerformanceWeightsEditor
        teacherMetrics={TEACHER_PERFORMANCE_METRICS}
        staffMetrics={STAFF_PERFORMANCE_METRICS}
        initialTeacher={weights.teacher}
        initialStaff={weights.staff}
        canWrite={kurum.scope.mode === "single"}
      />
    </div>
  );
}
