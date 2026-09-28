/**
 * CV okuma — owner kararı "hibrit": kural tabanlı çıkarım HER ZAMAN çalışır (maliyetsiz, test ortamında da);
 * `AI_PROVIDER` gerçek bir sağlayıcıya çözülüyorsa metin AI'a da gönderilir ve geçerli alanlar kural sonucunun
 * üzerine yazılır. AI hatası/zaman aşımı sessizce kural sonucuna düşer (aday formu hiçbir zaman bloklanmaz).
 * Çıktı yalnız formu ÖN DOLDURUR — aday her alanı gönderimden önce görür ve düzeltebilir.
 */
import { CV_ALLOWED_MIME } from "./constants";
import type { EducationLevel } from "./types";

export type ParsedCv = {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  city?: string;
  birthYear?: number;
  instruments?: string[];
  experienceYears?: number;
  teachingYears?: number;
  educationLevel?: EducationLevel;
  school?: string;
  department?: string;
  graduationYear?: number;
  currentPosition?: string;
  languages?: string[];
  skills?: string[];
  linkedinUrl?: string;
  portfolioUrl?: string;
};

export type CvParseResult = {
  method: "rules" | "ai";
  fields: ParsedCv;
  /** Doldurulabilen alan adları (UI "CV'den dolduruldu" rozeti için). */
  filled: string[];
  textLength: number;
};

/* ───────────── Dosya doğrulama + metin çıkarma ───────────── */

export function detectCvKind(buf: Buffer, mimeType: string, fileName: string): "pdf" | "docx" | null {
  const byMime = CV_ALLOWED_MIME[mimeType];
  const lowerName = fileName.toLowerCase();
  const byExt = lowerName.endsWith(".pdf") ? "pdf" : lowerName.endsWith(".docx") ? "docx" : null;
  const kind = byMime ?? byExt;
  if (!kind) return null;
  // Sihirli bayt: uzantı/MIME taklidine karşı içerik doğrulaması.
  if (kind === "pdf" && buf.subarray(0, 5).toString("latin1") !== "%PDF-") return null;
  if (kind === "docx" && !(buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04)) return null;
  return kind;
}

export async function extractCvText(buf: Buffer, kind: "pdf" | "docx"): Promise<string> {
  if (kind === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join("\n") : text;
  }
  const mammoth = await import("mammoth");
  const res = await mammoth.extractRawText({ buffer: buf });
  return res.value;
}

/* ───────────── Kural tabanlı çıkarım ───────────── */

/** Kanonik ad → eş anlamlılar (küçük harf, tr). Tenant kataloğundaki adlar ayrıca birebir aranır. */
const INSTRUMENT_SYNONYMS: Record<string, string[]> = {
  Piyano: ["piyano", "piano", "klavye", "keyboard"],
  Keman: ["keman", "violin"],
  Viyola: ["viyola", "viola"],
  Çello: ["çello", "cello", "viyolonsel", "violoncello"],
  Kontrbas: ["kontrbas", "double bass", "contrabass"],
  Gitar: ["gitar", "guitar", "klasik gitar", "elektro gitar", "akustik gitar"],
  "Bas Gitar": ["bas gitar", "bass guitar"],
  Bateri: ["bateri", "davul", "drums", "drum"],
  Şan: ["şan", "vokal", "vocal", "voice", "opera", "şarkıcılık"],
  Flüt: ["flüt", "flute", "yan flüt"],
  Klarnet: ["klarnet", "clarinet"],
  Saksafon: ["saksafon", "saxophone", "saxofon"],
  Trompet: ["trompet", "trumpet"],
  Akordeon: ["akordeon", "accordion"],
  Arp: ["arp", "harp"],
  Bağlama: ["bağlama", "saz", "baglama"],
  Ud: ["ud", "oud"],
  Kanun: ["kanun", "qanun"],
  Ney: ["ney"],
  Ukulele: ["ukulele"],
  Solfej: ["solfej", "solfeggio", "müzik teorisi", "armoni"],
  Koro: ["koro", "choir"],
};

