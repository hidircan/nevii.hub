"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/link";
import { apiFetch } from "@/lib/api/client-fetch";
import { friendlyApiErrorMessage } from "@/lib/api/friendly-error";
import { CLUB_APPLICATION_STATUS_LABEL, type ClubApplicationStatus } from "@/lib/club-application-status";

const field =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm text-[var(--color-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-focus-ring)]";
const label = "mb-1 block text-xs font-semibold text-[var(--color-text)]";

async function send(url: string, method: "POST" | "PATCH", body: unknown): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> {
  try {
    const res = await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await res.json()) as { ok: boolean; data?: unknown; error?: { code?: string; message?: string } };
    return j.ok ? { ok: true, data: j.data } : { ok: false, message: friendlyApiErrorMessage(j.error, "İşlem tamamlanamadı. Bilgileri kontrol edip tekrar deneyin.") };
  } catch {
    return { ok: false, message: "Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin." };
  }
}

const EDITABLE: ClubApplicationStatus[] = ["new", "contacted", "waitlisted", "declined", "withdrawn"];

/** Durum + yönetim notu. "Kulübe eklendi" yalnız "Kulübe ekle" akışıyla verilir (sunucu da zorlar). */
export function ClubApplicationStatusEditor({ id, status, staffNote }: { id: string; status: ClubApplicationStatus; staffNote?: string }) {
  const router = useRouter();
  const [next, setNext] = useState<ClubApplicationStatus>(status);
  const [note, setNote] = useState(staffNote ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const locked = status === "added";
  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await send("/api/v1/club-applications", "PATCH", { id, ...(locked || next === status ? {} : { status: next }), staffNote: note });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.message });
    setMsg({ ok: true, text: "Kaydedildi." });
    router.refresh();
  }
  return (
    <div className="space-y-2">
      {locked ? (
        <p className="text-xs text-[var(--color-text-muted)]">Bu başvuru kulübe eklendi; durum değiştirilemez. Not ekleyebilirsiniz.</p>
      ) : (
        <div>
          <label htmlFor="ca-status" className={label}>Durum</label>
          <select id="ca-status" value={next} onChange={(e) => setNext(e.target.value as ClubApplicationStatus)} className={field}>
            {EDITABLE.map((s) => (
              <option key={s} value={s}>{CLUB_APPLICATION_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label htmlFor="ca-staff-note" className={label}>Yönetim notu (yalnız panel)</label>
        <textarea id="ca-staff-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={3} className={`${field} min-h-[4.5rem] resize-y`} />
      </div>
      <button type="button" onClick={() => void save()} disabled={busy} className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-sm font-semibold text-[var(--color-text-inverted)] disabled:opacity-60">
        {busy ? "Kaydediliyor…" : "Kaydet"}
      </button>
      {msg ? (
        <p role={msg.ok ? "status" : "alert"} className="text-xs" style={{ color: msg.ok ? "var(--color-success)" : "var(--color-danger)" }}>
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}

type StudentOption = { id: string; name: string; phone?: string; birthDate?: string; active: boolean };
type Suggestion = StudentOption & { reason: string };

type Preview = {
  student: { id: string; name: string; phone?: string; parentPhone?: string; birthDate?: string; branchName?: string };
  club: { id: string; name: string; branchName?: string; used: number; max: number; full: boolean; fee: number; feePeriod: string; active: boolean };
  existingMain?: { membershipId: string; linkedToThisApplication: boolean };
  startDate: string;
  solfege?: { id: string; name: string; used: number; max: number; full: boolean; action: "create" | "grant" | "already"; existingIndependent: boolean };
  blockers: string[];
  needsSolfegeWaitlistConfirm: boolean;
  feeNote: string;
};

const ymdTr = (ymd?: string) => (ymd ? ymd.split("-").reverse().join(".") : "—");

/**
 * "Kulübe ekle": önce mevcut öğrenciyi seç/eşleştir (öneriler yalnız ipucu — otomatik birleştirme YOK), eşleşme
 * yoksa ön doldurulmuş kısa kayıt; sonra sunucu önizlemesi (öğrenci, kulüp, şube, kapasite, dahil solfej) ve onay.
 */
export function ClubApplicationAddToClub({
  applicationId,
  students,
  suggestions,
  initialStudentId,
  newStudentHref,
  solfegeOnly,
}: {
  applicationId: string;
  students: StudentOption[];
  suggestions: Suggestion[];
  initialStudentId?: string;
  newStudentHref: string;
  /** Başvuru eklendi ama dahil solfej bekliyor: yalnız solfej tamamlanır (aynı öğrenci). */
  solfegeOnly?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [studentId, setStudentId] = useState(initialStudentId ?? "");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [startDate, setStartDate] = useState("");
  const [confirmSolfege, setConfirmSolfege] = useState(false);
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const k = q.trim().toLocaleLowerCase("tr");
    const digits = q.replace(/\D/g, "");
    if (!k) return [];
    return students.filter((s) => s.name.toLocaleLowerCase("tr").includes(k) || (digits.length >= 3 && (s.phone ?? "").replace(/\D/g, "").includes(digits)));
  }, [q, students]);
  const chosen = students.find((s) => s.id === studentId);

  async function loadPreview(id = studentId, sd = startDate) {
    if (!id) return setError("Önce öğrenciyi seçin.");
    setBusy("preview");
    setError(null);
    const r = await send("/api/v1/club-applications/add", "POST", { mode: "preview", applicationId, studentId: id, ...(sd ? { startDate: sd } : {}) });
    setBusy(null);
    if (!r.ok) return setError(r.message);
    const p = r.data as Preview;
    setPreview(p);
    setStartDate(p.startDate);
    setConfirmSolfege(false);
  }

  async function commit() {
    if (!preview) return;
    if (preview.needsSolfegeWaitlistConfirm && !confirmSolfege) return setError("Solfej dolu: devam etmek için bekleme listesi seçeneğini işaretleyin veya solfej kontenjanını artırın.");
    setBusy("commit");
    setError(null);
    const r = await send("/api/v1/club-applications/add", "POST", {
      mode: "commit",
      applicationId,
      studentId: preview.student.id,
      startDate,
      confirmSolfegeWaitlist: confirmSolfege,
    });
    setBusy(null);
    if (!r.ok) return setError(r.message);
    const d = r.data as { created: boolean; solfegePending: boolean; warnings: string[] };
    setDone(
      `${preview.student.name} ${preview.club.name} kulübüne eklendi.${d.solfegePending ? " Dahil solfej bekleme listesinde." : ""}${d.warnings.length ? ` Uyarı: ${d.warnings.join(" ")}` : ""}`
    );
    router.refresh();
  }

  if (done) return <p role="status" className="rounded-md bg-[var(--color-success-soft)] px-3 py-2 text-sm text-[var(--color-success)]">{done}</p>;

  const pick = (id: string) => {
    setStudentId(id);
    setPreview(null);
    setError(null);
  };

  return (
    <div className="space-y-3">
      {!solfegeOnly ? (
        <>
          <p className="text-xs text-[var(--color-text-muted)]">
            1) Mevcut öğrenciyi seçin. Öneriler yalnız ipucudur; aynı ad/telefon farklı kişi olabilir — kayıtlar otomatik birleştirilmez.
          </p>
          {suggestions.length ? (
            <ul className="space-y-1" aria-label="Olası eşleşmeler">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => pick(s.id)}
                    aria-pressed={studentId === s.id}
                    className="flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm"
                    style={studentId === s.id ? { borderColor: "var(--color-primary)", background: "var(--color-primary-soft)" } : { borderColor: "var(--color-border)" }}
                  >
                    <span>
                      <span className="font-medium">{s.name}</span>
                      {!s.active ? <span className="ml-1 text-[11px] text-[var(--color-warning)]">(pasif)</span> : null}
                      <span className="block text-[11px] text-[var(--color-text-muted)]">
                        {s.reason}
                        {s.birthDate ? ` · doğum ${ymdTr(s.birthDate)}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-[var(--color-text-muted)]">{s.phone ?? ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-[var(--color-text-muted)]">Bu telefon veya adla eşleşen öğrenci bulunamadı.</p>
          )}
          <div>
            <label htmlFor="ca-student-search" className={label}>Başka öğrenci ara (ad veya telefon)</label>
            <input id="ca-student-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${students.length} öğrenci içinde ara`} className={field} />
            {q.trim() ? (
              <ul className="mt-1 max-h-56 overflow-y-auto rounded-md border border-[var(--color-border)]" role="listbox" aria-label="Arama sonuçları">
                {filtered.length === 0 ? <li className="px-3 py-2 text-xs text-[var(--color-text-muted)]">Eşleşen öğrenci yok.</li> : null}
                {filtered.map((s) => (
                  <li key={s.id} role="option" aria-selected={studentId === s.id}>
                    <button type="button" onClick={() => pick(s.id)} className="flex w-full justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--color-surface-muted)]">
                      <span>{s.name}{!s.active ? " (pasif)" : ""}</span>
                      <span className="text-xs tabular-nums text-[var(--color-text-muted)]">{s.phone ?? ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <p className="text-xs">
            Eşleşme yok mu?{" "}
            <Link href={newStudentHref} className="font-semibold text-[var(--color-primary)] hover:underline">
              Aday bilgileriyle yeni öğrenci kaydı aç →
            </Link>{" "}
            <span className="text-[var(--color-text-muted)]">(kayıttan sonra buraya dönersiniz; üyelik ve ücret o ekranda yazılmaz)</span>
          </p>
        </>
      ) : (
        <p className="text-xs text-[var(--color-text-muted)]">Ana üyelik tamam; dahil solfej kontenjan nedeniyle bekliyor. Solfejde yer açıldıysa önizleyip tamamlayın.</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void loadPreview()}
          disabled={!studentId || busy !== null}
          className="rounded-md border border-[var(--color-primary)] px-3 py-1.5 text-sm font-semibold text-[var(--color-primary)] disabled:opacity-50"
        >
          {busy === "preview" ? "Hazırlanıyor…" : chosen ? `${chosen.name} — önizle` : "Önizle"}
        </button>
      </div>

      {preview ? (
        <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">2) Önizleme — onaylamadan hiçbir şey yazılmaz</p>
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-[11px] text-[var(--color-text-muted)]">Öğrenci</dt>
              <dd className="font-medium">
                <Link href={`/panel/ogrenciler/${preview.student.id}`} className="hover:underline">{preview.student.name}</Link>
              </dd>
              <dd className="text-xs text-[var(--color-text-muted)]">
                {[preview.student.parentPhone || preview.student.phone, preview.student.birthDate ? `doğum ${ymdTr(preview.student.birthDate)}` : "", preview.student.branchName].filter(Boolean).join(" · ")}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-[var(--color-text-muted)]">Kulüp / şube</dt>
              <dd className="font-medium">{preview.club.name}</dd>
              <dd className="text-xs text-[var(--color-text-muted)]">{preview.club.branchName ?? "Şube bağımsız"} · kapasite {preview.club.used}/{preview.club.max}{preview.club.full ? " (dolu)" : ""}</dd>
            </div>
            <div>
              <label htmlFor="ca-start" className="text-[11px] text-[var(--color-text-muted)]">Üyelik başlangıcı</label>
              <input id="ca-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} onBlur={() => void loadPreview(preview.student.id, startDate)} className={field} />
            </div>
            <div>
              <dt className="text-[11px] text-[var(--color-text-muted)]">Dahil solfej</dt>
              {preview.solfege ? (
                <dd>
                  <span className="font-medium">{preview.solfege.name}</span>{" "}
                  <span className="text-xs text-[var(--color-text-muted)]">
                    · kapasite {preview.solfege.used}/{preview.solfege.max} ·{" "}
                    {preview.solfege.action === "create"
                      ? preview.solfege.full
                        ? "DOLU"
                        : "ücretsiz dahil üyelik açılacak"
                      : preview.solfege.action === "grant"
                        ? preview.solfege.existingIndependent
                          ? "öğrencinin zaten bağımsız solfej üyeliği var — yenisi açılmaz, ek ücret yok"
                          : "öğrenci zaten dahil solfej üyesi — hak eklenir, yeni üyelik yok"
                        : "zaten bu üyelikle dahil"}
                  </span>
                </dd>
              ) : (
                <dd className="text-xs text-[var(--color-text-muted)]">Yok</dd>
              )}
            </div>
          </dl>
          {preview.existingMain ? (
            <p className="text-xs text-[var(--color-text-muted)]">
              Öğrenci bu kulübe zaten üye{preview.existingMain.linkedToThisApplication ? " (bu başvuruyla)" : ""}; yeni üyelik açılmaz, başvuru bu üyelikle ilişkilendirilir.
            </p>
          ) : null}
          <p className="rounded-md bg-[var(--color-surface)] px-3 py-2 text-xs">{preview.feeNote}</p>
          {preview.blockers.length ? (
            <ul role="alert" className="list-disc space-y-0.5 rounded-md bg-[var(--color-danger-soft)] py-2 pl-7 pr-3 text-xs text-[var(--color-danger)]">
              {preview.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : null}
          {preview.needsSolfegeWaitlistConfirm ? (
            <label className="flex items-start gap-2 rounded-md border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-3 py-2 text-xs">
              <input type="checkbox" checked={confirmSolfege} onChange={(e) => setConfirmSolfege(e.target.checked)} className="mt-0.5" />
              <span>
                <strong>Dahil solfej dolu.</strong> Ana üyeliği tamamla, solfej hakkını <strong>bekleme listesine</strong> al (başvuruda “dahil solfej bekliyor” görünür; yer açılınca buradan tamamlanır).
              </span>
            </label>
          ) : null}
          <button
            type="button"
            onClick={() => void commit()}
            disabled={busy !== null || preview.blockers.length > 0 || (preview.needsSolfegeWaitlistConfirm && !confirmSolfege)}
            className="w-full rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-semibold text-[var(--color-text-inverted)] disabled:opacity-50"
          >
            {busy === "commit" ? "Ekleniyor…" : solfegeOnly ? "Dahil solfeji tamamla" : "Onayla ve kulübe ekle"}
          </button>
        </div>
      ) : null}
      {error ? <p role="alert" className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-xs text-[var(--color-danger)]">{error}</p> : null}
    </div>
  );
}
