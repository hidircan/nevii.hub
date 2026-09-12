import { z } from "zod";
import {
  DEFAULT_FONT_CHOICE,
  DEFAULT_THEME_PROFILE,
  FONT_VALUES,
  THEME_PROFILE_VALUES,
  type FontChoice,
  type ThemeProfile,
} from "../theme";

/**
 * NeviiOS kurum politikaları — saf, yan etkisiz doğrulama/çözümleme.
 * Değerler `SettingOverride` üzerinden (platform → paket → kurum → şube)
 * saklanır; burada yalnız şema ve uygulama kuralları vardır.
 */

// ───────────────────────── Appearance ─────────────────────────

export const APPEARANCE_MODES = ["light_and_dark", "light_only", "dark_only"] as const;
export type AppearanceMode = (typeof APPEARANCE_MODES)[number];

/** Sistemdeki tek gerçek koyu profil (bkz. src/lib/theme.ts). */
export const DARK_THEME_PROFILES: readonly ThemeProfile[] = ["obsidian"];

export type AppearancePolicy = {
  mode: AppearanceMode;
  fixedTheme: ThemeProfile | "none";
  fontPolicy: FontChoice | "user_choice";
};

export const DEFAULT_APPEARANCE_POLICY: AppearancePolicy = {
  mode: "light_and_dark",
  fixedTheme: "none",
  fontPolicy: "user_choice",
};

export function isDarkProfile(p: ThemeProfile): boolean {
  return DARK_THEME_PROFILES.includes(p);
}

export function normalizeAppearancePolicy(raw: Partial<Record<keyof AppearancePolicy, unknown>>): AppearancePolicy {
  const mode = (APPEARANCE_MODES as readonly string[]).includes(String(raw.mode))
    ? (raw.mode as AppearanceMode)
    : DEFAULT_APPEARANCE_POLICY.mode;
  const fixedTheme = (THEME_PROFILE_VALUES as readonly string[]).includes(String(raw.fixedTheme))
    ? (raw.fixedTheme as ThemeProfile)
    : "none";
  const fontPolicy = (FONT_VALUES as readonly string[]).includes(String(raw.fontPolicy))
    ? (raw.fontPolicy as FontChoice)
    : "user_choice";
  return { mode, fixedTheme, fontPolicy };
}

/** Sabit tema, görünüm moduyla çelişemez (light_only + obsidian gibi). */
export function appearancePolicyConflict(p: AppearancePolicy): string | null {
  if (p.fixedTheme === "none") return null;
  const dark = isDarkProfile(p.fixedTheme);
  if (p.mode === "light_only" && dark) return "Yalnız açık modda koyu sabit tema seçilemez.";
  if (p.mode === "dark_only" && !dark) return "Yalnız koyu modda açık sabit tema seçilemez.";
  return null;
}

/** Kullanıcının kişisel seçimini kurum politikasına göre efektif değere indirger. */
export function applyAppearancePolicy(
  policy: AppearancePolicy,
  requested: { profile: ThemeProfile; font: FontChoice }
): { profile: ThemeProfile; font: FontChoice; profileLocked: boolean; fontLocked: boolean } {
  let profile = requested.profile;
  let profileLocked = false;
  if (policy.fixedTheme !== "none") {
    profile = policy.fixedTheme;
    profileLocked = true;
  } else if (policy.mode === "dark_only") {
    profile = DARK_THEME_PROFILES[0]!;
    profileLocked = true;
  } else if (policy.mode === "light_only" && isDarkProfile(profile)) {
    profile = DEFAULT_THEME_PROFILE;
  }
  const fontLocked = policy.fontPolicy !== "user_choice";
  const font = fontLocked ? (policy.fontPolicy as FontChoice) : requested.font ?? DEFAULT_FONT_CHOICE;
  return { profile, font, profileLocked, fontLocked };
}

export function isProfileAllowed(policy: AppearancePolicy, profile: ThemeProfile): boolean {
  return applyAppearancePolicy(policy, { profile, font: DEFAULT_FONT_CHOICE }).profile === profile;
}

// ───────────────────── Yeni Öğrenci Kaydı formu ─────────────────────

