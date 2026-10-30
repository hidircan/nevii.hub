/**
 * Ürün vitrini (giriş ekranı + ana sayfa). Sunucu bileşeni; hareket yalnız
 * CSS (globals.css: nh-cycle ve ailesi) — JS, istek, görsel dosyası veya veri
 * okuması yok; Vercel/Supabase kotasına etkisi sıfır. Örnekler sektörden
 * bağımsızdır, ürünün kendi durum adlarını kullanır ve fiyat/istatistik içermez.
 * Tamamı dekoratiftir (aria-hidden).
 */
import type { CSSProperties } from "react";

export type ShowcaseScene = {
  title: string;
  meta: string;
  rows: { lead: string; main: string; sub: string; status: string; focus?: boolean }[];
};

/** Giriş ekranında dönen 3 sahne. */
export const CYCLE_SCENES: ShowcaseScene[] = [
  {
    title: "Bugünkü dersler",
    meta: "Ders programı",
    rows: [
      { lead: "10:00", main: "Piyano", sub: "Elif K.", status: "Tamamlandı" },
      { lead: "13:30", main: "Yoga", sub: "Grup dersi", status: "Tamamlandı" },
      { lead: "16:00", main: "Keman", sub: "Can D.", status: "Derste", focus: true },
      { lead: "18:15", main: "İngilizce", sub: "B2 sınıfı", status: "Sıradaki" },
    ],
  },
  {
    title: "Telafi talepleri",
    meta: "Telafi merkezi",
    rows: [
      { lead: "Per", main: "Keman", sub: "Can D.", status: "Onaylandı" },
      { lead: "Cum", main: "Gitar", sub: "Deniz A.", status: "Yeni talep", focus: true },
      { lead: "Cmt", main: "Bale", sub: "Zeynep T.", status: "Planlandı" },
      { lead: "Paz", main: "Resim", sub: "Ali R.", status: "Planlandı" },
    ],
  },
  {
    title: "Kasım tahsilatı",
    meta: "Ödemeler",
    rows: [
      { lead: "1 Kas", main: "Piyano", sub: "Elif K.", status: "Ödendi" },
      { lead: "3 Kas", main: "Yoga", sub: "Selin B.", status: "Ödendi" },
      { lead: "5 Kas", main: "Keman", sub: "Can D.", status: "Vadesi bugün", focus: true },
      { lead: "8 Kas", main: "Gitar", sub: "Deniz A.", status: "Bekliyor" },
    ],
  },
];

/** Ana sayfa kaydırmalı anlatımı: yönetim / öğretmen / veli portalı. */
export const STORY_SCENES: ShowcaseScene[] = [
  CYCLE_SCENES[0]!,
  {
    title: "Bu hafta derslerim",
    meta: "Öğretmen portalı",
    rows: [
      { lead: "Pzt", main: "Keman", sub: "Can D.", status: "Yoklama alındı" },
      { lead: "Çar", main: "Keman", sub: "Ece Y.", status: "Telafi" },
      { lead: "Per", main: "Keman", sub: "Grup", status: "Yoklama bekliyor", focus: true },
      { lead: "Cum", main: "Keman", sub: "Can D.", status: "Planlandı" },
    ],
  },
  {
    title: "Elif'in hesabı",
    meta: "Veli portalı",
    rows: [
      { lead: "Eki", main: "Aylık ücret", sub: "Piyano", status: "Ödendi" },
      { lead: "Kas", main: "Aylık ücret", sub: "Piyano", status: "Vadesi 5 Kas", focus: true },
      { lead: "Ödev", main: "Gam çalışması", sub: "Pazartesi", status: "Teslim edildi" },
      { lead: "Ders", main: "Piyano", sub: "Çar 16:00", status: "Planlandı" },
    ],
  },
];

const vars = (values: Record<string, string | number>) => values as CSSProperties;

