/**
 * Ana sayfanın tanıtım bölümleri (Türkçe). Metinler kodda, bağlantılar özellik/sektör sayfalarına gider.
 * Hareket yalnız CSS; JS, istek veya görsel dosyası yok. Uydurma müşteri, sayı veya vaat yazılmaz.
 */
import Link from "@/components/link";
import type { CSSProperties, ReactNode } from "react";
import { FEATURE_GROUPS, FEATURES } from "@/lib/marketing/features";
import { SECTORS } from "@/lib/marketing/sectors";
import { BLOG_POSTS } from "@/lib/marketing/blog";
import { LEGAL_PAGES } from "@/lib/marketing/legal-links";
import { CallMeForm } from "./call-me-form";
import { PanelMock, ScreenAi, ScreenApplications, ScreenAttendance, ScreenFinance, ScreenMakeup, ScreenProgram, ScreenReports } from "./product-screens";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2";

function Head({ eyebrow, title, description, tone = "light" }: { eyebrow: string; title: string; description?: string; tone?: "light" | "dark" }) {
  return (
    <div className="nh-view-up mx-auto max-w-3xl text-center">
      <p className={`text-xs font-bold uppercase tracking-[0.16em] ${tone === "dark" ? "text-amber-300" : "text-amber-700"}`}>{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {description ? <p className={`mt-4 text-base leading-relaxed sm:text-lg ${tone === "dark" ? "text-white/75" : "text-slate-600"}`}>{description}</p> : null}
    </div>
  );
}

const TOUR: { title: string; text: string; href: string; active: string; screen: ReactNode }[] = [
  { title: "Haftanın programı kendiliğinden oturur", text: "Bireysel ders, grup dersi ve kulüp oturumları tek takvimde. Öğretmen müsaitliği, oda doluluğu ve kapalı günler kaydetmeden önce kontrol edilir.", href: "/ozellikler/ders-programi", active: "Ders Programı", screen: <ScreenProgram /> },
  { title: "Yoklama girildi, gerisi kendiliğinden güncellendi", text: "Tek dokunuşluk yoklama; öğrenci takvimine, telafi hakkına, öğretmen hakedişine ve raporlara aynı anda yansır.", href: "/ozellikler/yoklama-takvimi", active: "Yoklama Takvimi", screen: <ScreenAttendance /> },
  { title: "Telafiler unutulmaz, tartışma çıkmaz", text: "Her talebin hakkı ve son günü bellidir. Sistem uygun saatleri önerir, planlanan telafi takvime işlenir.", href: "/ozellikler/telafi-merkezi", active: "Telafi Merkezi", screen: <ScreenMakeup /> },
  { title: "Başvurular dağılmadan kayda dönüşür", text: "Deneme dersi, kulüp ve iş başvuruları için kurumunuza özel sayfalar. Gelen talep tek listede durur, onayınızla öğrenci veya aday olur.", href: "/ozellikler/online-basvuru-formlari", active: "Başvurular", screen: <ScreenApplications /> },
  { title: "Kurum sahibi rakamları ay sonunu beklemeden görür", text: "Tahsilat, gider, öğretmen hakedişi ve personel bordrosu Finans Özeti'nde buluşur. Yetkisi olmayan hiç kimse bu ekranı göremez.", href: "/ozellikler/finans-ozeti", active: "Finans Özeti", screen: <ScreenFinance /> },
  { title: "Veli gelişimi görür, öğretmen raporu unutmaz", text: "Dört derste bir gelişim raporu kendiliğinden gündeme gelir. Değerlendirme, yoklama ve ödev raporları PDF olarak hazır.", href: "/ozellikler/ogretmen-gelisim-raporlari", active: "Raporlar", screen: <ScreenReports /> },
  { title: "Yapay zekâ taslağı hazırlar, kararı siz verirsiniz", text: "Doğal dille sorun, özet alın, mesaj taslağı hazırlatın. Asistan sizin yetkinizle çalışır; dışarı gidecek her mesaj önce onayınızdan geçer.", href: "/ozellikler/yapay-zeka-asistani", active: "NeviiHub AI", screen: <ScreenAi /> },
];

/** Kaydırdıkça ekran sabit kalır, sahneler ve içindeki öğeler oynar. */
export function TourSection() {
  const names = TOUR.map((_, i) => `--nh-t${i}`);
  return (
    <section id="urun-turu" className="scroll-mt-32 bg-[#fbf8f2] px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <Head eyebrow="Ürün turu" title="Kurumunuzun bir günü, tek sistemde" description="Aşağı kaydırın: ekranlar gerçek panelin ekranları, akış kurumunuzun her günkü akışı." />
        <div className="nh-tour-fallback mt-12 space-y-14">
          {TOUR.map((s) => (
            <article key={s.title} className="nh-view-up">
              <h3 className="text-2xl font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-3 text-base leading-relaxed text-slate-600">{s.text}</p>
              <Link href={s.href} className={`mt-3 inline-block text-sm font-semibold text-amber-800 ${FOCUS}`}>Ayrıntıları inceleyin →</Link>
              <PanelMock active={s.active} className="mt-5">{s.screen}</PanelMock>
            </article>
          ))}
        </div>
        <div className="nh-tour mt-10 hidden grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-12" style={{ timelineScope: names.join(", ") } as CSSProperties}>
          <ol>
            {TOUR.map((s, i) => (
              <li key={s.title} className="nh-tour-step flex min-h-[78vh] flex-col justify-center" style={{ viewTimelineName: names[i] } as CSSProperties}>
                <p className="text-sm font-bold text-amber-700">{String(i + 1).padStart(2, "0")}</p>
                <h3 className="mt-3 text-3xl font-semibold leading-tight tracking-tight">{s.title}</h3>
                <p className="mt-4 text-lg leading-relaxed text-slate-600">{s.text}</p>
                <Link href={s.href} className={`mt-4 inline-block w-fit text-sm font-semibold text-amber-800 hover:text-amber-900 ${FOCUS}`}>Ayrıntıları inceleyin →</Link>
              </li>
            ))}
          </ol>
          <div className="relative">
            <div className="sticky top-[calc(50vh-15rem)] h-[29rem]">
              {TOUR.map((s, i) => (
                <div key={s.title} className="nh-tour-layer absolute inset-0" style={{ "--nh-tl": names[i] } as CSSProperties}>
                  <PanelMock active={s.active}>{s.screen}</PanelMock>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Tüm özellikler: arama motoruna ve ziyaretçiye ayrıntı sayfalarının kapısı. */
export function ModulesSection() {
  return (
    <section id="ozellikler" className="scroll-mt-32 bg-white px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <Head eyebrow="Tüm özellikler" title="Eğitim kurumunuzun ihtiyaç duyduğu her modül" description="Her başlığa tıklayın; ne yaptığını, kurumunuza ne kazandıracağını ayrıntısıyla görün." />
        <div className="mt-12 space-y-10">
          {FEATURE_GROUPS.map((group) => (
            <div key={group} className="nh-view-up">
              <h3 className="text-xl text-slate-900">{group}</h3>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {FEATURES.filter((f) => f.group === group).map((f) => (
                  <li key={f.slug}>
                    <Link href={`/ozellikler/${f.slug}`} className={`nh-lift group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-amber-300 hover:shadow-md ${FOCUS}`}>
                      <span className="font-semibold text-slate-900 group-hover:text-amber-800">{f.title}</span>
                      <span className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-slate-600">{f.summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function SectorsSection() {
  return (
    <section id="sektorler" className="scroll-mt-32 bg-[#fbf8f2] px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <Head eyebrow="Her eğitim kurumu için" title="Müzikten boksa, dil kursundan etüt merkezine" description="Ders verdiğiniz her yerde aynı sorunlar var: program, yoklama, telafi, tahsilat, hakediş. NeviiHub bunları sektörünüzün diliyle çözer." />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SECTORS.map((s) => (
            <li key={s.slug} className="nh-view-up">
              <Link href={`/sektorler/${s.slug}`} className={`nh-lift flex h-full flex-col rounded-2xl bg-white p-6 shadow-sm ring-1 ring-amber-900/10 hover:shadow-md ${FOCUS}`}>
                <span className="text-lg font-semibold text-slate-900">{s.name}</span>
                <span className="mt-1 text-sm text-slate-500">{s.short}</span>
                <span className="mt-4 text-sm font-semibold text-amber-800">Çözümü görün →</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** "Başka kurumun yazılımına mı mahkûm olacağım?" sorusunun yanıtı. */
export function TailorSection() {
  const cards = [
    { title: "Modüller size göre açılır", text: "Kullanmadığınız ekran karşınıza çıkmaz. Paket ve modüller kurum bazında açılıp kapanır, büyüdükçe genişler." },
    { title: "Kuralları siz belirlersiniz", text: "Branşlar, ders süreleri, paketler, kampanyalar, ücret kuralları, çalışma günleri, başvuru formları ve e-posta metinleri kurumunuza göre ayarlanır." },
    { title: "Sürecinize özel ekranlar", text: "Sizde farklı işleyen bir süreç mi var? Görüşelim, ihtiyacınızı dinleyelim; gerekli modülü ve paneli kurumunuza uyarlayalım." },
    { title: "Güçlü altyapı, sağlam temel", text: "Rol bazlı yetki, kurumlar arası veri ayrımı, denetim kaydı ve yapay zekâ her kurumda aynı güvenlik kurallarıyla çalışır." },
  ];
  return (
    <section id="uyarlama" className="relative scroll-mt-32 overflow-hidden bg-[#5c3d00] px-6 py-16 text-white sm:py-24" style={{ "--text-primary": "#ffffff" } as CSSProperties}>
      <div aria-hidden className="nh-drift pointer-events-none absolute -right-1/4 -top-1/3 h-[140%] w-[80%] rounded-full opacity-50 blur-3xl" style={{ background: "radial-gradient(closest-side, #a56a00, transparent)" }} />
      <div className="relative mx-auto max-w-6xl">
        <Head tone="dark" eyebrow="Size uyarlanır" title="Hazır bir kalıba girmek zorunda değilsiniz" description="NeviiHub başka bir kurum için yapılmış bir programın kopyası değildir; her kurumun kendi işleyişine uyum sağlayacak şekilde tasarlandı." />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2">
          {cards.map((c) => (
            <li key={c.title} className="nh-view-up rounded-2xl bg-white/[0.08] p-6 ring-1 ring-white/15">
              <h3 className="text-lg font-semibold" style={{ color: "#fff" }}>{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/80">{c.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function TrustSection() {
  const items = [
    ["Veriniz size ait", "Her kurumun verisi diğerlerinden ayrı tutulur; kimlik yalnız oturumdan çözülür, dışarıdan değiştirilemez."],
    ["Herkes yetkisi kadar görür", "Kurum sahibi, yönetici, öğretmen, öğrenci ve veli için ayrı yetki. Finans ekranı yalnız yetkiliye açılır."],
    ["Her kritik işlem kayıtlı", "Kim, neyi, ne zaman yaptı görülür. Kritik silmelerde ek parola istenir."],
    ["Girişler korunur", "Şifreli bağlantı, otomatik saldırılara karşı doğrulama ve hesap başına deneme sınırı."],
    ["Sunucular Frankfurt'ta", "Uygulama ve veritabanı Avrupa Birliği'ndeki (Frankfurt) sunucularda çalışır. Altyapı sağlayıcıları yasal metinlerde tek tek yazılıdır."],
    ["KVKK süreçleri ürünün içinde", "Aydınlatma metni, açık rıza formları, fotoğraf/video izinleri ve hesap silme talebi."],
  ];
  return (
    <section id="guven" className="scroll-mt-32 bg-white px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <Head eyebrow="Güven" title="Öğrenci verisi emanettir" description="Güvenlik sonradan eklenen bir özellik değil, sistemin kuruluş biçimidir." />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(([t, d]) => (
            <li key={t} className="nh-view-up rounded-2xl border border-slate-200 p-6">
              <h3 className="font-semibold text-slate-900">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{d}</p>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-center text-sm text-slate-600">
          {LEGAL_PAGES.slice(0, 4).map((l, i) => (
            <span key={l.slug}>
              {i > 0 ? " · " : ""}
              <Link href={`/hukuk/${l.slug}`} className="font-medium text-amber-800 underline-offset-2 hover:underline">{l.title}</Link>
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}

/** Başlangıç: kurulum desteği + "sizi arayalım". */
export function SetupSection() {
  const steps = [
    ["İlk hafta kurulum desteği", "Şube, öğretmen, oda ve öğrenci listenizi birlikte aktaralım; ekibinizi eğitelim, hızlıca başlayın."],
    ["30 gün ücretsiz deneyin", "Kart bilgisi gerekmez. Denemenin sonunda devam edip etmemek size kalır."],
    ["Veritabanınız Avrupa'da (Frankfurt)", "KVKK süreçleri hazır; kurumunuzun verisi diğer kurumlardan ayrı tutulur."],
  ];
  return (
    <section id="nasil-baslarsiniz" className="scroll-mt-32 bg-[#fbf8f2] px-6 py-16 sm:py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="nh-view-up">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">Başlamak kolay</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Bir haftada yayında</h2>
          <ul className="mt-8 space-y-5">
            {steps.map(([t, d], i) => (
              <li key={t} className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 font-bold text-amber-800">{i + 1}</span>
                <span>
                  <span className="block font-semibold text-slate-900">{t}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-slate-600">{d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="nh-view-up rounded-3xl bg-white p-6 shadow-xl shadow-amber-900/10 ring-1 ring-amber-900/10 sm:p-8">
          <h3 className="text-xl font-semibold text-slate-900">Formla uğraşmak istemiyor musunuz?</h3>
          <p className="mb-5 mt-2 text-sm leading-relaxed text-slate-600">Bilgilerinizi bırakın, hesabınızı telefonda birlikte açalım.</p>
          <CallMeForm source="ana-sayfa" />
        </div>
      </div>
    </section>
  );
}

export function BlogTeaserSection() {
  return (
    <section id="blog" className="scroll-mt-32 bg-white px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <Head eyebrow="Blog" title="Eğitim kurumu yönetimine dair rehberler" />
        <ul className="mt-10 grid gap-4 md:grid-cols-3">
          {BLOG_POSTS.slice(0, 3).map((p) => (
            <li key={p.slug} className="nh-view-up">
              <Link href={`/blog/${p.slug}`} className={`nh-lift flex h-full flex-col rounded-2xl border border-slate-200 p-6 hover:border-amber-300 ${FOCUS}`}>
                <span className="text-xs font-bold uppercase tracking-wide text-amber-700">{p.sector}</span>
                <span className="mt-2 font-semibold leading-snug text-slate-900">{p.title}</span>
                <span className="mt-2 line-clamp-2 text-sm text-slate-600">{p.description}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-center">
          <Link href="/blog" className={`text-sm font-semibold text-amber-800 ${FOCUS}`}>Tüm yazılar →</Link>
        </p>
      </div>
    </section>
  );
}
