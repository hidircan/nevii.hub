import Image from "next/image";
import { redirect } from "next/navigation";
import { getSessionContext, homePathForRole } from "@/lib/auth/session";
import { LoginForm } from "@/components/login-form";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSessionContext();
  const params = await searchParams;
  if (session) {
    redirect(params.next || homePathForRole(session.role));
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-[var(--shadow-md)]">
        <div className="mb-6 text-center">
          {BRAND.logoPath ? (
            <Image
              src={BRAND.logoPath}
              alt=""
              width={48}
              height={48}
              className="mx-auto mb-3 rounded-xl"
            />
          ) : null}
          <p className="text-2xl font-extrabold uppercase tracking-wide text-[var(--color-primary)]">
            {BRAND.shortName}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--color-text)]">Giriş yap</h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Okul yönetimi, öğretmen ve öğrenci portalları için oturum açın.
          </p>
        </div>
        <LoginForm nextPath={params.next} />
      </div>
    </div>
  );
}