/** studentSchema'da zorunlu olan, kurumca gizlenemeyen/opsiyonel yapılamayan alanlar. */
export const STUDENT_FORM_CORE_FIELDS = [
  "name",
  "phone",
  "parentName",
  "parentPhone",
  "branchId",
  "instrument",
  "teacherId",
  "packageName",
  "weeklyLessonCount",
  "monthlyFee",
] as const;

/** Kurumun görünürlük/zorunluluk ayarlayabildiği opsiyonel alanlar. */
export const STUDENT_FORM_CONFIGURABLE_FIELDS = {
  email: "E-posta",
  motherName: "Anne adı",
  fatherName: "Baba adı",
  birthDate: "Doğum tarihi",
  birthPlace: "Doğum yeri",
  schoolOrOccupation: "Okul / meslek",
  address: "Adres",
  level: "Seviye",
  targetExam: "Hedef sınav",
  enrollmentStartDate: "Kayıt başlangıcı",
  enrollmentEndDate: "Kayıt bitişi",
  termType: "Dönem",
  notes: "Notlar",
  specialNotes: "Özel notlar",
} as const;
export type StudentFormFieldKey = keyof typeof STUDENT_FORM_CONFIGURABLE_FIELDS;
const CONFIGURABLE_KEYS = Object.keys(STUDENT_FORM_CONFIGURABLE_FIELDS) as [StudentFormFieldKey, ...StudentFormFieldKey[]];

export const FORM_EDITOR_ROLES = ["SUPER_ADMIN", "SCHOOL_ADMIN", "AI_AGENT"] as const;

const formFieldSchema = z
  .object({
    key: z.enum(CONFIGURABLE_KEYS),
    visible: z.boolean(),
    required: z.boolean(),
    order: z.number().int().min(0).max(999),
    defaultValue: z.string().max(200).optional(),
    helpText: z.string().max(300).optional(),
    visibleWhen: z
      .object({ field: z.string().min(1), equals: z.string().max(100) })
      .optional(),
    editableBy: z.array(z.enum(FORM_EDITOR_ROLES)).min(1).optional(),
  })
  .refine((f) => !(f.required && !f.visible), { message: "Gizli alan zorunlu olamaz." });

export const studentFormConfigSchema = z
  .object({ fields: z.array(formFieldSchema).max(40) })
  .superRefine((cfg, ctx) => {
    const seen = new Set<string>();
    for (const f of cfg.fields) {
      if (seen.has(f.key)) ctx.addIssue({ code: "custom", message: `Alan tekrar ediyor: ${f.key}` });
      seen.add(f.key);
      if (f.visibleWhen) {
        const target = f.visibleWhen.field;
        if (target === f.key) ctx.addIssue({ code: "custom", message: `${f.key} kendine koşul veremez.` });
        const known =
          (STUDENT_FORM_CORE_FIELDS as readonly string[]).includes(target) || target in STUDENT_FORM_CONFIGURABLE_FIELDS;
        if (!known) ctx.addIssue({ code: "custom", message: `Bilinmeyen koşul alanı: ${target}` });
      }
    }
  });
export type StudentFormConfig = z.infer<typeof studentFormConfigSchema>;
export type StudentFormField = StudentFormConfig["fields"][number];

export const DEFAULT_STUDENT_FORM_CONFIG: StudentFormConfig = { fields: [] };

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

function conditionMet(field: StudentFormField, input: Record<string, unknown>): boolean {
  if (!field.visibleWhen) return true;
  return String(input[field.visibleWhen.field] ?? "") === field.visibleWhen.equals;
}

/**
 * Sunucu tarafı uygulama: görünür + koşulu sağlanan zorunlu alan boşsa hata;
 * rolün düzenleyemediği alan doluysa hata; gizli alanın değeri yok sayılır
 * (istemci manipülasyonu ile yazılamaz). Varsayılan değer boş alana uygulanır.
 */
