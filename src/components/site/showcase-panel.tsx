/**
 * Ürün vitrini (giriş ekranı + ana sayfa). Sunucu bileşeni; hareket yalnız
 * CSS (globals.css: nh-cycle / nh-pulse / nh-story-*) — JS, istek veya veri
 * okuması yok. Örnekler sektörden bağımsızdır ve ürünün kendi durum adlarını
 * kullanır. Tamamı dekoratiftir (aria-hidden).
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

export function SceneBody({ scene }: { scene: ShowcaseScene }) {
  return (
    <>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-white">{scene.title}</span>
        <span className="text-xs text-white/60">{scene.meta}</span>
      </div>
      <ul className="mt-4 space-y-2.5 text-sm">
        {scene.rows.map((r) => (
          <li
            key={r.lead + r.main + r.sub}
            className={`grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 rounded-xl px-3 py-2.5 ${
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
                r.focus ? "nh-pulse bg-amber-600 text-white" : "bg-white/15 text-white"
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

/** 3 sahne × 4 sn çapraz geçişli kart (dış çerçeve dahil). */
export function ShowcaseCycle({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      aria-hidden
      className={`relative h-[17.5rem] rounded-2xl bg-white/[0.07] ring-1 ring-white/15 backdrop-blur-sm ${className}`}
      style={style}
    >
      {CYCLE_SCENES.map((scene, si) => (
        <div
          key={scene.title}
          className="nh-cycle absolute inset-0 p-5"
          style={{ "--nh-cycle-delay": `${si * 4}s` } as CSSProperties}
        >
          <SceneBody scene={scene} />
        </div>
      ))}
    </div>
  );
}
