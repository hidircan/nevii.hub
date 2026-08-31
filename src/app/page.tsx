import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { CalendarDays, MessageCircle, RefreshCcw, ArrowRight } from "lucide-react";
import { getSessionContext, homePathForRole } from "@/lib/auth/session";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

const features = [
  {
    icon: RefreshCcw,
    title: "Telafi merkezi",
    desc: "Devamsızlık veya iptal → otomatik telafi hakkı → uygun slot önerisi → tek tık onay.",
  },
  {
    icon: CalendarDays,
    title: "Çok şubeli program",
    desc: "Şube, stüdyo, öğretmen ve ders akışını tek yerden yönetin — çakışma yok.",
  },
  {
    icon: MessageCircle,
    title: "Veli ve öğretmen bildirimleri",
    desc: "Telafi, hatırlatma ve ödeme durumu için hazır mesaj şablonları.",
  },
];

export default async function LandingPage() {
  const session = await getSessionContext();
  if (session) {
    redirect(homePathForRole(session.role));
  }

  return (
    <div className="min-h-screen bg-[#0a0612] text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <Image src={BRAND.logoPath ?? "/icon.png"} alt="" width={28} height={28} className="rounded-md" />
          <span className="text-xl font-extrabold uppercase tracking-wide">{BRAND.shortName}</span>
        </div>
        <Link
          href="/login"
          className="rounded-xl bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:bg-amber-100"
        >
          Giriş yap
        </Link>
      </header>

      <section className="relative mx-auto max-w-6xl px-6 pb-24 pt-16 text-center sm:pt-24">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(139,92,246,0.35),_transparent_55%)]" />
        <Image
          src={BRAND.logoPath ?? "/icon.png"}
          alt={BRAND.shortName}
          width={72}
          height={72}
          className="mx-auto mb-6 rounded-2xl shadow-lg shadow-black/40"
        />
        <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
          {BRAND.tagline}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-slate-300 sm:text-lg">{BRAND.description}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-6 py-3 text-sm font-semibold shadow-lg shadow-amber-600/30 hover:bg-amber-500"
          >
            Giriş yap
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-semibold">Okulun her gün kullandığı araçlar</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-[var(--color-text-muted)]">
          Program, yoklama, telafi ve ödeme yönetimini tek yerden yapın.
        </p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-lg border border-white/10 bg-[var(--color-surface)]/[0.04] p-6"
            >
              <f.icon className="h-8 w-8 text-amber-300" />
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-white/10 py-8 text-center text-xs text-[var(--color-text-muted)]">
        {BRAND.shortName}
      </footer>
    </div>
  );
}
