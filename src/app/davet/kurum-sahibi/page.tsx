import { EmptyState, PageHeader } from "@/components/ui";
import { InviteAcceptForm } from "@/components/platform/invite-accept-form";
import { PLATFORM_BRAND } from "@/lib/platform/brand";

export const dynamic = "force-dynamic";

export default async function InviteAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; token?: string; plan?: string; interval?: string }>;
}) {
  const { invite, token, plan, interval } = await searchParams;
  // Satın alma başvurusu onaylanan müşteri: seçim davet bağlantısında korunur,
  // kabul sonrası girişle fatura adımından devam eder.
  const continueHref =
    plan && (interval === "monthly" || interval === "yearly")
      ? `/satin-al/fatura?plan=${encodeURIComponent(plan)}&interval=${interval}`
      : null;
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <PageHeader title={`${PLATFORM_BRAND.name} daveti`} description="Hesabınızı oluşturmak için bir parola belirleyin." />
      {invite && token ? (
        <InviteAcceptForm inviteId={invite} token={token} continueHref={continueHref} />
      ) : (
        <EmptyState title="Davet bağlantısı eksik" description="Size iletilen bağlantının tamamını kullanın." />
      )}
    </div>
  );
}