export function applyStudentFormConfig(
  config: StudentFormConfig,
  input: Record<string, unknown>,
  role: string
): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  const out = { ...input };
  for (const field of config.fields) {
    const label = STUDENT_FORM_CONFIGURABLE_FIELDS[field.key];
    const shown = field.visible && conditionMet(field, out);
    if (!shown) {
      delete out[field.key];
      continue;
    }
    const hasValue = !isEmpty(out[field.key]);
    if (hasValue && field.editableBy && !field.editableBy.includes(role as (typeof FORM_EDITOR_ROLES)[number])) {
      return { ok: false, message: `"${label}" alanını bu rol düzenleyemez.` };
    }
    if (!hasValue && field.defaultValue) out[field.key] = field.defaultValue;
    if (field.required && isEmpty(out[field.key])) {
      return { ok: false, message: `"${label}" alanı bu kurumda zorunludur.` };
    }
  }
  return { ok: true, value: out };
}

// ───────────────── Dönem / finans / sözleşme (snapshot-safe) ─────────────────

export const termPolicySchema = z.object({
  terms: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z0-9_-]{2,32}$/),
        label: z.string().min(2).max(60),
        startMonthDay: z.string().regex(/^\d{2}-\d{2}$/),
        endMonthDay: z.string().regex(/^\d{2}-\d{2}$/),
      })
    )
    .max(12),
});

export const financePolicySchema = z.object({
  billingModel: z.enum(["monthly", "term", "package", "per_lesson", "membership"]),
  firstChargeRule: z.enum(["on_enrollment", "after_first_lesson", "after_three_lessons"]),
  depositAmount: z.number().min(0).max(1_000_000),
  lateFeePercent: z.number().min(0).max(100),
  refundPolicy: z.enum(["none", "prorated", "full_before_start"]),
  cancelNoticeDays: z.number().int().min(0).max(90),
});

export const contractPolicySchema = z.object({
  numberingPrefix: z.string().regex(/^[A-Z0-9-]{1,12}$/),
  requiresApproval: z.boolean(),
  extraClauses: z.array(z.string().min(1).max(500)).max(20),
});

export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

// ───────────────────── İletişim / davet şablonu ─────────────────────

export const TEMPLATE_VARIABLES = ["kurumAdi", "adSoyad", "davetLinki", "sonGecerlilik", "rol"] as const;

export const messageTemplateSchema = z
  .object({ subject: z.string().min(3).max(150), body: z.string().min(10).max(4000) })
  .superRefine((t, ctx) => {
    for (const m of `${t.subject} ${t.body}`.matchAll(/\{\{\s*([a-zA-Z]+)\s*\}\}/g)) {
      if (!(TEMPLATE_VARIABLES as readonly string[]).includes(m[1]!)) {
        ctx.addIssue({ code: "custom", message: `Bilinmeyen şablon değişkeni: {{${m[1]}}}` });
      }
    }
  });
export type MessageTemplate = z.infer<typeof messageTemplateSchema>;

export const DEFAULT_INVITE_TEMPLATE: MessageTemplate = {
  subject: "{{kurumAdi}} — NeviiHub davetiniz",
  body: "Merhaba {{adSoyad}},\n\n{{kurumAdi}} sizi NeviiHub'a {{rol}} olarak davet etti.\nDaveti kabul etmek için: {{davetLinki}}\nBağlantı {{sonGecerlilik}} tarihine kadar geçerlidir.",
};

export const quietHoursSchema = z.object({
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Şablonu yalnız izinli değişkenlerle doldurur. Değişken değerleri HTML
 * kaçışlıdır (XSS); bilinmeyen değişken boş kalır. Gönderim YAPMAZ.
 */
export function renderMessageTemplate(
  template: MessageTemplate,
  vars: Partial<Record<(typeof TEMPLATE_VARIABLES)[number], string>>
): { subject: string; body: string; html: string } {
  const fill = (text: string, escape: boolean) =>
    text.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (_, name: string) => {
      const v = (vars as Record<string, string | undefined>)[name] ?? "";
      return escape ? escapeHtml(v) : v;
    });
  return {
    subject: fill(template.subject, false),
    body: fill(template.body, false),
    html: fill(escapeHtml(template.body), true).replace(/\n/g, "<br>"),
  };
}
