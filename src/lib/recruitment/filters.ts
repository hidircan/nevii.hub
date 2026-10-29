/**
 * Aday havuzu filtre/sıralama — TEK kaynak. Panel listesi, pano, yazdırma dökümü ve CSV aynı
 * fonksiyonu kullanır; böylece "ekranda 12 aday, PDF'te 14" gibi sapma olamaz.
 */
import { applicationNumber, EDUCATION_RANK, STAGES } from "./constants";
import type { ApplicationSource, ApplicationStage, EducationLevel, RecruitmentApplication, RecruitmentCategory } from "./types";

export type ApplicationSort = "newest" | "oldest" | "rating" | "experience" | "name";

export type ApplicationFilter = {
  q?: string;
  category?: RecruitmentCategory;
  /** İlan kimliği; "general" = ilansız genel başvuru. */
  jobId?: string;
  stages?: ApplicationStage[];
  instruments?: string[];
  minExperience?: number;
  minTeaching?: number;
  education?: EducationLevel;
  sources?: ApplicationSource[];
  tags?: string[];
  city?: string;
  minRating?: number;
  /** yyyy-MM-dd (dahil) */
  from?: string;
  to?: string;
  sort?: ApplicationSort;
};

const lower = (s: string) => s.toLocaleLowerCase("tr");

function toList(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.flatMap((x) => x.split(",")).map((x) => x.trim()).filter(Boolean);
}

function toNum(v: string | string[] | undefined): number | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  if (s === undefined || s === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function one(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s.trim() : undefined;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** URL arama parametrelerinden (Türkçe anahtarlar) filtre üretir. Bilinmeyen değerler sessizce atılır. */
export function parseApplicationFilter(sp: Record<string, string | string[] | undefined>): ApplicationFilter {
  const f: ApplicationFilter = {};
  const q = one(sp.q);
  if (q) f.q = q.slice(0, 200);
  const tur = one(sp.tur);
  if (tur === "teacher" || tur === "staff") f.category = tur;
  const ilan = one(sp.ilan);
  if (ilan) f.jobId = ilan;
  const stages = toList(sp.asama).filter((s): s is ApplicationStage => (STAGES as string[]).includes(s));
  if (stages.length) f.stages = stages;
  const instruments = toList(sp.enstruman);
  if (instruments.length) f.instruments = instruments;
  const minExp = toNum(sp.deneyim);
  if (minExp !== undefined && minExp >= 0) f.minExperience = minExp;
  const minTeach = toNum(sp.ogretmenlik);
  if (minTeach !== undefined && minTeach >= 0) f.minTeaching = minTeach;
  const edu = one(sp.egitim);
  if (edu && edu in EDUCATION_RANK) f.education = edu as EducationLevel;
  const sources = toList(sp.kaynak) as ApplicationSource[];
  if (sources.length) f.sources = sources;
  const tags = toList(sp.etiket);
  if (tags.length) f.tags = tags;
  const city = one(sp.sehir);
  if (city) f.city = city;
  const minRating = toNum(sp.puan);
  if (minRating !== undefined && minRating > 0) f.minRating = minRating;
  const from = one(sp.baslangic);
  if (from && DATE_RE.test(from)) f.from = from;
  const to = one(sp.bitis);
  if (to && DATE_RE.test(to)) f.to = to;
  const sort = one(sp.sirala);
  if (sort === "newest" || sort === "oldest" || sort === "rating" || sort === "experience" || sort === "name") f.sort = sort;
  return f;
}

/** Filtreyi URL'ye geri yazar (yazdırma/CSV bağlantıları aynı filtreyi taşır). */
export function applicationFilterToSearchParams(f: ApplicationFilter): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.category) p.set("tur", f.category);
  if (f.jobId) p.set("ilan", f.jobId);
  if (f.stages?.length) p.set("asama", f.stages.join(","));
  if (f.instruments?.length) p.set("enstruman", f.instruments.join(","));
  if (f.minExperience !== undefined) p.set("deneyim", String(f.minExperience));
  if (f.minTeaching !== undefined) p.set("ogretmenlik", String(f.minTeaching));
  if (f.education) p.set("egitim", f.education);
  if (f.sources?.length) p.set("kaynak", f.sources.join(","));
  if (f.tags?.length) p.set("etiket", f.tags.join(","));
  if (f.city) p.set("sehir", f.city);
  if (f.minRating !== undefined) p.set("puan", String(f.minRating));
  if (f.from) p.set("baslangic", f.from);
  if (f.to) p.set("bitis", f.to);
  if (f.sort) p.set("sirala", f.sort);
  return p;
}

