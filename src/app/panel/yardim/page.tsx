import { redirect } from "next/navigation";
import Link from "@/components/link";
import { requireSessionContext } from "@/lib/auth/session";
import { PageHeader, Card } from "@/components/ui";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

/**
 * Yardım Merkezi — mevcut davranışa dayalı, statik kullanım rehberi.
 * Sidebar kalabalıklaştırılmaz; command palette + user menu erişimi.
 */
const SECTIONS = [
  {
    id: "hizli-baslangic",
    title: "1. Hızlı başlangıç",
    items: [
      { href: "/panel", label: "Panel özeti", body: "Günün operasyonel özetine buradan bakın." },
      { href: "/panel/ogrenciler/yeni", label: "Öğrenci kaydı", body: "Yeni öğrenci formundan kayıt açın; paket ve ödeme profili öğrenci detayında tamamlanır." },
      { href: "/panel/ogretmenler/yeni", label: "Öğretmen ekleme", body: "Öğretmen oluşturup enstrüman, müsaitlik ve şube bilgisini doldurun." },
      { href: "/panel/program", label: "Ders planlama", body: "Haftalık programda ders ekleyin, taşıyın veya iptal edin." },
      { href: "/panel/yoklama", label: "Yoklama alma", body: "Yoklama takviminden geldi/gelmedi işaretleyin; tahsilat buradan da alınabilir." },
      { href: "/panel/odemeler", label: "Tahsilat yönetimi", body: "Bekleyen ve gecikmiş ödemeleri listeler; ödendi işaretleme ve düzenleme burada." },
    ],
  },
  {
    id: "operasyon",
    title: "2. Operasyon rehberleri",
    items: [
      { href: "/panel/telafi", label: "Telafi Merkezi", body: "Açık talepler için plan önerin, planı onaylayın veya manuel plan oluşturun." },
      { href: "/panel/is-takip", label: "İş Takip", body: "Kanban varsayılan görünüm; görev atama, son tarih ve hatırlatmalar." },
      { href: "/panel/personel", label: "Personel ve izinler", body: "Personel listesi; bordro ve izin alt sayfalarından HR işlemleri." },
      { href: "/panel/hakedisler", label: "Öğretmen hakedişleri", body: "Dönem hakediş dökümü ve ödeme kaydı. Öğretmen detayından da açılır." },
      { href: "/panel/paketler", label: "Paketler ve fiyatlandırma", body: "Paket listesi; yeni paket ayrı ekrandan oluşturulur." },
    ],
  },
  {
    id: "raporlama",
    title: "3. Raporlama ve kalite",
    items: [
      {
        href: "/panel/ogretmenler",
        label: "Öğretmen performans skoru",
        body: "Yoklama temelli 0–100 skor; detay için #performans-skoru bölümüne bakın.",
        anchor: "performans-skoru",
      },
      { href: "/panel/yoklama", label: "Yoklama ve gelişim", body: "Takvim ve öğrenci detayında gelişim/değerlendirme bölümleri." },
      { href: "/panel/odemeler", label: "Finans ve gecikmiş ödeme", body: "Gecikmiş filtre, tahsilat takip bağlantısı ve öğrenci ödeme geçmişi." },
    ],
  },
  {
    id: "portallar",
    title: "4. Portallar",
    items: [
      { href: "/ogretmen", label: "Öğretmen portalı", body: "Program, yoklama kapsamı, iş takip ve hakediş görünümü." },
      { href: "/ogrenci", label: "Öğrenci portalı", body: "Öğrenci ve veli aynı oturumla — program, ödev, materyal, ödeme ve değerlendirme." },
      { href: "/panel", label: "Mobil kullanım", body: "Panel ve portallar responsive; Glass 3D sunum yalnız öğretmen/öğrenci kabuklarında." },
    ],
  },
] as const;

export default async function YardimMerkeziPage() {
  try {
    await requireSessionContext();
  } catch {
    redirect("/login?next=/panel/yardim");
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Yardım Merkezi"
        description="NeviiHub paneli için kısa kullanım rehberi. Yalnızca mevcut özellikler anlatılır."
      />

      <nav aria-label="Yardım içinde gezin" className="mb-6 flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-text)]"
          >
            {s.title.replace(/^\d+\.\s*/, "")}
          </a>
        ))}
        <a
          href="#performans-skoru"
          className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-text)]"
        >
          Performans skoru
        </a>
      </nav>

      <div className="space-y-6">
        {SECTIONS.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-4">
            <h2 className="mb-3 text-base font-semibold text-[var(--color-text)]">{section.title}</h2>
            <div className="space-y-2">
              {section.items.map((item) => (
                <Card key={item.label} className="!p-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--color-text)]">{item.label}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-muted)]">{item.body}</p>
                    </div>
                    <Link
                      href={item.href}
                      className="shrink-0 text-xs font-medium text-[var(--color-primary)] hover:underline"
                    >
                      Ekrana git →
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        ))}

        <section id="performans-skoru" className="scroll-mt-4">
          <h2 className="mb-3 text-base font-semibold text-[var(--color-text)]">
            Öğretmen performans skoru nasıl hesaplanır?
          </h2>
          <Card className="!p-4">
            <p className="text-sm text-[var(--color-text)]">
              Skor, ilgili öğretmenin derslerine bağlı{" "}
              <strong className="font-semibold">yoklama (Attendance)</strong> kayıtlarından
              deterministik üretilir. LLM skoru hesaplamaz; isteğe bağlı AI yalnızca metin yorumu
              üretebilir.
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--color-text-muted)]">
              <li>
                Minimum <strong className="text-[var(--color-text)]">3</strong> yoklamalı ders
                gerekir; aksi halde skor gösterilmez (“yetersiz veri”).
              </li>
              <li>
                <strong className="text-[var(--color-text)]">Geldi</strong> = 1,0 ·{" "}
                <strong className="text-[var(--color-text)]">Geç</strong> = 0,6 · Gelmedi katkı
                vermez ama paydada sayılır.
              </li>
              <li>
                <strong className="text-[var(--color-text)]">Okul iptali</strong> oranı × 20 puan
                ceza olarak düşülür.
              </li>
              <li>
                Formül:{" "}
                <code className="rounded bg-[var(--color-surface-muted)] px-1 text-xs text-[var(--color-text)]">
                  ((present + late×0.6) / N)×100 − (schoolCancelled / N)×20
                </code>
                , 0–100 aralığına yuvarlanır.
              </li>
              <li>Aktif öğrenci sayısı skora girmez; yalnızca bilgi bağlamıdır.</li>
              <li>Skor karar desteğidir; tek başına performans hükmü yerine geçmez.</li>
            </ul>
            <p className="mt-3 text-xs text-[var(--color-text-muted)]">
              Kaynak kod: <code className="text-[var(--color-text)]">src/lib/insights/teacher-performance.ts</code>
            </p>
            <Link
              href="/panel/ogretmenler"
              className="mt-3 inline-block text-xs font-medium text-[var(--color-primary)] hover:underline"
            >
              Öğretmenler listesine git →
            </Link>
          </Card>
        </section>
      </div>
    </div>
  );
}
