import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CalendarDays,
  Check,
  MessageCircle,
  RefreshCcw,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { getSessionContext, homePathForRole } from "@/lib/auth/session";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

const features = [
  {
    icon: RefreshCcw,
    title: "Telafi merkezi",
    desc: "Devamsızlık veya okul iptali → otomatik telafi hakkı → skorlu slot önerisi → tek tık onay.",
  },
  {
    icon: CalendarDays,
    title: "2 şubeli program",
    desc: "Erzene ve Evka 3 için ayrı stüdyo, öğretmen ve ders akışı. Çakışma yok.",
  },
  {
    icon: MessageCircle,
    title: "WhatsApp şablonları",
    desc: "Veli ve öğretmene hazır mesajlar: telafi, hatırlatma, ödeme. wa.me ile tek tık gönder.",
  },
];

const plans = [
  {
    name: "Başlangıç",
    price: "2.500 ₺",
    period: "/ay",
    blurb: "Tek şube, temel telafi + program",
    features: ["1 şube", "Telafi motoru", "Yoklama", "Öğrenci / öğretmen", "WhatsApp şablonları"],
    cta: "Demo iste",
    highlighted: false,
  },
  {
    name: "Akademi",
    price: "4.500 ₺",
    period: "/ay",
    blurb: "2 şubeli okullar için",
    features: [
      "2 şube (Erzene + Evka 3)",
      "Telafi + öncelikli yerleştirme",
      "Veli & öğretmen portali",
      "Ödeme takibi",
      "Kurulum + 1 saat eğitim",
    ],
    cta: "Önerilen paket",
    highlighted: true,
  },
  {
    name: "Kurumsal",
    price: "Özel",
    period: "",
    blurb: "Çok şube, özel entegrasyon",
    features: ["Sınırsız şube", "SMS / WhatsApp API", "Özel raporlar", "Öncelikli destek", "Marka uyumu"],
    cta: "İletişime geç",
    highlighted: false,
  },
];

