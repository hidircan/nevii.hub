import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { homePathForRole, resolveSafeLoginNext } from "@/lib/auth/role-routes";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

/**
 * NeviiOS Control Center girişi (Control Center 2026-09-28) — normal kurum
 * girişinin (`/login`) kopyası DEĞİL: ayrı ad, koyu-yeşil control-room
 * görünümü, aynı auth akışı (LoginForm + /api/v1/auth/login + aynı rate
 * limit/nötr hata/şifre sıfırlama). `/platform` kabuğunun DIŞINDADIR
 * (route group) — oturumsuz erişilir; middleware yalnız bu yolu açıktan
 * geçirir. Kimlik doğrulama/yetki ÇOĞALTILMAZ.
 */
export default async function PlatformGirisPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const session = await getSessionContext();
  const safeNext = resolveSafeLoginNext(params.next, "");
  if (session) {
    if (session.role === "HYPER_ADMIN") {
      redirect(safeNext === "/platform" || safeNext.startsWith("/platform/") ? safeNext : "/platform");
    }
    redirect(homePathForRole(session.role));
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#060f0b] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-[#1e4030] bg-[#0c1d14] p-8 shadow-[0_4px_16px_-4px_rgb(0_0_0/0.7)]">
          <div className="mb-6 text-center">
            <p className="brand-mark text-3xl font-normal leading-none text-[#8df0ae]">NeviiHub</p>
            <h1 className="mt-3 text-xl font-semibold text-[#e8f5ec]">NeviiOS Control Center</h1>
            <p className="mt-2 text-sm text-[#a9cbb6]">
              Platform yönetimi — yalnız HYPER_ADMIN. Kurum kullanıcıları{" "}
              <Link href="/login" className="font-medium text-[#8df0ae] hover:underline">
                normal giriş
              </Link>{" "}
              ekranını kullanır.
            </p>
          </div>
          <LoginForm nextPath={safeNext || undefined} platformGate />
          <p className="mt-4 text-center text-xs text-[#a9cbb6]">
            Şifrenizi mi unuttunuz?{" "}
            <Link href="/sifre-sifirla" className="font-medium text-[#8df0ae] hover:underline">
              Şifre sıfırlama
            </Link>{" "}
            (kurum girişiyle aynı güvenli akış).
          </p>
        </div>
      </div>
    </div>
  );
}
