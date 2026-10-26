import type { Metadata } from "next";
import Link from "next/link";
import { TrialRequestForm } from "@/components/billing/trial-request-form";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "30 gün ücretsiz dene — NeviiHub",
  description:
    "NeviiHub'ı 30 gün ücretsiz deneyin. Kart bilgisi istenmez; onay sonrası güvenli kurulum ile başlarsınız.",
  alternates: { canonical: "/deneme" },
};

/**
 * Herkese açık deneme sayfası — ana sayfadaki "30 gün ücretsiz dene"
 * akışının hedefi. Gerçek onboarding'e bağlıdır: başvuru → NeviiOS
 * değerlendirmesi → güvenli kurum sahibi daveti → tenant açılışı → deneme.
 */
export default function TrialPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link href="/" className="text-lg font-extrabold tracking-tight">
          {BRAND.shortName}
        </Link>
        <Link href="/login" className="text-sm font-semibold text-amber-700 hover:text-amber-800">
          Giriş Yap
        </Link>
      </header>
      <main className="mx-auto grid max-w-5xl gap-10 px-6 pb-20 pt-6 md:grid-cols-2">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            30 gün ücretsiz dene
          </h1>
          <p className="mt-4 leading-relaxed text-slate-600">
            Program, yoklama, telafi, sözleşme ve tahsilat yönetimini 30 gün boyunca
            ücretsiz deneyin. Kart bilgisi istenmez; deneme bitiminde siz onaylamadan
            ücretlendirme yapılmaz.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-slate-700">
            <li className="flex gap-2"><span aria-hidden>✓</span> Kurumunuza özel güvenli kurulum</li>
            <li className="flex gap-2"><span aria-hidden>✓</span> Öğretmen ve veli portallarıyla birlikte</li>
            <li className="flex gap-2"><span aria-hidden>✓</span> Deneme bitmeden e-posta hatırlatması</li>
            <li className="flex gap-2"><span aria-hidden>✓</span> İstediğinizde tek tıkla ücretliye geçiş</li>
          </ul>
          <p className="mt-6 text-xs leading-relaxed text-slate-500">
            Başvurunuz değerlendirildikten sonra kurum hesabınız güvenli davet akışıyla
            açılır. Verileriniz KVKK kapsamında korunur.
          </p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-6 ring-1 ring-slate-200">
          <h2 className="mb-4 text-lg font-semibold">Deneme başvurusu</h2>
          <TrialRequestForm />
        </div>
      </main>
    </div>
  );
}