export default async function LandingPage() {
  const session = await getSessionContext();
  if (session) {
    redirect(homePathForRole(session.role));
  }

  return (
    <div className="min-h-screen bg-[#0a0612] text-white">
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <span className="text-xl font-extrabold uppercase tracking-wide">{BRAND.name}</span>
        </div>
        <nav className="hidden items-center gap-6 text-sm text-slate-300 sm:flex">
          <a href="#ozellikler" className="hover:text-white">
            Özellikler
          </a>
          <a href="#fiyat" className="hover:text-white">
            Fiyatlandırma
          </a>
          <Link
            href="/login"
            className="rounded-xl bg-[var(--color-surface)] px-4 py-2 font-medium text-[var(--color-text)] hover:bg-amber-100"
          >
            Giriş
          </Link>
        </nav>
        <Link
          href="/login"
          className="rounded-xl bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-text)] sm:hidden"
        >
          Giriş
        </Link>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-6xl px-6 pb-20 pt-10 text-center sm:pt-16">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(139,92,246,0.35),_transparent_55%)]" />
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200">
          <Sparkles className="h-3.5 w-3.5" />
          Müzik okulları için operasyon SaaS
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl">
          Telafi derslerini{" "}
          <span className="bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent">
            WhatsApp kaosundan
          </span>{" "}
          kurtar
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-slate-300 sm:text-lg">
          Yoklama, telafi, program, ödeme ve veli/öğretmen bildirimi bir arada. Gerçekçi demo
          verisiyle çok şubeli bir müzik okulunun günlük iş akışını gösteriyor.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-3 text-sm font-semibold shadow-lg shadow-amber-600/30 hover:bg-amber-500"
          >
            Demo panelini aç
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/login?next=/ogrenci"
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-[var(--color-surface)]/5 px-5 py-3 text-sm font-medium hover:bg-[var(--color-surface)]/10"
          >
            Öğrenci portalı
          </Link>
          <Link
            href="/login?next=/ogretmen"
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-[var(--color-surface)]/5 px-5 py-3 text-sm font-medium hover:bg-[var(--color-surface)]/10"
          >
            Öğretmen portalı
          </Link>
        </div>
      </section>

      {/* Features */}
      <section id="ozellikler" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-semibold">Okulun her gün kullandığı araçlar</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-[var(--color-text-muted)]">
          Excel ve WhatsApp gruplarını bırakın. Okul, öğretmen, veli ve öğrenci verisini tek yerden yönetin.
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
        <div className="mt-8 rounded-lg border border-amber-400/20 bg-amber-500/10 p-5 text-sm text-amber-100">
          <strong>Demo akışı:</strong> Yoklama al → Gelmedi / iptal seç → Telafi hakkı oluşur → Uygun slot önerilir → Onayla → WhatsApp mesajı hazır.
        </div>
      </section>

      {/* Workflow */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-semibold">Gerçek kullanım akışı</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-[var(--color-text-muted)]">
          Uygulamayı bir müzik okulu yöneticisi gibi kullanın: yoklamayı kaydedin, telafi hakkını yönetin, uygun slotları önerin ve veli/öğretmene bildirim gönderin.
        </p>
        <div className="mt-10 grid gap-5 md:grid-cols-4">
          <div className="rounded-3xl border border-white/10 bg-[var(--color-surface)]/[0.03] p-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
              1. Yoklama
            </p>
            <p className="mt-4 text-sm text-slate-300">
              Dersi seçin, devamsızlık veya okul iptalini işaretleyin. Sistem otomatik telafi hakkı oluşturur.
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-[var(--color-surface)]/[0.03] p-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
              2. Telafi talebi
            </p>
            <p className="mt-4 text-sm text-slate-300">
              Açık telafi talepleri panelde görünür. Hangi öğrencinin hangi dersi telafi edeceğini izleyin.
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-[var(--color-surface)]/[0.03] p-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
              3. Uygun slot
            </p>
            <p className="mt-4 text-sm text-slate-300">
              Şube, öğretmen ve oda müsaitliğine göre öneriler sunar. Tek tıkla en iyi telafi zamanını seçin.
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-[var(--color-surface)]/[0.03] p-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">
              4. Bildirim
            </p>
            <p className="mt-4 text-sm text-slate-300">
              Onaylanan telafir için veliye ve öğretmene WhatsApp mesajı hazırlar. Manuel gönderim ya da ileride API entegrasyonu.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="fiyat" className="border-t border-white/10 bg-[var(--color-surface)]/[0.02] py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-semibold">Fiyatlandırma</h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-[var(--color-text-muted)]">
            İlk okula pilot + kurulum. Fiyatlar referans; sözleşmede netleşir.
          </p>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {plans.map((p) => (
              <div
                key={p.name}
                className={`rounded-3xl border p-6 ${
                  p.highlighted
                    ? "border-amber-400/50 bg-gradient-to-b from-amber-600/30 to-transparent shadow-xl shadow-amber-900/40"
                    : "border-white/10 bg-[var(--color-surface)]/[0.03]"
                }`}
              >
                {p.highlighted ? (
                  <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                    Önerilen
                  </span>
                ) : null}
                <h3 className="mt-2 text-xl font-semibold">{p.name}</h3>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">{p.blurb}</p>
                <p className="mt-4">
                  <span className="text-3xl font-semibold">{p.price}</span>
                  <span className="text-[var(--color-text-muted)]">{p.period}</span>
                </p>
                <ul className="mt-5 space-y-2">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/panel"
                  className={`mt-6 flex w-full items-center justify-center rounded-xl py-2.5 text-sm font-semibold ${
                    p.highlighted
                      ? "bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-amber-100"
                      : "border border-white/15 hover:bg-[var(--color-surface)]/10"
                  }`}
                >
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-6 py-16 text-center">
        <h2 className="text-2xl font-semibold sm:text-3xl">Okula götürmeye hazır demo</h2>
        <p className="mx-auto mt-3 max-w-xl text-[var(--color-text-muted)]">
          Panel, veli ve öğretmen arayüzleri hazır. Veri yerel demo store&apos;da; sıfırdan
          sıfırlanabilir.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/login"
            className="rounded-xl bg-amber-600 px-5 py-3 text-sm font-semibold hover:bg-amber-500"
          >
            Giriş yap
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/10 py-8 text-center text-xs text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
        {BRAND.name} · github.com/hidircan
      </footer>
    </div>
  );
}
