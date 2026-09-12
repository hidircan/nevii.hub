import { redirect } from "next/navigation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { TEMPLATE_CATALOG } from "@/lib/whatsapp-templates";
import { MessageCircle } from "lucide-react";
import { requireSessionContext } from "@/lib/auth/session";
import { getInstitutionContext } from "@/lib/institution/context";
import { KurumScopeNote } from "@/components/kurum-scope-note";
import { listCommunicationMessages } from "@/lib/communications/store";
import { toPublicCommunicationMessage } from "@/lib/communications/types";
import {
  describeCommunicationFit,
  listWhatsAppInboundTool,
  MAX_WHATSAPP_INBOUND_LIST,
} from "@/lib/communications/service";
import { CommunicationQueue } from "@/components/communication-queue";
import { LessonPlanTemplatePreview } from "@/components/lesson-plan-template-preview";

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
  const inboundLists = await Promise.all(
    tenantIds.map((tid) =>
      listWhatsAppInboundTool({ role: session.role, userId: session.userId, tenantId: tid, channel: "web" })
    )
  );
  const inbound = inboundLists
    .flatMap((r) => (r.ok ? r.data.conversations : []))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_WHATSAPP_INBOUND_LIST);
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

      <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)] dark:text-slate-50">
        Gelen WhatsApp konuşmaları ({inbound.length})
      </h2>
      <p className="mb-3 text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
        Webhook üzerinden gelen veli mesajlarının salt-okunur özeti — telefon maskeli, yalnızca son gelen mesajdan kısa
        alıntı. Yanıt buradan verilmez; konuşma yapay zekâ hattında yürütülür.
      </p>
      {inbound.length === 0 ? (
        <Card className="mb-10">
          <p className="text-sm text-[var(--color-text-muted)]">Gelen WhatsApp konuşması yok.</p>
        </Card>
      ) : (
        <div className="mb-10 space-y-3">
          {inbound.map((c) => (
            <Card key={c.id}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-[var(--color-text)]">{c.phoneMasked}</p>
                <Badge>{c.messageCount} mesaj</Badge>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {new Date(c.updatedAt).toLocaleString("tr-TR")}
                </span>
              </div>
              {c.lastInboundExcerpt && (
                <p className="mt-2 line-clamp-2 text-sm text-[var(--color-text-muted)]">{c.lastInboundExcerpt}</p>
              )}
            </Card>
          ))}
        </div>
      )}

      <h2 className="mb-3 text-lg font-semibold text-[var(--color-text)] dark:text-slate-50">
        Ders planı şablonları — önizleme ve doğrulama
      </h2>
      <p className="mb-3 text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
        Ders planı oluştuğunda veli ve öğretmene düşen kayıtlar bu şablonlardan üretilir. Yer tutucu hatası
        gönderim öncesi engellenir; onaylanan metin snapshot olarak donar.
      </p>
      <div className="mb-10">
        <LessonPlanTemplatePreview />
      </div>

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
