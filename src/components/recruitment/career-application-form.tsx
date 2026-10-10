"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, FileText, Loader2, Sparkles, Upload, X } from "lucide-react";
import { EDUCATION_LABELS } from "@/lib/recruitment/constants";
import type { EducationLevel, RecruitmentCategory } from "@/lib/recruitment/types";

type Parsed = Partial<{
  firstName: string; lastName: string; email: string; phone: string; city: string; birthYear: number;
  instruments: string[]; experienceYears: number; teachingYears: number; educationLevel: EducationLevel;
  school: string; department: string; graduationYear: number; currentPosition: string; languages: string[];
  skills: string[]; linkedinUrl: string; portfolioUrl: string;
}>;

type FormState = {
  category: RecruitmentCategory;
  firstName: string; lastName: string; email: string; phone: string; city: string; birthYear: string;
  instruments: string[]; experienceYears: string; teachingYears: string; educationLevel: EducationLevel;
  school: string; department: string; graduationYear: string; currentPosition: string; languages: string;
  availability: string; availableFrom: string; portfolioUrl: string; linkedinUrl: string; coverLetter: string;
  kvkkConsent: boolean; website: string;
};

const EMPTY: FormState = {
  category: "teacher", firstName: "", lastName: "", email: "", phone: "", city: "", birthYear: "",
  instruments: [], experienceYears: "", teachingYears: "", educationLevel: "", school: "", department: "",
  graduationYear: "", currentPosition: "", languages: "", availability: "", availableFrom: "", portfolioUrl: "",
  linkedinUrl: "", coverLetter: "", kvkkConsent: false, website: "",
};

const inputCls =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2.5 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)] focus:ring-2 focus:ring-[var(--color-focus-ring)]/30";

function Field({ label, required, filled, children, hint, id }: { label: string; required?: boolean; filled?: boolean; children: React.ReactNode; hint?: string; id?: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 flex items-center gap-2 text-sm font-medium">
        {label}
        {required ? <span className="text-[var(--color-danger)]">*</span> : null}
        {filled ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-primary-soft-text)]">
            <Sparkles className="h-3 w-3" /> CV&apos;den
          </span>
        ) : null}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-[var(--color-text-muted)]">{hint}</p> : null}
    </div>
  );
}

