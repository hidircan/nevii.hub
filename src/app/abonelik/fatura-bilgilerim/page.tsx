import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSessionContext, homePathForRole } from "@/lib/auth/session";
import { getBillingProfile } from "@/lib/saas-billing/store";
import { BillingProfileForm } from "@/components/billing/billing-profile-form";

export const dynamic = "force-dynamic";

/** Kurumun fatura profili — ödeme öncesi zorunlu; sonradan güncellenebilir (eski belgeler değişmez). */
export default async function BillingProfilePage() {
  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect("/login?next=/abonelik/fatura-bilgilerim");
  }
  if (session.role !== "SUPER_ADMIN" && session.role !== "SCHOOL_ADMIN") {
    redirect(homePathForRole(session.role));
  }
  const profile = await getBillingProfile(session.tenantId);
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <p className="text-sm text-slate-500">
        <Link href="/abonelik" className="hover:text-slate-800">Aboneliğim</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Fatura Bilgilerim</span>
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Fatura Bilgilerim</h1>
      <p className="mt-1 text-sm text-slate-600">
        Abonelik belgelerinizdeki alıcı bilgileri. Değişiklik yalnız yeni belgelerde geçerli olur;
        düzenlenmiş belgeler değişmez.
      </p>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <BillingProfileForm initial={profile} />
      </div>
    </div>
  );
}
