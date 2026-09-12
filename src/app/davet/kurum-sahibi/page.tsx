import { EmptyState, PageHeader } from "@/components/ui";
import { InviteAcceptForm } from "@/components/platform/invite-accept-form";
import { PLATFORM_BRAND } from "@/lib/platform/brand";

export const dynamic = "force-dynamic";

export default async function InviteAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; token?: string }>;
}) {
  const { invite, token } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <PageHeader title={`${PLATFORM_BRAND.name} daveti`} description="Hesabınızı oluşturmak için bir parola belirleyin." />
      {invite && token ? (
        <InviteAcceptForm inviteId={invite} token={token} />
      ) : (
        <EmptyState title="Davet bağlantısı eksik" description="Size iletilen bağlantının tamamını kullanın." />
      )}
    </div>
  );
}
