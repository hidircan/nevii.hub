/**
 * İK modülü — etiket/katalog tek kaynağı. UI, yazdırma, CSV ve e-posta aynı etiketleri okur.
 */
import type {
  ApplicationSource,
  ApplicationStage,
  EducationLevel,
  EmploymentType,
  InterviewKind,
  InterviewStatus,
  JobStatus,
  Recommendation,
  RecruitmentCategory,
  ScorecardCriterion,
} from "./types";

export const STAGES: ApplicationStage[] = [
  "new",
  "screening",
  "interview",
  "demo_lesson",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
  "talent_pool",
];

/** Aday hunisinin ilerleyen (aktif) aşamaları — pano sütunları bu sırayla. */
export const PIPELINE_STAGES: ApplicationStage[] = ["new", "screening", "interview", "demo_lesson", "offer", "hired"];
/** Süreç dışı / sonuçlanmış aşamalar. */
export const CLOSED_STAGES: ApplicationStage[] = ["hired", "rejected", "withdrawn"];

export const STAGE_LABELS: Record<ApplicationStage, string> = {
  new: "Yeni",
  screening: "Ön eleme",
  interview: "Görüşme",
  demo_lesson: "Deneme dersi",
  offer: "Teklif",
  hired: "İşe alındı",
  rejected: "Olumsuz",
  withdrawn: "Aday çekildi",
  talent_pool: "Yetenek havuzu",
};

/** Rozet renkleri (Tailwind sınıfları — açık/koyu tema token'ları globals.css'te). */
export const STAGE_TONES: Record<ApplicationStage, string> = {
  new: "bg-sky-100 text-sky-800",
  screening: "bg-indigo-100 text-indigo-800",
  interview: "bg-violet-100 text-violet-800",
  demo_lesson: "bg-amber-100 text-amber-800",
  offer: "bg-teal-100 text-teal-800",
  hired: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  withdrawn: "bg-slate-200 text-slate-700",
  talent_pool: "bg-fuchsia-100 text-fuchsia-800",
};

export const CATEGORY_LABELS: Record<RecruitmentCategory, string> = {
  teacher: "Öğretmen",
  staff: "Personel",
};

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: "Taslak",
  published: "Yayında",
  closed: "Kapandı",
  archived: "Arşiv",
};

export const EMPLOYMENT_LABELS: Record<EmploymentType, string> = {
  full_time: "Tam zamanlı",
  part_time: "Yarı zamanlı",
  freelance: "Serbest / ders başı",
  intern: "Stajyer",
};

export const EDUCATION_LABELS: Record<EducationLevel, string> = {
  "": "Belirtilmedi",
  high_school: "Lise",
  conservatory_hs: "Konservatuvar / Güzel Sanatlar Lisesi",
  associate: "Ön lisans",
  bachelor: "Lisans",
  master: "Yüksek lisans",
  doctorate: "Doktora / Sanatta yeterlik",
};

/** Filtrede "en az" karşılaştırması için sıra. */
export const EDUCATION_RANK: Record<EducationLevel, number> = {
  "": 0,
  high_school: 1,
  conservatory_hs: 2,
  associate: 3,
  bachelor: 4,
  master: 5,
  doctorate: 6,
};

export const SOURCE_LABELS: Record<ApplicationSource, string> = {
  linkedin: "LinkedIn",
  kariyer_net: "Kariyer.net",
  website: "Web sitesi",
  instagram: "Instagram",
  referral: "Tavsiye",
  other: "Diğer",
};

export const INTERVIEW_KIND_LABELS: Record<InterviewKind, string> = {
  interview: "Yüz yüze görüşme",
  demo_lesson: "Deneme dersi",
  phone: "Telefon görüşmesi",
  online: "Online görüşme",
};

export const INTERVIEW_STATUS_LABELS: Record<InterviewStatus, string> = {
  planned: "Planlandı",
  completed: "Tamamlandı",
  cancelled: "İptal",
  no_show: "Gelmedi",
};

export const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  strong_yes: "Kesinlikle alınmalı",
  yes: "Alınabilir",
  neutral: "Kararsız",
  no: "Uygun değil",
  strong_no: "Kesinlikle uygun değil",
};

export const DEFAULT_TEACHER_CRITERIA: ScorecardCriterion[] = [
  { key: "musicianship", label: "Müzisyenlik / çalım-teknik" },
  { key: "pedagogy", label: "Pedagoji ve anlatım" },
  { key: "communication", label: "İletişim" },
  { key: "demo_lesson", label: "Deneme dersi performansı" },
  { key: "culture_fit", label: "Kurum kültürüne uyum" },
];

/** Kaynak tespiti: `?kaynak=` / `utm_source` → kanonik kaynak. */
export function normalizeSource(raw: string | null | undefined): ApplicationSource {
  const v = (raw ?? "").toLowerCase().replace(/[\s.-]/g, "");
  if (!v) return "website";
  if (v.includes("linkedin")) return "linkedin";
  if (v.includes("kariyer")) return "kariyer_net";
  if (v.includes("insta")) return "instagram";
  if (v.includes("ref") || v.includes("tavsiye")) return "referral";
  if (v.includes("web") || v.includes("site")) return "website";
  return "other";
}

export const CV_MAX_BYTES = 4 * 1024 * 1024;
export const CV_ALLOWED_MIME: Record<string, "pdf" | "docx"> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export function applicationNumber(seq: number): string {
  return `IK-${String(seq).padStart(6, "0")}`;
}

export function fullName(a: { firstName: string; lastName: string }): string {
  return `${a.firstName} ${a.lastName}`.trim();
}

export function defaultKvkkText(institutionName: string): string {
  return (
    `${institutionName} olarak, iş başvurunuz kapsamında paylaştığınız kimlik, iletişim, eğitim ve mesleki deneyim ` +
    `bilgileriniz ile özgeçmişinizi 6698 sayılı KVKK uyarınca yalnızca işe alım süreçlerinin yürütülmesi, sizinle ` +
    `iletişime geçilmesi ve uygun pozisyonlarda değerlendirilmeniz amacıyla işliyoruz. Verileriniz bu amaç dışında ` +
    `kullanılmaz ve belirlenen saklama süresi sonunda silinir veya anonim hale getirilir. ` +
    `Başvuru formunda "yapay zekâ ile oku" seçeneğini AYRICA işaretlerseniz, formu doldurmak amacıyla CV metniniz ` +
    `yurt dışında bulunabilen bir yapay zekâ hizmet sağlayıcısına iletilir; bu seçenek isteğe bağlıdır ve işaretlemezseniz ` +
    `CV'niz yalnızca kendi sistemimizde okunur. KVKK'nın 11. maddesindeki haklarınız için kurumumuza başvurabilirsiniz.`
  );
}
