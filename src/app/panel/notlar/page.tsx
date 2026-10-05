import { redirect } from "next/navigation";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { PanelNotes } from "@/components/panel-notes";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext } from "@/lib/institution/context";
import { listPanelNotesTool } from "@/lib/panel-notes";

export const dynamic = "force-dynamic";

/** 2026-10-05 — Notlar: Günlük Özet'teki notların tamamı (en yeni önce), kim ve ne zaman yazdı. */
export default async function NotlarPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/notlar");
  }
  const kurum = await getInstitutionContext(session);
  // Yazım oturumun kurumuna gider; başka kurum seçiliyken o kurumun notları gösterilmez.
  const result = kurum.scope.mode === "single" && kurum.scope.tenantId === session.tenantId ? await listPanelNotesTool(session) : null;
  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <PageHeader title="Notlar" description="Kuruma gelen bir sonraki kişi için bırakılan notlar — yazan ve zaman kayıtlı." />
      {!result ? (
        <EmptyState title="Kendi kurumunuzu seçin" description="Notlar kurum bazındadır ve yalnız kendi kurumunuzda görüntülenir. Üstteki kurum seçiciden kendi kurumunuzu seçin." />
      ) : !result.ok ? (
        <EmptyState title="Bu ekrana erişiminiz yok" description={result.error.message} />
      ) : (
        <Card className="max-w-3xl">
          <PanelNotes initialNotes={result.data} />
        </Card>
      )}
    </div>
  );
}