export function countActiveFilters(f: ApplicationFilter): number {
  return Object.entries(f).filter(([k, v]) => k !== "sort" && v !== undefined && !(Array.isArray(v) && v.length === 0)).length;
}

function haystack(a: RecruitmentApplication): string {
  const p = a.profile ?? {};
  return lower(
    [
      a.firstName,
      a.lastName,
      a.email,
      a.phone,
      a.city,
      applicationNumber(a.seq),
      ...a.instruments,
      ...a.tags,
      p.school ?? "",
      p.department ?? "",
      p.currentPosition ?? "",
      p.currentEmployer ?? "",
      ...(p.skills ?? []),
      ...(p.languages ?? []),
    ].join(" ")
  );
}

/** Tarih karşılaştırması Europe/Istanbul günü üzerinden (başvuru gece yarısı civarı kaymasın). */
function istanbulDay(isoStr: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(isoStr)
  );
}

export function applyApplicationFilter(apps: RecruitmentApplication[], f: ApplicationFilter): RecruitmentApplication[] {
  const q = f.q ? lower(f.q).split(/\s+/).filter(Boolean) : [];
  const instruments = (f.instruments ?? []).map(lower);
  const tags = (f.tags ?? []).map(lower);
  const city = f.city ? lower(f.city) : "";
  const minEdu = f.education ? EDUCATION_RANK[f.education] : 0;

  const out = apps.filter((a) => {
    if (f.category && a.category !== f.category) return false;
    if (f.jobId) {
      if (f.jobId === "general" ? a.jobId !== null : a.jobId !== f.jobId) return false;
    }
    if (f.stages?.length && !f.stages.includes(a.stage)) return false;
    if (instruments.length) {
      const own = a.instruments.map(lower);
      if (!instruments.some((i) => own.includes(i))) return false;
    }
    if (f.minExperience !== undefined && (a.experienceYears ?? -1) < f.minExperience) return false;
    if (f.minTeaching !== undefined && (a.teachingYears ?? -1) < f.minTeaching) return false;
    if (minEdu > 0 && (EDUCATION_RANK[a.educationLevel] ?? 0) < minEdu) return false;
    if (f.sources?.length && !f.sources.includes(a.source)) return false;
    if (tags.length) {
      const own = a.tags.map(lower);
      if (!tags.every((t) => own.includes(t))) return false;
    }
    if (city && !lower(a.city).includes(city)) return false;
    if (f.minRating !== undefined && (a.ratingAvg ?? 0) < f.minRating) return false;
    if (f.from || f.to) {
      const day = istanbulDay(a.createdAt);
      if (f.from && day < f.from) return false;
      if (f.to && day > f.to) return false;
    }
    if (q.length) {
      const h = haystack(a);
      if (!q.every((term) => h.includes(term))) return false;
    }
    return true;
  });

  const sort = f.sort ?? "newest";
  const byName = (a: RecruitmentApplication, b: RecruitmentApplication) =>
    `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, "tr");
  out.sort((a, b) => {
    switch (sort) {
      case "oldest":
        return a.createdAt.localeCompare(b.createdAt);
      case "rating":
        return (b.ratingAvg ?? -1) - (a.ratingAvg ?? -1) || b.createdAt.localeCompare(a.createdAt);
      case "experience":
        return (b.experienceYears ?? -1) - (a.experienceYears ?? -1) || b.createdAt.localeCompare(a.createdAt);
      case "name":
        return byName(a, b);
      default:
        return b.createdAt.localeCompare(a.createdAt);
    }
  });
  return out;
}