function Section({ title, children, step }: { title: string; children: React.ReactNode; step: number }) {
  return (
    <fieldset className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)]">
      <legend className="flex items-center gap-2 px-1 text-base font-semibold">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs text-white">{step}</span>
        {title}
      </legend>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function CareerApplicationForm({
  slug, jobSlug, jobTitle, fixedCategory, instrumentSuggestions, kvkkText, tracking, institutionName,
}: {
  slug: string; jobSlug: string; jobTitle: string | null; fixedCategory: RecruitmentCategory | null;
  instrumentSuggestions: string[]; kvkkText: string; tracking: Record<string, string>; institutionName: string;
}) {
  const [f, setF] = useState<FormState>({ ...EMPTY, category: fixedCategory ?? "teacher" });
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseNote, setParseNote] = useState<string | null>(null);
  const [filled, setFilled] = useState<Set<string>>(new Set());
  const [parseMethod, setParseMethod] = useState<"rules" | "ai" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ number: string; duplicate: boolean } | null>(null);
  const [customInstrument, setCustomInstrument] = useState("");
  const [showKvkk, setShowKvkk] = useState(false);
  const [aiConsent, setAiConsent] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const utm = useMemo(() => {
    const out: Record<string, string> = { ...tracking };
    if (typeof window !== "undefined") {
      if (document.referrer && !document.referrer.includes(window.location.host)) out.referrer = document.referrer.slice(0, 120);
    }
    return out;
  }, [tracking]);

  useEffect(() => {
    if (done) topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [done]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));

  async function onFile(next: File | null, useAi: boolean = aiConsent) {
    setFile(next);
    setParseNote(null);
    if (!next) return;
    if (next.size > 4 * 1024 * 1024) {
      setParseNote("Dosya 4 MB'tan büyük. Lütfen daha küçük bir PDF yükleyin.");
      setFile(null);
      return;
    }
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append("cv", next);
      if (useAi) fd.append("ai", "1");
      const res = await fetch(`/api/kariyer/${encodeURIComponent(slug)}/cv-oku`, { method: "POST", body: fd });
      const j = (await res.json()) as { ok: boolean; message?: string; warning?: string; method?: "rules" | "ai"; fields?: Parsed; filled?: string[] };
      if (!j.ok) {
        setParseNote(j.message ?? "CV okunamadı; alanları elle doldurabilirsiniz.");
        if (res.status === 415 || res.status === 413) setFile(null);
        return;
      }
      const p = j.fields ?? {};
      const got = new Set<string>();
      const n: FormState = { ...f };
      const put = (k: keyof FormState, v: string | undefined) => {
        if (v && !String(f[k] ?? "").trim()) {
          (n as Record<string, unknown>)[k] = v;
          got.add(k);
        }
      };
      put("firstName", p.firstName);
      put("lastName", p.lastName);
      put("email", p.email);
      put("phone", p.phone);
      put("city", p.city);
      put("birthYear", p.birthYear?.toString());
      put("experienceYears", p.experienceYears?.toString());
      put("teachingYears", p.teachingYears?.toString());
      put("school", p.school);
      put("department", p.department);
      put("graduationYear", p.graduationYear?.toString());
      put("currentPosition", p.currentPosition);
      put("linkedinUrl", p.linkedinUrl);
      put("portfolioUrl", p.portfolioUrl);
      put("languages", p.languages?.join(", "));
      if (p.educationLevel && !f.educationLevel) {
        n.educationLevel = p.educationLevel;
        got.add("educationLevel");
      }
      if (p.instruments?.length) {
        n.instruments = Array.from(new Set([...f.instruments, ...p.instruments]));
        got.add("instruments");
      }
      setF(n);
      setFilled(got);
      setParseMethod(j.method ?? "rules");
      setParseNote(
        j.warning ??
          (got.size > 0
            ? `CV'nizden ${got.size} alan dolduruldu. Lütfen kontrol edin; gerekirse düzeltin.`
            : "CV'nizden otomatik doldurulabilecek alan bulunamadı; lütfen formu doldurun.")
      );
    } catch {
      setParseNote("CV okunurken bağlantı hatası oluştu; formu elle doldurabilirsiniz.");
    } finally {
      setParsing(false);
    }
  }

  function toggleInstrument(name: string) {
    setF((p) => ({ ...p, instruments: p.instruments.includes(name) ? p.instruments.filter((x) => x !== name) : [...p.instruments, name] }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.kvkkConsent) {
      setError("Devam etmek için KVKK aydınlatma metnini onaylayın.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        jobSlug,
        category: f.category,
        firstName: f.firstName,
        lastName: f.lastName,
        email: f.email,
        phone: f.phone,
        city: f.city || undefined,
        birthYear: f.birthYear || undefined,
        instruments: f.instruments,
        experienceYears: f.experienceYears || undefined,
        teachingYears: f.teachingYears || undefined,
        educationLevel: f.educationLevel,
        school: f.school || undefined,
        department: f.department || undefined,
        graduationYear: f.graduationYear || undefined,
        currentPosition: f.currentPosition || undefined,
        languages: f.languages.split(",").map((s) => s.trim()).filter(Boolean),
        availability: f.availability || undefined,
        availableFrom: f.availableFrom || undefined,
        portfolioUrl: f.portfolioUrl || undefined,
        linkedinUrl: f.linkedinUrl || undefined,
        coverLetter: f.coverLetter || undefined,
        source: tracking.kaynak ?? tracking.utm_source,
        utm,
        kvkkConsent: true,
        cvParseMethod: parseMethod ?? undefined,
        cvParsedFields: [...filled],
      };
      const fd = new FormData();
      fd.append("data", JSON.stringify(payload));
      fd.append("website", f.website);
      if (file) fd.append("cv", file);
      const res = await fetch(`/api/kariyer/${encodeURIComponent(slug)}/basvuru`, { method: "POST", body: fd });
      const j = (await res.json()) as { ok: boolean; message?: string; applicationNumber?: string; duplicate?: boolean };
      if (!j.ok) {
        setError(j.message ?? "Başvuru gönderilemedi.");
        return;
      }
      setDone({ number: j.applicationNumber ?? "", duplicate: !!j.duplicate });
    } catch {
      setError("Bağlantı hatası — başvurunuz gönderilemedi. Lütfen tekrar deneyin.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div ref={topRef} className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center shadow-[var(--shadow-sm)]">
        <CheckCircle2 className="mx-auto h-12 w-12 text-[var(--color-success)]" />
        <h3 className="mt-3 text-2xl font-semibold">Başvurunuz alındı!</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-[color:var(--text-secondary)]">
          {`Teşekkürler${f.firstName ? `, ${f.firstName}` : ""}. ${jobTitle ? `${jobTitle} başvurunuz` : "Başvurunuz"} ${institutionName} ekibine ulaştı. Kısa süre içinde e-posta adresinize bir onay mesajı gelecek.`}
        </p>
        {done.number ? (
          <p className="mt-4 inline-block rounded-full bg-[var(--color-surface-muted)] px-4 py-1.5 text-sm font-medium">Başvuru no: {done.number}</p>
        ) : null}
      </div>
    );
  }

  const instrumentOptions = Array.from(new Set([...instrumentSuggestions, ...f.instruments]));

  return (
    <form onSubmit={submit} className="space-y-6" noValidate={false}>
      {/* CV yükleme */}
      <div
        className="rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface)] p-6 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const dropped = e.dataTransfer.files?.[0];
          if (dropped) void onFile(dropped);
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <FileText className="h-8 w-8 text-[var(--color-primary)]" />
            <div className="text-left">
              <p className="text-sm font-medium">{file.name}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{(file.size / 1024).toFixed(0)} KB</p>
            </div>
            <button type="button" onClick={() => { setFile(null); setFilled(new Set()); setParseNote(null); if (fileRef.current) fileRef.current.value = ""; }} className="rounded-full p-1 hover:bg-[var(--color-surface-muted)]" aria-label="CV'yi kaldır">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <Upload className="mx-auto h-8 w-8 text-[var(--color-text-muted)]" />
            <p className="mt-2 text-sm font-medium">CV&apos;nizi sürükleyin ya da seçin</p>
            <p className="text-xs text-[var(--color-text-muted)]">PDF veya Word (.docx), en fazla 4 MB — bilgileriniz otomatik doldurulur</p>
            <button type="button" onClick={() => fileRef.current?.click()} className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-surface-muted)]">
              Dosya seç
            </button>
          </>
        )}
        <label className="mx-auto mt-4 flex max-w-md items-start gap-2 text-left text-xs text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={aiConsent}
            onChange={(e) => {
              setAiConsent(e.target.checked);
              if (e.target.checked && file) void onFile(file, true);
            }}
          />
          <span>
            <strong className="text-[var(--color-text)]">Yapay zekâ ile daha isabetli oku (isteğe bağlı).</strong> İşaretlerseniz CV metniniz, formu doldurmak için yurt dışında bulunabilen bir yapay zekâ hizmetine gönderilir. İşaretlemezseniz CV yalnız bizim sistemimizde okunur.
          </span>
        </label>
        {parsing ? (
          <p className="mt-3 inline-flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> CV okunuyor…
          </p>
        ) : parseNote ? (
          <p className="mt-3 text-sm text-[color:var(--text-secondary)]" role="status">{parseNote}</p>
        ) : null}
      </div>

      <Section title="Kişisel bilgiler" step={1}>
        {!fixedCategory ? (
          <div className="sm:col-span-2">
            <span className="mb-1 block text-sm font-medium">Hangi alanda başvuruyorsunuz? <span className="text-[var(--color-danger)]">*</span></span>
            <div className="flex gap-2">
              {(["teacher", "staff"] as const).map((c) => (
                <button key={c} type="button" onClick={() => set("category", c)}
                  className={`rounded-full border px-4 py-1.5 text-sm ${f.category === c ? "border-[var(--color-primary)] bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-text)]" : "border-[var(--color-border-strong)]"}`}>
                  {c === "teacher" ? "Öğretmen / eğitmen" : "Personel (idari, danışma vb.)"}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <Field id="ad" label="Ad" required filled={filled.has("firstName")}>
          <input id="ad" className={inputCls} required autoComplete="given-name" value={f.firstName} onChange={(e) => set("firstName", e.target.value)} />
        </Field>
        <Field id="soyad" label="Soyad" required filled={filled.has("lastName")}>
          <input id="soyad" className={inputCls} required autoComplete="family-name" value={f.lastName} onChange={(e) => set("lastName", e.target.value)} />
        </Field>
        <Field id="eposta" label="E-posta" required filled={filled.has("email")}>
          <input id="eposta" type="email" className={inputCls} required autoComplete="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field id="tel" label="Telefon" required filled={filled.has("phone")}>
          <input id="tel" type="tel" className={inputCls} required autoComplete="tel" placeholder="05xx xxx xx xx" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field id="sehir" label="Şehir / ilçe" filled={filled.has("city")}>
          <input id="sehir" className={inputCls} autoComplete="address-level2" value={f.city} onChange={(e) => set("city", e.target.value)} />
        </Field>
        <Field id="dogum" label="Doğum yılı" filled={filled.has("birthYear")}>
          <input id="dogum" inputMode="numeric" className={inputCls} placeholder="örn. 1995" value={f.birthYear} onChange={(e) => set("birthYear", e.target.value.replace(/\D/g, "").slice(0, 4))} />
        </Field>
      </Section>

      <Section title={f.category === "teacher" ? "Müzik ve deneyim" : "Deneyim"} step={2}>
        {f.category === "teacher" ? (
          <div className="sm:col-span-2">
            <span className="mb-1 flex items-center gap-2 text-sm font-medium">
              Enstrüman / branş
              {filled.has("instruments") ? <span className="rounded-full bg-[var(--color-primary-soft)] px-2 py-0.5 text-[10px] text-[var(--color-primary-soft-text)]">CV&apos;den</span> : null}
            </span>
            <div className="flex flex-wrap gap-2">
              {instrumentOptions.map((i) => (
                <button key={i} type="button" onClick={() => toggleInstrument(i)} aria-pressed={f.instruments.includes(i)}
                  className={`rounded-full border px-3 py-1 text-sm transition ${f.instruments.includes(i) ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white" : "border-[var(--color-border-strong)] hover:bg-[var(--color-surface-muted)]"}`}>
                  {i}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input className={inputCls} placeholder="Listede yoksa ekleyin (örn. Kanun)" value={customInstrument} onChange={(e) => setCustomInstrument(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (customInstrument.trim()) { toggleInstrument(customInstrument.trim()); setCustomInstrument(""); } } }} />
              <button type="button" className="rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-3 text-sm" onClick={() => { if (customInstrument.trim()) { toggleInstrument(customInstrument.trim()); setCustomInstrument(""); } }}>Ekle</button>
            </div>
          </div>
        ) : null}
        <Field id="deneyim" label="Toplam iş deneyimi (yıl)" filled={filled.has("experienceYears")}>
          <input id="deneyim" inputMode="numeric" className={inputCls} value={f.experienceYears} onChange={(e) => set("experienceYears", e.target.value.replace(/\D/g, "").slice(0, 2))} />
        </Field>
        {f.category === "teacher" ? (
          <Field id="ogretmenlik" label="Öğretmenlik / eğitmenlik deneyimi (yıl)" filled={filled.has("teachingYears")}>
            <input id="ogretmenlik" inputMode="numeric" className={inputCls} value={f.teachingYears} onChange={(e) => set("teachingYears", e.target.value.replace(/\D/g, "").slice(0, 2))} />
          </Field>
        ) : null}
        <Field id="pozisyon" label="Güncel / son pozisyon" filled={filled.has("currentPosition")}>
          <input id="pozisyon" className={inputCls} value={f.currentPosition} onChange={(e) => set("currentPosition", e.target.value)} />
        </Field>
      </Section>

      <Section title="Eğitim" step={3}>
        <Field id="egitim" label="Eğitim düzeyi" filled={filled.has("educationLevel")}>
          <select id="egitim" className={inputCls} value={f.educationLevel} onChange={(e) => set("educationLevel", e.target.value as EducationLevel)}>
            {(Object.keys(EDUCATION_LABELS) as EducationLevel[]).map((k) => (
              <option key={k} value={k}>{k === "" ? "Seçin" : EDUCATION_LABELS[k]}</option>
            ))}
          </select>
        </Field>
        <Field id="okul" label="Okul / konservatuvar" filled={filled.has("school")}>
          <input id="okul" className={inputCls} value={f.school} onChange={(e) => set("school", e.target.value)} />
        </Field>
        <Field id="bolum" label="Bölüm / anasanat dalı" filled={filled.has("department")}>
          <input id="bolum" className={inputCls} value={f.department} onChange={(e) => set("department", e.target.value)} />
        </Field>
        <Field id="mezuniyet" label="Mezuniyet yılı" filled={filled.has("graduationYear")}>
          <input id="mezuniyet" inputMode="numeric" className={inputCls} value={f.graduationYear} onChange={(e) => set("graduationYear", e.target.value.replace(/\D/g, "").slice(0, 4))} />
        </Field>
        <Field id="diller" label="Yabancı diller" hint="Virgülle ayırın" filled={filled.has("languages")}>
          <input id="diller" className={inputCls} value={f.languages} onChange={(e) => set("languages", e.target.value)} />
        </Field>
      </Section>

      <Section title="Ek bilgiler" step={4}>
        <Field id="musaitlik" label="Müsait olduğunuz gün / saatler" hint="örn. Hafta içi 14:00 sonrası, Cumartesi tüm gün">
          <input id="musaitlik" className={inputCls} value={f.availability} onChange={(e) => set("availability", e.target.value)} />
        </Field>
        <Field id="baslama" label="En erken başlama tarihi">
          <input id="baslama" type="date" className={inputCls} value={f.availableFrom} onChange={(e) => set("availableFrom", e.target.value)} />
        </Field>
        <Field id="portfolyo" label="Video / portfolyo bağlantısı" hint="YouTube, SoundCloud, kişisel site" filled={filled.has("portfolioUrl")}>
          <input id="portfolyo" className={inputCls} value={f.portfolioUrl} onChange={(e) => set("portfolioUrl", e.target.value)} />
        </Field>
        <Field id="linkedin" label="LinkedIn profili" filled={filled.has("linkedinUrl")}>
          <input id="linkedin" className={inputCls} value={f.linkedinUrl} onChange={(e) => set("linkedinUrl", e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field id="onyazi" label="Kısaca kendinizden bahsedin (ön yazı)">
            <textarea id="onyazi" rows={5} maxLength={5000} className={inputCls} value={f.coverLetter} onChange={(e) => set("coverLetter", e.target.value)} />
          </Field>
        </div>
        {/* Bot tuzağı — gerçek kullanıcı görmez */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set("website", e.target.value)} className="hidden" aria-hidden="true" />
      </Section>

      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4" checked={f.kvkkConsent} onChange={(e) => set("kvkkConsent", e.target.checked)} />
          <span>
            Kişisel verilerimin işe alım süreci kapsamında işlenmesine ilişkin{" "}
            <button type="button" className="font-medium text-[var(--color-primary)] underline" onClick={() => setShowKvkk((s) => !s)}>
              KVKK aydınlatma metnini
            </button>{" "}
            okudum, onaylıyorum. <span className="text-[var(--color-danger)]">*</span>
          </span>
        </label>
        {showKvkk ? <p className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[var(--color-surface-muted)] p-3 text-xs leading-relaxed text-[color:var(--text-secondary)]">{kvkkText}</p> : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger)]">{error}</p>
      ) : null}

      <button type="submit" disabled={submitting || parsing}
        className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-3 text-base font-semibold text-white transition hover:bg-[var(--color-primary-hover)] disabled:opacity-60 sm:w-auto sm:px-8">
        {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
        {submitting ? "Gönderiliyor…" : "Başvuruyu gönder"}
      </button>
    </form>
  );
}
