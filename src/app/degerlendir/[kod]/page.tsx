import type { Metadata } from "next";
import { describeFeedbackInviteTool } from "@/lib/services";
import { formatDate } from "@/lib/utils";
import { InviteFeedbackCards } from "@/components/reports/invite-feedback-cards";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Öğretmen değerlendirmesi", robots: { index: false, follow: false } };

/**
 * Rapor portalı (2026-10-14) — kişiye özel değerlendirme bağlantısı (oturumsuz). Kişisel veri en aza indirilir:
 * yalnız maskeli öğrenci adı ve değerlendirilebilecek öğretmenlerin adları gösterilir.
 */
export default async function FeedbackInvitePage({ params }: { params: Promise<{ kod: string }> }) {
  const { kod } = await params;
  const result = await describeFeedbackInviteTool(kod);
  const view = result.ok ? result.data : null;

  return (
    <div className="min-h-dvh bg-[var(--color-bg)]">
      <main className="mx-auto w-full max-w-md space-y-5 px-4 pb-10 pt-8">
        <header className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">Öğretmen değerlendirmesi</p>
          {view && "studentName" in view ? (
            <h1 className="text-xl font-semibold text-[var(--color-text)]">{view.studentName}</h1>
          ) : (
            <h1 className="text-xl font-semibold text-[var(--color-text)]">Bağlantı kullanılamıyor</h1>
          )}
        </header>

        {!view ? (
          <Notice text="Bağlantı şu anda açılamadı. Lütfen birkaç dakika sonra tekrar deneyin." />
        ) : "message" in view ? (
          <Notice text={view.message} />
        ) : view.status === "completed" ? (
          <Notice text="Tüm öğretmenleriniz için değerlendirmeniz alındı. Katkınız için teşekkür ederiz." tone="success" />
        ) : (
          <>
            <p className="text-sm text-[var(--color-text-muted)]">
              Görüşleriniz derslerin kalitesini artırmamıza yardım eder. Her öğretmen için bir kez değerlendirme
              yapabilirsiniz; yanıtlarınız yalnız kurum yönetimine iletilir. Bağlantı {formatDate(view.expiresAt)} tarihine kadar geçerlidir.
            </p>
            <InviteFeedbackCards code={kod} teachers={view.teachers} />
          </>
        )}
      </main>
    </div>
  );
}

function Notice({ text, tone }: { text: string; tone?: "success" }) {
  return (
    <p
      role="status"
      className={
        tone === "success"
          ? "rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-sm text-[var(--color-success)]"
          : "rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-sm text-[var(--color-text-muted)]"
      }
    >
      {text}
    </p>
  );
}
