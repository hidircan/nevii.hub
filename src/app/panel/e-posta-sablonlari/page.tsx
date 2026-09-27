import { redirect } from "next/navigation";
import { requireSessionContext } from "@/lib/auth/session";
import { PageHeader, Card } from "@/components/ui";
import { EmailTemplateManager } from "@/components/email-template-manager";
import { listEmailTemplatesTool } from "@/lib/email-templates/tools";
import { EMAIL_TEMPLATE_KEYS, isEmailTemplateKey } from "@/lib/email-templates/keys";

export const dynamic = "force-dynamic";

/**
 * 10. tur iş #2 — kurum bazlı işlem-e-postası şablonları (davet + şifre
 * sıfırlama). Yalnızca SCHOOL_ADMIN/SUPER_ADMIN. `?sablon=` ile hangi
 * şablonun, `?dil=` ile hangi dilin düzenleneceği seçilir.
 */
export default async function EmailTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ sablon?: string; dil?: string }>;
}) {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/e-posta-sablonlari");
  }
  if (session.role !== "SCHOOL_ADMIN" && session.role !== "SUPER_ADMIN") redirect("/panel");

  const { sablon, dil } = await searchParams;
  const initialKey = sablon && isEmailTemplateKey(sablon) ? sablon : EMAIL_TEMPLATE_KEYS[0]!;
  const initialLocale = dil === "en" ? "en" : ("tr" as const);

  const listResult = await listEmailTemplatesTool(session, { locale: initialLocale });
  const summaries = listResult.ok ? listResult.data.templates : [];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="E-posta Şablonları"
        description="Davet ve şifre sıfırlama e-postalarının kurumunuza özel metinleri. Değişiklik önce taslak olarak kaydedilir, önizleme ve test e-postasıyla doğrulanır, sonra yayımlanır — yayımlanmamış değişiklik eski e-postaları etkilemez."
      />
      <Card>
        <EmailTemplateManager summaries={summaries} initialKey={initialKey} initialLocale={initialLocale} />
      </Card>
    </div>
  );
}