const TR_CITIES = [
  "İstanbul", "Ankara", "İzmir", "Bursa", "Antalya", "Adana", "Konya", "Gaziantep", "Kocaeli", "Mersin", "Eskişehir",
  "Kayseri", "Samsun", "Denizli", "Sakarya", "Trabzon", "Muğla", "Tekirdağ", "Aydın", "Balıkesir", "Manisa", "Hatay",
  "Malatya", "Erzurum", "Diyarbakır", "Şanlıurfa", "Van", "Edirne", "Çanakkale", "Bolu", "Isparta", "Sivas", "Ordu",
];

const LANGUAGES: Record<string, string[]> = {
  İngilizce: ["ingilizce", "english"],
  Almanca: ["almanca", "german", "deutsch"],
  Fransızca: ["fransızca", "french"],
  İtalyanca: ["italyanca", "italian"],
  İspanyolca: ["ispanyolca", "spanish"],
  Rusça: ["rusça", "russian"],
  Arapça: ["arapça", "arabic"],
  Japonca: ["japonca", "japanese"],
};

const lower = (s: string) => s.toLocaleLowerCase("tr");

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Kelime sınırlı arama (Türkçe harfleri kelime karakteri say). */
function hasWord(text: string, word: string): boolean {
  const re = new RegExp(`(^|[^a-zçğıöşüâîû0-9])${escapeRe(word)}($|[^a-zçğıöşüâîû0-9])`, "i");
  return re.test(text);
}

const CURRENT_WORDS = "(?:günümüz|halen|devam|hâlâ|present|current|now|şimdi)";
const RANGE_RE = new RegExp(
  `((?:0?[1-9]|1[0-2])[./])?((?:19|20)\\d{2})\\s*(?:-|–|—|to|ile|\\/)\\s*(?:((?:0?[1-9]|1[0-2])[./])?((?:19|20)\\d{2})|${CURRENT_WORDS})`,
  "gi"
);

type Span = [number, number];

function spansFrom(text: string, nowYear: number): Span[] {
  const spans: Span[] = [];
  RANGE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RANGE_RE.exec(text))) {
    const start = Number(m[2]);
    const end = m[4] ? Number(m[4]) : nowYear;
    if (start >= 1960 && end >= start && end <= nowYear + 1 && end - start <= 45) spans.push([start, end]);
  }
  return spans;
}

function mergedYears(spans: Span[]): number {
  if (spans.length === 0) return 0;
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [cs, ce] = sorted[0]!;
  for (const [s, e] of sorted.slice(1)) {
    if (s <= ce) ce = Math.max(ce, e);
    else {
      total += ce - cs;
      [cs, ce] = [s, e];
    }
  }
  total += ce - cs;
  return total;
}

function explicitYears(text: string): number | undefined {
  const re = /(\d{1,2})\s*\+?\s*(?:yıl|yil|sene|years?|yrs?)(?:\s*(?:lık|lik|luk|lük|dır|dir|dur|dür|of|over))?\s*(?:[a-zçğıöşü]+\s*){0,3}(?:deneyim|tecrübe|experience|öğretmenlik|eğitmenlik|teaching)/gi;
  let best: number | undefined;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = Number(m[1]);
    if (n > 0 && n <= 50) best = Math.max(best ?? 0, n);
  }
  return best;
}

function detectEducation(t: string): EducationLevel | undefined {
  if (/doktora|ph\.?\s?d|sanatta yeterlik|doctorate/i.test(t)) return "doctorate";
  if (/yüksek\s*lisans|master|m\.?\s?a\.?\b|m\.?\s?sc|mmus|m\.?mus/i.test(t)) return "master";
  if (/\blisans\b|bachelor|b\.?\s?a\.?\b|b\.?\s?sc|üniversite|university|fakülte|faculty|konservatuvar[ıi]?\s*(?:müzik|mezun)|devlet konservatuvar/i.test(t)) return "bachelor";
  if (/ön\s*lisans|associate|meslek yüksekokulu|myo\b/i.test(t)) return "associate";
  if (/güzel sanatlar lisesi|konservatuvar lise|müzik lisesi/i.test(t)) return "conservatory_hs";
  if (/\blise\b|high school/i.test(t)) return "high_school";
  return undefined;
}

