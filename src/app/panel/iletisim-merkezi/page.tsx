import { redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { TEMPLATE_CATALOG } from "@/lib/whatsapp-templates";
import { MessageCircle } from "lucide-react";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { listCommunicationMessages } from "@/lib/communications/store";
import { toPublicCommunicationMessage } from "@/lib/communications/types";
import { describeCommunicationFit } from "@/lib/communications/service";
import { CommunicationQueue } from "@/components/communication-queue";

export const dynamic = "force-dynamic";

/**
 * İletişim Merkezi — dış SMS/WhatsApp taslakları (bkz. FAZ1, önceki turdan
 * ayrım kararı: `/panel/bildirimler` uygulama içi bildirimler için,
 * bu rota admin-only dış iletişim kuyruğu için). Panel layout'u zaten
 * TEACHER/PARENT/STUDENT'ı /panel'in tamamından uzaklaştırıyor
 * (src/app/panel/layout.tsx) — burada ayrıca SCHOOL_ADMIN/SUPER_ADMIN
 * kontrolü savunma katmanı olarak tekrarlanır.
 */
export default async function IletisimMerkeziPage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/iletisim-merkezi");
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") {
    redirect("/panel");
  }

  const kurum = await getInstitutionContext(session);
  const tenantIds = kurum.scope.mode === "all" ? kurum.scope.tenantIds : [kurum.scope.tenantId];
  const communicationMessages = (
    await Promise.all(tenantIds.map((tid) => listCommunicationMessages(tid)))
  )
    .flat()
    .map(toPublicCommunicationMessage)
    .map((m) => {
      if (m.channel !== "SMS") return m;
      const fit = describeCommunicationFit(m.approvedBodySnapshot ?? m.draftBody);
      return { ...m, smsChars: fit.chars, smsSegments: fit.segments };
    });

  return (
    <div>
      <KurumScopeNote scope={kurum.scope} />
      <PageHeader
        title="İletişim Merkezi"
        description="SMS ve WhatsApp mesaj taslaklarını inceleyin, onaylayın ve gönderim durumlarını takip edin."
      />

      <Card className="mb-6 border-emerald-100 bg-emerald-50/50">
        <div className="flex items-start gap-3">
          <MessageCircle className="mt-0.5 h-5 w-5 text-emerald-700" />
          <div>
            <p className="font-semibold text-[var(--color-text)] dark:text-slate-50">Nasıl kullanılır?</p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
              1) Telafi onayla, yoklama al veya tahsilat taslağı üret → 2) Hazır mesajlar bu kuyrukta birikir → 3) İnceleyip
              tekil veya toplu onaylayın. Onay, mesajı yalnızca gönderime hazır hâle getirir; SMS güvenli gönderim akışına
              düşer, WhatsApp manuel gönderim kuyruğunda kalır. Hiçbir onay burada otomatik dış gönderim başlatmaz.
            </p>
          </div>
        </div>
      </Card>

      <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)] dark:text-slate-50">
        Mesaj kuyruğu ({communicationMessages.length})
      </h2>
      {kurum.scope.mode !== "single" && (
        <Card className="mb-4 border-amber-100 bg-amber-50/60">
          <p className="text-sm text-[var(--color-text)]">
            Birleşik kurum görünümündesiniz — onay ve düzenleme işlemleri tek bir kurum seçildiğinde kullanılabilir.
          </p>
        </Card>
      )}
      <CommunicationQueue initialMessages={communicationMessages} canWrite={kurum.scope.mode === "single"} />

      <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)] dark:text-slate-50">Şablon kataloğu</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {TEMPLATE_CATALOG.map((t) => (
          <Card key={t.key}>
            <p className="font-semibold text-[var(--color-text)] dark:text-slate-50">{t.title}</p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">{t.when}</p>
            <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-[var(--color-surface-muted)] p-3 text-[11px] leading-relaxed text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
              {t.sample}
            </pre>
          </Card>
        ))}
      </div>
    </div>
  );
}