export function SceneBody({ scene, animate = false }: { scene: ShowcaseScene; animate?: boolean }) {
  return (
    <>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-white">{scene.title}</span>
        <span className="text-xs text-white/60">{scene.meta}</span>
      </div>
      <ul className="mt-4 space-y-2.5 text-sm">
        {scene.rows.map((r, i) => (
          <li
            key={r.lead + r.main + r.sub}
            style={animate ? vars({ "--nh-i": i }) : undefined}
            className={`${animate ? "nh-enter-x " : ""}grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 rounded-xl px-3 py-2.5 ${
              r.focus ? "bg-white text-slate-900" : "bg-white/[0.06] text-white"
            }`}
          >
            <span className={`tabular-nums ${r.focus ? "font-semibold" : "text-white/70"}`}>{r.lead}</span>
            <span className="min-w-0 truncate">
              <span className="font-medium">{r.main}</span>
              <span className={r.focus ? "text-slate-500" : "text-white/60"}> {r.sub}</span>
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                r.focus ? "bg-amber-600 text-white" : "bg-white/15 text-white"
              }`}
            >
              {r.status}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

const CYCLE_LOOP = 12;

/** Giriş ekranı vitrini: 3 sahne, üstte ilerleme çizgileri, satırlar sırayla gelir. */
export function ShowcaseCycle({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      aria-hidden
      className={`relative h-[19rem] overflow-hidden rounded-2xl bg-white/[0.07] ring-1 ring-white/15 backdrop-blur-sm ${className}`}
      style={{ ...vars({ "--nh-loop": `${CYCLE_LOOP}s` }), ...style }}
    >
      <div className="absolute inset-x-5 top-3 z-10 flex gap-1.5">
        {CYCLE_SCENES.map((scene, si) => (
          <span key={scene.title} className="h-1 flex-1 overflow-hidden rounded-full bg-white/15">
            <span className="nh-bar-fill block h-full origin-left bg-amber-400" style={vars({ "--nh-at": `${(si * CYCLE_LOOP) / 3}s` })} />
          </span>
        ))}
      </div>
      {CYCLE_SCENES.map((scene, si) => (
        <div key={scene.title} className="nh-cycle absolute inset-0 p-5 pt-7" style={vars({ "--nh-at": `${(si * CYCLE_LOOP) / 3}s` })}>
          <SceneBody scene={scene} animate />
        </div>
      ))}
    </div>
  );
}

const STAGE_LOOP = 15;
const stageAt = (scene: number) => vars({ "--nh-at": `${(scene * STAGE_LOOP) / 3}s` });

const WEEK_LESSONS: { day: number; row: number; span: number; label: string; tone: string }[] = [
  { day: 0, row: 1, span: 2, label: "Piyano", tone: "bg-amber-500 text-white" },
  { day: 0, row: 4, span: 1, label: "Yoga", tone: "bg-amber-100 text-amber-900" },
  { day: 1, row: 2, span: 2, label: "Keman", tone: "bg-[#4a3208] text-white" },
  { day: 1, row: 5, span: 1, label: "Gitar", tone: "bg-amber-200 text-amber-900" },
  { day: 2, row: 1, span: 1, label: "Bale", tone: "bg-amber-100 text-amber-900" },
  { day: 2, row: 3, span: 2, label: "İngilizce", tone: "bg-amber-500 text-white" },
  { day: 3, row: 2, span: 1, label: "Resim", tone: "bg-amber-200 text-amber-900" },
  { day: 3, row: 4, span: 2, label: "Piyano", tone: "bg-[#4a3208] text-white" },
  { day: 4, row: 1, span: 2, label: "Keman", tone: "bg-amber-100 text-amber-900" },
  { day: 4, row: 4, span: 1, label: "Yoga", tone: "bg-amber-500 text-white" },
];

const ATTENDANCE_ROWS: { name: string; lesson: string; status: string; tone: string }[] = [
  { name: "Elif K.", lesson: "Piyano · 10:00", status: "Geldi", tone: "bg-green-100 text-green-800" },
  { name: "Can D.", lesson: "Keman · 11:30", status: "Geldi", tone: "bg-green-100 text-green-800" },
  { name: "Deniz A.", lesson: "Gitar · 13:00", status: "Telafi", tone: "bg-yellow-100 text-yellow-800" },
  { name: "Selin B.", lesson: "Yoga · 15:00", status: "İşlendi", tone: "bg-red-100 text-red-800" },
  { name: "Zeynep T.", lesson: "Bale · 16:30", status: "Geldi", tone: "bg-green-100 text-green-800" },
];

const COLLECTION_BARS = [46, 62, 54, 78, 70, 92];
const COLLECTION_MONTHS = ["Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas"];
const COLLECTION_RULES: { label: string; status: string; tone: string }[] = [
  { label: "Piyano · Elif K.", status: "Ödendi", tone: "bg-green-100 text-green-800" },
  { label: "Keman · Can D.", status: "Vadesi bugün", tone: "bg-amber-100 text-amber-900" },
  { label: "Gitar · Deniz A.", status: "Bekliyor", tone: "bg-slate-100 text-slate-700" },
];

const NOTIFICATIONS: { title: string; body: string }[] = [
  { title: "Ders başladı", body: "Keman · Can D." },
  { title: "Yoklama alındı", body: "Piyano · Elif K." },
  { title: "Telafi onaylandı", body: "Gitar · Cuma 14:00" },
  { title: "Ödeme alındı", body: "Makbuz hazır" },
];

const SIDEBAR_ITEMS = ["Ders programı", "Yoklama", "Ödemeler"];

/**
 * Ana sayfa ürün sahnesi: panel penceresinde sırayla program, yoklama ve tahsilat;
 * önünde bildirim alan telefon, altında akan modül şeridi.
 */
export function ProductStage({ modules }: { modules: string[] }) {
  return (
    <div aria-hidden className="relative mx-auto mt-14 max-w-5xl" style={vars({ "--nh-loop": `${STAGE_LOOP}s` })}>
      <div
        className="nh-drift pointer-events-none absolute -inset-x-20 -inset-y-12 -z-10 rounded-full opacity-50 blur-3xl"
        style={{ background: "radial-gradient(closest-side, #fcd34d, transparent)" }}
      />
      <div className="nh-stage relative">
        <div className="overflow-hidden rounded-[1.25rem] bg-[#4a3208] p-2 shadow-2xl shadow-amber-900/30 ring-1 ring-black/10 sm:p-3">
          <div className="flex items-center gap-3 px-2 pb-2 pt-1 text-xs text-white/70">
            <span className="flex gap-1.5">
              <i className="h-2.5 w-2.5 rounded-full bg-white/25" />
              <i className="h-2.5 w-2.5 rounded-full bg-white/25" />
              <i className="h-2.5 w-2.5 rounded-full bg-white/25" />
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1">neviihub.com/panel</span>
          </div>
          <div className="flex h-[23rem] overflow-hidden rounded-xl bg-[#faf7f0] text-left text-slate-900 sm:h-[29rem]">
            <div className="hidden w-44 shrink-0 flex-col gap-1 border-r border-amber-900/10 bg-white/70 p-3 sm:flex">
              <p className="mb-2 px-2 text-sm font-extrabold tracking-tight">NeviiHub</p>
              {SIDEBAR_ITEMS.map((item, i) => (
                <span key={item} className="relative rounded-lg px-2 py-2 text-xs font-medium text-slate-600">
                  <span className="nh-side-on absolute inset-0 rounded-lg bg-amber-100" style={stageAt(i)} />
                  <span className="relative">{item}</span>
                </span>
              ))}
              <span className="px-2 py-2 text-xs text-slate-400">Öğrenciler</span>
              <span className="px-2 py-2 text-xs text-slate-400">Telafi merkezi</span>
              <span className="px-2 py-2 text-xs text-slate-400">Raporlar</span>
            </div>
            {/* Telefon sağ tarafa biner; içerik onun altında kalmasın. */}
            <div className="relative min-w-0 flex-1 md:mr-24 lg:mr-20">
              <div className="nh-cycle absolute inset-0 flex flex-col p-4 sm:p-6" style={stageAt(0)}>
                <p className="text-lg font-semibold">Ders programı</p>
                <p className="text-xs text-slate-500">Bu hafta · tüm şubeler</p>
                <div className="mt-4 grid flex-1 grid-cols-5 grid-rows-[auto_repeat(5,minmax(0,1fr))] gap-1.5 sm:gap-2">
                  {["Pzt", "Sal", "Çar", "Per", "Cum"].map((d) => (
                    <span key={d} className="text-center text-[11px] font-semibold text-slate-500">
                      {d}
                    </span>
                  ))}
                  {WEEK_LESSONS.map((l, i) => (
                    <span
                      key={`${l.day}-${l.row}`}
                      className={`nh-pop flex items-center justify-center overflow-hidden rounded-lg px-1 text-center text-[11px] font-semibold ${l.tone}`}
                      style={{ gridColumn: l.day + 1, gridRow: `${l.row + 1} / span ${l.span}`, ...stageAt(0), ...vars({ "--nh-i": i }) }}
                    >
                      {l.label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="nh-cycle absolute inset-0 p-4 sm:p-6" style={stageAt(1)}>
                <p className="text-lg font-semibold">Yoklama</p>
                <p className="text-xs text-slate-500">Tek dokunuşla işaretlenir, hakedişe ve rapora yansır</p>
                <ul className="mt-4 space-y-2">
                  {ATTENDANCE_ROWS.map((r, i) => (
                    <li
                      key={r.name}
                      className="nh-enter-x flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-amber-900/5"
                      style={{ ...stageAt(1), ...vars({ "--nh-i": i }) }}
                    >
                      <span className="min-w-0 truncate text-sm">
                        <span className="font-semibold">{r.name}</span>
                        <span className="ml-2 text-xs text-slate-500">{r.lesson}</span>
                      </span>
                      <span className={`nh-stamp shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.tone}`} style={{ ...stageAt(1), ...vars({ "--nh-i": i + 2 }) }}>
                        {r.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="nh-cycle absolute inset-0 flex flex-col p-4 sm:p-6" style={stageAt(2)}>
                <p className="text-lg font-semibold">Tahsilat</p>
                <p className="text-xs text-slate-500">Vadesi gelen, ödenen ve bekleyen tek ekranda</p>
                <div className="mt-4 flex min-h-0 flex-1 items-end gap-2 rounded-xl bg-white p-3 shadow-sm ring-1 ring-amber-900/5 sm:gap-3 sm:p-4">
                  {COLLECTION_BARS.map((h, i) => (
                    <span key={COLLECTION_MONTHS[i]} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                      <span
                        className="nh-grow w-full rounded-t-md bg-gradient-to-t from-amber-600 to-amber-300"
                        style={{ height: `${h}%`, ...stageAt(2), ...vars({ "--nh-i": i }) }}
                      />
                      <span className="text-[10px] font-medium text-slate-500">{COLLECTION_MONTHS[i]}</span>
                    </span>
                  ))}
                </div>
                <ul className="mt-3 space-y-1.5">
                  {COLLECTION_RULES.map((r, i) => (
                    <li key={r.label} className="nh-enter-x flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-xs ring-1 ring-amber-900/5" style={{ ...stageAt(2), ...vars({ "--nh-i": i + 5 }) }}>
                      <span className="font-medium">{r.label}</span>
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${r.tone}`}>{r.status}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
        <div className="nh-float absolute -bottom-10 -right-4 hidden w-48 rounded-[1.75rem] bg-slate-950 p-1.5 shadow-2xl shadow-black/40 ring-1 ring-white/10 md:block lg:-right-12">
          <div className="h-[21rem] overflow-hidden rounded-[1.4rem] bg-[#faf7f0] p-2.5 text-left">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300" />
            <p className="px-1 text-sm font-extrabold tracking-tight text-slate-900">NeviiHub</p>
            <ul className="mt-2 space-y-2">
              {NOTIFICATIONS.map((n, i) => (
                <li key={n.title} className="nh-notif rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-amber-900/5" style={vars({ "--nh-i": i })}>
                  <p className="text-xs font-semibold text-slate-900">{n.title}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{n.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="nh-marquee-wrap mt-16 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]">
        <div className="nh-marquee flex w-max gap-2.5">
          {[...modules, ...modules].map((m, i) => (
            <span key={i} className="whitespace-nowrap rounded-full border border-amber-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
              {m}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
