/**
 * Gerçek panel ekranlarını anımsatan dekoratif sahneler (aria-hidden). Ekran adları ve durum renkleri
 * üründekiyle aynıdır; tutar veya istatistik içermez. Hareket yalnız CSS: `nh-sp/sx/sg` sınıfları
 * kaydırmaya bağlı çalışır (globals.css), başka yerde statik görünür.
 */
import type { CSSProperties, ReactNode } from "react";

const at = (i: number) => ({ "--nh-i": i }) as CSSProperties;

const SIDEBAR = ["Ana Sayfa", "Ders Programı", "Yoklama Takvimi", "Telafi Merkezi", "Öğrenciler", "Başvurular", "Ödemeler", "Finans Özeti", "Raporlar", "NeviiHub AI"];

const STATUS: Record<string, string> = {
  Geldi: "bg-emerald-100 text-emerald-800",
  İşlendi: "bg-rose-100 text-rose-900",
  Telafi: "bg-amber-200 text-amber-900",
  "Planlanan telafi": "bg-[#e5fb57] text-slate-900",
};

export function PanelMock({ active, children, className = "" }: { active: string; children: ReactNode; className?: string }) {
  return (
    <div aria-hidden className={`overflow-hidden rounded-[1.25rem] bg-[#5c3d00] p-2 shadow-2xl shadow-amber-950/30 ring-1 ring-black/10 ${className}`}>
      <div className="flex items-center gap-3 px-2 pb-2 pt-1 text-xs text-white/70">
        <span className="flex gap-1.5">
          <i className="h-2.5 w-2.5 rounded-full bg-white/25" />
          <i className="h-2.5 w-2.5 rounded-full bg-white/25" />
          <i className="h-2.5 w-2.5 rounded-full bg-white/25" />
        </span>
        <span className="truncate rounded-full bg-white/10 px-3 py-1">neviihub.com/panel</span>
      </div>
      <div className="flex h-[25rem] overflow-hidden rounded-xl bg-[#f7f4ee] text-left text-slate-900">
        <div className="hidden w-40 shrink-0 flex-col gap-0.5 border-r border-amber-900/10 bg-white p-2.5 xl:flex">
          <p className="brand-mark mb-2 px-2 text-xl leading-none text-[#a56a00]">NeviiHub</p>
          {SIDEBAR.map((item) => (
            <span key={item} className={`rounded-lg px-2 py-1.5 text-[11px] font-medium ${item === active ? "bg-amber-100 text-[#5c3d00]" : "text-slate-500"}`}>
              {item}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1 overflow-hidden p-4">{children}</div>
      </div>
    </div>
  );
}

function Title({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-3">
      <p className="text-base font-semibold">{title}</p>
      <p className="text-[11px] text-slate-500">{sub}</p>
    </div>
  );
}

const LESSONS = [
  [0, 1, 2, "Piyano", "bg-amber-500 text-white"],
  [0, 4, 1, "Yoga", "bg-amber-100 text-amber-900"],
  [1, 2, 2, "Keman", "bg-[#5c3d00] text-white"],
  [1, 5, 1, "Gitar", "bg-amber-200 text-amber-900"],
  [2, 1, 1, "Bale", "bg-amber-100 text-amber-900"],
  [2, 3, 2, "İngilizce", "bg-amber-500 text-white"],
  [3, 2, 1, "Resim", "bg-amber-200 text-amber-900"],
  [3, 4, 2, "Grup dersi", "bg-[#5c3d00] text-white"],
  [4, 1, 2, "Keman", "bg-amber-100 text-amber-900"],
  [4, 4, 1, "Kulüp", "bg-amber-500 text-white"],
] as const;

export function ScreenProgram() {
  return (
    <div className="flex h-full flex-col">
      <Title title="Ders Programı" sub="Bu hafta · tüm şubeler · çakışma yok" />
      <div className="grid flex-1 grid-cols-5 grid-rows-[auto_repeat(5,minmax(0,1fr))] gap-1.5">
        {["Pzt", "Sal", "Çar", "Per", "Cum"].map((d) => (
          <span key={d} className="text-center text-[10px] font-semibold text-slate-500">{d}</span>
        ))}
        {LESSONS.map(([day, row, span, label, tone], i) => (
          <span key={i} className={`nh-sp flex items-center justify-center overflow-hidden rounded-lg px-1 text-center text-[10px] font-semibold ${tone}`} style={{ gridColumn: day + 1, gridRow: `${row + 1} / span ${span}`, ...at(i) }}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

const MONTH = ["", "Geldi", "Geldi", "", "İşlendi", "", "", "Geldi", "Telafi", "", "Geldi", "Geldi", "", "", "", "Geldi", "Planlanan telafi", "", "İşlendi", "", "", "Geldi", "Geldi", "", "Geldi", "Telafi", "", "", "", "Geldi", "", "Geldi", "İşlendi", "", ""];

export function ScreenAttendance() {
  return (
    <div className="flex h-full flex-col">
      <Title title="Yoklama Takvimi" sub="Elif K. · Piyano · tek dokunuşla işaretlenir" />
      <div className="grid flex-1 grid-cols-7 gap-1">
        {MONTH.map((s, i) => (
          <span key={i} className={`nh-sp flex items-center justify-center rounded-md text-[9px] font-semibold ${s ? STATUS[s] : "bg-white text-slate-300 ring-1 ring-amber-900/5"}`} style={at(s ? i % 12 : 0)}>
            {i + 1}
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {Object.entries(STATUS).map(([k, v]) => (
          <span key={k} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${v}`}>{k}</span>
        ))}
      </div>
    </div>
  );
}

export function ScreenMakeup() {
  const rows = [
    ["Can D.", "Keman", "12 gün kaldı", "Çar 16:00 önerildi"],
    ["Deniz A.", "Gitar", "5 gün kaldı", "Per 14:30 önerildi"],
    ["Ece Y.", "Yoga", "21 gün kaldı", "Planlandı"],
    ["Ali R.", "Resim", "9 gün kaldı", "Cum 11:00 önerildi"],
  ];
  return (
    <div>
      <Title title="Telafi Merkezi" sub="Hak, süre ve uygun saat tek listede" />
      <ul className="space-y-2">
        {rows.map(([n, l, e, s], i) => (
          <li key={n} className="nh-sx rounded-xl bg-white p-3 shadow-sm ring-1 ring-amber-900/5" style={at(i * 2)}>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold">{n} <span className="text-xs font-normal text-slate-500">{l}</span></span>
              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">{e}</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">{s}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ScreenApplications() {
  const cols: [string, string[]][] = [
    ["Yeni başvuru", ["Deneme · Gitar", "Kulüp · Koro", "Kariyer · Öğretmen"]],
    ["Görüşüldü", ["Deneme · Piyano", "Kulüp · Atölye"]],
    ["Kayıt oldu", ["Elif K.", "Can D.", "Selin B."]],
  ];
  return (
    <div>
      <Title title="Online Başvurular" sub="Deneme, kulüp ve iş başvuruları onayınızla kayda dönüşür" />
      <div className="grid grid-cols-3 gap-2">
        {cols.map(([head, items], c) => (
          <div key={head} className="rounded-xl bg-amber-900/5 p-2">
            <p className="mb-2 truncate text-[10px] font-semibold text-slate-600">{head}</p>
            <ul className="space-y-1.5">
              {items.map((t, i) => (
                <li key={t} className="nh-sp truncate rounded-lg bg-white p-2 text-[11px] font-medium shadow-sm" style={at(c * 3 + i)}>{t}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] font-semibold text-slate-500">Kurumunuza özel başvuru bağlantıları</p>
      <ul className="mt-1.5 space-y-1.5 text-[11px] text-slate-700">
        {["neviihub.com/basvuru/kurumunuz/deneme", "neviihub.com/basvuru/kurumunuz/kulup", "neviihub.com/kariyer/kurumunuz"].map((u, i) => (
          <li key={u} className="nh-sx truncate rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-amber-900/5" style={at(9 + i)}>{u}</li>
        ))}
      </ul>
    </div>
  );
}

export function ScreenFinance() {
  const bars = [[52, 38], [64, 40], [58, 44], [76, 46], [70, 42], [88, 48]];
  const months = ["Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas"];
  return (
    <div className="flex h-full flex-col">
      <Title title="Finans Özeti" sub="Yalnız yetkili kişiler görür · gelir, gider ve net sonuç" />
      <div className="flex min-h-0 flex-1 items-end gap-2 rounded-xl bg-white p-3 ring-1 ring-amber-900/5">
        {bars.map(([a, b], i) => (
          <span key={i} className="flex h-full flex-1 flex-col justify-end">
            <span className="flex h-full items-end justify-center gap-1">
              <i className="nh-sg w-1/2 rounded-t bg-gradient-to-t from-amber-600 to-amber-300" style={{ height: `${a}%`, ...at(i * 2) }} />
              <i className="nh-sg w-1/2 rounded-t bg-slate-300" style={{ height: `${b}%`, ...at(i * 2 + 1) }} />
            </span>
            <span className="mt-1 text-center text-[9px] text-slate-500">{months[i]}</span>
          </span>
        ))}
      </div>
      <ul className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[10px] font-semibold">
        {["Öğretmen Hakedişleri", "Personel Bordroları", "Kira ve giderler"].map((t, i) => (
          <li key={t} className="nh-sx truncate rounded-lg bg-white px-1 py-2 ring-1 ring-amber-900/5" style={at(10 + i)}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export function ScreenReports() {
  const rows: [string, number][] = [["Teknik", 82], ["Müzikalite", 68], ["Devam", 94], ["Ödev", 74]];
  return (
    <div>
      <Title title="Raporlar" sub="Gelişim raporu · Elif K. · dört derslik dönem" />
      <div className="mb-2 flex gap-1.5 text-[10px] font-semibold">
        <span className="rounded-full bg-amber-100 px-2 py-1 text-[#5c3d00]">Bekleyenler</span>
        <span className="rounded-full bg-white px-2 py-1 text-slate-500">Arşiv</span>
        <span className="rounded-full bg-white px-2 py-1 text-slate-500">PDF</span>
      </div>
      <ul className="space-y-2.5 rounded-xl bg-white p-3 ring-1 ring-amber-900/5">
        {rows.map(([k, v], i) => (
          <li key={k} className="text-[11px] font-medium">
            <span className="mb-1 block">{k}</span>
            <span className="block h-2 overflow-hidden rounded-full bg-amber-100">
              <i className="nh-sw block h-full origin-left rounded-full bg-amber-500" style={{ width: `${v}%`, ...at(i * 3) }} />
            </span>
          </li>
        ))}
      </ul>
      <p className="nh-sx mt-2 rounded-xl bg-white p-3 text-[11px] text-slate-600 ring-1 ring-amber-900/5" style={at(11)}>
        Öğretmen notu: Gam çalışmasında belirgin ilerleme var.
      </p>
    </div>
  );
}

export function ScreenAi() {
  return (
    <div>
      <Title title="NeviiHub AI" sub="Sizin yetkinizle çalışır, onaysız mesaj göndermez" />
      <div className="space-y-2 text-[12px]">
        <p className="nh-sx ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-[#5c3d00] px-3 py-2 text-white" style={at(0)}>Bu hafta ödemesi geciken öğrenciler kimler?</p>
        <div className="nh-sx max-w-[90%] rounded-2xl rounded-bl-sm bg-white p-3 shadow-sm ring-1 ring-amber-900/5" style={at(3)}>
          <p>Vadesi geçmiş üç öğrenci var. Veliler için hatırlatma taslağı hazırladım:</p>
          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-[11px] text-slate-700">Merhaba, kurumumuza olan taksit ödemenizin vadesi geçmiştir…</p>
        </div>
        <div className="nh-sp flex w-fit gap-1.5" style={at(7)}>
          <span className="rounded-full bg-amber-600 px-3 py-1.5 text-[11px] font-semibold text-white">Onayla ve gönder</span>
          <span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">Düzenle</span>
        </div>
      </div>
    </div>
  );
}

/** Özellik sayfalarında gösterilecek sahne: yakın ekran seçilir. */
export function screenForFeature(slug: string, group: string): { active: string; node: ReactNode } {
  const direct: Record<string, { active: string; node: ReactNode }> = {
    "ders-programi": { active: "Ders Programı", node: <ScreenProgram /> },
    "grup-dersleri": { active: "Ders Programı", node: <ScreenProgram /> },
    "coklu-sube-oda-yonetimi": { active: "Ders Programı", node: <ScreenProgram /> },
    "yoklama-takvimi": { active: "Yoklama Takvimi", node: <ScreenAttendance /> },
    "yoklama-raporu": { active: "Yoklama Takvimi", node: <ScreenAttendance /> },
    "telafi-merkezi": { active: "Telafi Merkezi", node: <ScreenMakeup /> },
    "yapay-zeka-asistani": { active: "NeviiHub AI", node: <ScreenAi /> },
    "otonom-is-akislari": { active: "NeviiHub AI", node: <ScreenAi /> },
    "duyuru-iletisim": { active: "NeviiHub AI", node: <ScreenAi /> },
  };
  if (direct[slug]) return direct[slug]!;
  if (group === "Kayıt ve başvuru") return { active: "Başvurular", node: <ScreenApplications /> };
  if (group === "Finans ve yönetim") return { active: "Finans Özeti", node: <ScreenFinance /> };
  if (group === "Rapor ve gelişim") return { active: "Raporlar", node: <ScreenReports /> };
  if (group === "Yapay zekâ ve güvenlik") return { active: "Ana Sayfa", node: <ScreenReports /> };
  return { active: "Ana Sayfa", node: <ScreenApplications /> };
}