const NAME_STOP = /(özgeçmiş|curriculum|vitae|resume|cv\b|kişisel|bilgiler|iletişim|contact|profil|profile|adres|telefon|e-?posta|email|@|http|www\.|\d)/i;

function detectName(lines: string[]): { firstName: string; lastName: string } | undefined {
  // "Ad Soyad: ..." etiketi öncelikli.
  for (const l of lines.slice(0, 40)) {
    const m = l.match(/^(?:ad[ıi]?\s*soyad[ıi]?|isim|name|full name)\s*[:：-]\s*(.+)$/i);
    if (m) return splitName(m[1]!);
  }
  for (const l of lines.slice(0, 8)) {
    const clean = l.replace(/\s+/g, " ").trim();
    if (!clean || NAME_STOP.test(clean) || clean.length > 48) continue;
    const words = clean.split(" ");
    if (words.length < 2 || words.length > 4) continue;
    if (!words.every((w) => /^[A-Za-zÇĞİÖŞÜçğıöşüÂÎÛâîû'.-]+$/.test(w))) continue;
    return splitName(clean);
  }
  return undefined;
}

function titleCaseTr(w: string): string {
  const l = lower(w);
  return l.charAt(0).toLocaleUpperCase("tr") + l.slice(1);
}

function splitName(raw: string): { firstName: string; lastName: string } | undefined {
  const words = raw.replace(/\s+/g, " ").trim().split(" ").filter(Boolean).slice(0, 4);
  if (words.length < 2) return undefined;
  const norm = words.map((w) => (w === w.toLocaleUpperCase("tr") ? titleCaseTr(w) : w));
  return { firstName: norm.slice(0, -1).join(" "), lastName: norm[norm.length - 1]! };
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? digits : digits.replace(/^0090/, "+90");
}

export function parseCvText(text: string, opts?: { knownInstruments?: string[]; now?: Date }): ParsedCv {
  const nowYear = (opts?.now ?? new Date()).getFullYear();
  const t = text.replace(/ /g, " ");
  const lt = lower(t);
  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: ParsedCv = {};

  const email = t.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  if (email) out.email = email[0].toLowerCase();

  const phone = t.match(/(?:\+?90[\s.-]?)?\(?0?5\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}/) ?? t.match(/\+\d{1,3}[\s.-]?\d{2,4}[\s.-]?\d{3}[\s.-]?\d{2,4}/);
  if (phone) out.phone = normalizePhone(phone[0]);

  const name = detectName(lines);
  if (name) Object.assign(out, name);

  const instruments = new Set<string>();
  for (const [canon, syns] of Object.entries(INSTRUMENT_SYNONYMS)) {
    if (syns.some((s) => hasWord(lt, s))) instruments.add(canon);
  }
  for (const known of opts?.knownInstruments ?? []) {
    if (hasWord(lt, lower(known))) {
      // Katalogdaki yazımı tercih et (kanonik eş anlamlı eklendiyse onu değiştir).
      const canon = Object.keys(INSTRUMENT_SYNONYMS).find((c) => lower(c) === lower(known));
      if (canon) instruments.delete(canon);
      instruments.add(known);
    }
  }
  if (instruments.size) out.instruments = [...instruments];

  const city = TR_CITIES.find((c) => hasWord(lt, lower(c)));
  if (city) out.city = city;

  const birth = t.match(/doğum(?:\s*tarihi)?\s*[:：]?\s*(?:\d{1,2}[./-]\d{1,2}[./-])?((?:19|20)\d{2})/i) ?? t.match(/(?:date of birth|born)\s*[:：]?\s*.*?((?:19|20)\d{2})/i);
  if (birth) {
    const y = Number(birth[1]);
    if (y > 1940 && y <= nowYear - 15) out.birthYear = y;
  }

  const explicit = explicitYears(t);
  const allSpans = spansFrom(t, nowYear);
  const expFromSpans = mergedYears(allSpans);
  const exp = explicit ?? (expFromSpans > 0 ? expFromSpans : undefined);
  if (exp !== undefined) out.experienceYears = Math.min(exp, 50);

  const teachLines = lines.filter((l) => /öğretmen|eğitmen|teacher|instructor|tutor|akademisyen|öğretim görevlisi|ders veri/i.test(l));
  // Tarih aralığı çoğu CV'de başlığın hemen yanında/altında — pozisyon satırı + sonraki satır.
  const teachContext = lines
    .map((l, i) => (teachLines.includes(l) ? `${l} ${lines[i + 1] ?? ""}` : ""))
    .filter(Boolean)
    .join("\n");
  const teachYears = mergedYears(spansFrom(teachContext, nowYear));
  const explicitTeach = (() => {
    const m = t.match(/(\d{1,2})\s*\+?\s*(?:yıl|yil|years?)(?:lık|lik)?\s*(?:öğretmenlik|eğitmenlik|teaching)/i);
    return m ? Number(m[1]) : undefined;
  })();
  const teach = explicitTeach ?? (teachYears > 0 ? teachYears : undefined);
  if (teach !== undefined) out.teachingYears = Math.min(teach, 50);

  const edu = detectEducation(lt);
  if (edu) out.educationLevel = edu;

  // Öncelik: üniversite > konservatuvar > akademi. "… Öğretmeni — X Müzik Akademisi" gibi İŞ satırları okul sayılmaz.
  const isJobLine = (l: string) => /öğretmen|eğitmen|teacher|instructor|sanatçı|korrepetitör|müdür|koordinatör/i.test(l);
  const schoolLine =
    lines.find((l) => /üniversitesi|university/i.test(l) && l.length < 140 && !isJobLine(l)) ??
    lines.find((l) => /konservatuvar|conservatory|güzel sanatlar/i.test(l) && l.length < 140 && !isJobLine(l)) ??
    lines.find((l) => /akademi|academy/i.test(l) && l.length < 140 && !isJobLine(l));
  if (schoolLine) {
    out.school = schoolLine.replace(/\s+/g, " ").replace(/^[•\-–*·\s]+/, "").slice(0, 120);
    const gy = schoolLine.match(/((?:19|20)\d{2})(?!.*(?:19|20)\d{2})/);
    if (gy) {
      const y = Number(gy[1]);
      if (y <= nowYear + 6) out.graduationYear = y;
    }
  }
  const deptLine = lines.find((l) => /bölümü|anasanat dalı|department of|bölüm\s*[:：]/i.test(l) && l.length < 120);
  if (deptLine) out.department = deptLine.replace(/^(bölüm|department)\s*[:：]\s*/i, "").replace(/\s+/g, " ").slice(0, 100);

  const langs = Object.entries(LANGUAGES)
    .filter(([, syns]) => syns.some((s) => hasWord(lt, s)))
    .map(([k]) => k);
  if (langs.length) out.languages = langs;

  const linkedin = t.match(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9_\-%.]+/i);
  if (linkedin) out.linkedinUrl = linkedin[0].startsWith("http") ? linkedin[0] : `https://${linkedin[0]}`;
  const portfolio = t.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be|soundcloud\.com|vimeo\.com)\/[^\s)]+/i);
  if (portfolio) out.portfolioUrl = portfolio[0].startsWith("http") ? portfolio[0] : `https://${portfolio[0]}`;

  const pos = lines.find((l) => /^(?:ünvan|unvan|pozisyon|title|position)\s*[:：]/i.test(l));
  if (pos) out.currentPosition = pos.replace(/^[^:：]+[:：]\s*/, "").slice(0, 100);

  return out;
}

/* ───────────── AI zenginleştirme (opsiyonel) ───────────── */

const EDU_VALUES: EducationLevel[] = ["high_school", "conservatory_hs", "associate", "bachelor", "master", "doctorate"];

function sanitizeAi(raw: unknown, nowYear: number): ParsedCv {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, max = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
  const int = (v: unknown, min: number, max: number) => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : undefined;
  };
  const list = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim().slice(0, 60)).slice(0, 12) : undefined;
  const out: ParsedCv = {
    firstName: str(r.firstName, 60),
    lastName: str(r.lastName, 60),
    email: typeof r.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email) ? r.email.toLowerCase() : undefined,
    phone: str(r.phone, 30),
    city: str(r.city, 60),
    birthYear: int(r.birthYear, 1940, nowYear - 15),
    instruments: list(r.instruments),
    experienceYears: int(r.experienceYears, 0, 50),
    teachingYears: int(r.teachingYears, 0, 50),
    educationLevel: EDU_VALUES.includes(r.educationLevel as EducationLevel) ? (r.educationLevel as EducationLevel) : undefined,
    school: str(r.school),
    department: str(r.department, 100),
    graduationYear: int(r.graduationYear, 1950, nowYear + 6),
    currentPosition: str(r.currentPosition, 100),
    languages: list(r.languages),
    skills: list(r.skills),
  };
  for (const k of Object.keys(out) as (keyof ParsedCv)[]) if (out[k] === undefined) delete out[k];
  return out;
}

const AI_PROMPT = `Aşağıdaki özgeçmiş metninden bilgileri çıkar ve SADECE geçerli JSON döndür (açıklama yok).
Alanlar: firstName, lastName, email, phone, city, birthYear (sayı), instruments (çalınan/öğretilen enstrümanlar, Türkçe adlarıyla, dizi),
experienceYears (toplam iş deneyimi yıl, sayı), teachingYears (öğretmenlik/eğitmenlik deneyimi yıl, sayı),
educationLevel (high_school | conservatory_hs | associate | bachelor | master | doctorate), school, department, graduationYear,
currentPosition, languages (dizi, Türkçe), skills (en fazla 8 kısa beceri, dizi).
Bilinmeyen alanı hiç yazma. Uydurma.`;

async function callAi(text: string): Promise<unknown | null> {
  const { getProviderConfig } = await import("../ai/config");
  const cfg = getProviderConfig();
  if (cfg.name === "heuristic" || !cfg.apiKey) return null;
  const clipped = text.slice(0, 12000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(cfg.timeoutMs, 20_000));
  try {
    if (cfg.name === "gemini") {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`;
      const res = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: `${AI_PROMPT}\n\n---\n${clipped}` }] }],
          generationConfig: { temperature: 0, responseMimeType: "application/json" },
        }),
      });
      if (!res.ok) return null;
      const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const out = j.candidates?.[0]?.content?.parts?.[0]?.text;
      return out ? JSON.parse(out) : null;
    }
    if (!cfg.baseUrl) return null;
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: AI_PROMPT },
          { role: "user", content: clipped },
        ],
      }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = j.choices?.[0]?.message?.content ?? "";
    const jsonText = content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1);
    return jsonText ? JSON.parse(jsonText) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function parseCv(
  buf: Buffer,
  kind: "pdf" | "docx",
  opts?: { knownInstruments?: string[]; allowAi?: boolean; now?: Date }
): Promise<CvParseResult> {
  const { withTimeout } = await import("./http");
  // Bozuk/kötü niyetli (zip bombası vb.) dosya işleyiciyi kilitlemesin.
  const text = (await withTimeout(extractCvText(buf, kind), 12_000, "CV_EXTRACT_TIMEOUT")).slice(0, 200_000);
  const rules = parseCvText(text, opts);
  let fields = rules;
  let method: CvParseResult["method"] = "rules";
  if (opts?.allowAi !== false && text.trim().length > 80) {
    const ai = sanitizeAi(await callAi(text), (opts?.now ?? new Date()).getFullYear());
    if (Object.keys(ai).length >= 3) {
      fields = { ...rules, ...ai };
      // İletişim bilgisinde birebir metin eşleşmesi (kural) daha güvenilir.
      if (rules.email) fields.email = rules.email;
      if (rules.phone) fields.phone = rules.phone;
      method = "ai";
    }
  }
  const filled = Object.entries(fields)
    .filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0))
    .map(([k]) => k);
  return { method, fields, filled, textLength: text.length };
}
