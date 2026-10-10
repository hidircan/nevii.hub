"use client";

/**
 * İş 1 — Ders Programı CSV importu (tekrarlayan seri desteği). Genel
 * `CsvImportSection`'dan FARKLI (o yalnız errorCount/validCount biliyor):
 * burada ayrıca `warnings` (müsaitlik dışı, hard error değil) ve bir
 * "uyarılı satırları da dahil et" onay adımı var — kullanıcı onayı
 * olmadan hiçbir uyarı otomatik bypass edilmez (bkz.
 * commitLessonScheduleImportTool).
 */

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import Link from "@/components/link";
import { Download, FileText, Loader2, Upload, UploadCloud, ArrowRight } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  actionPreviewLessonScheduleImport,
  actionCommitLessonScheduleImport,
  type LessonScheduleImportPreviewActionResult,
  type LessonScheduleImportCommitActionResult,
} from "@/lib/actions";
import { LESSON_SCHEDULE_CSV_COLUMNS, LESSON_SCHEDULE_CSV_SAMPLE } from "@/lib/import/lesson-schedule";

export function LessonScheduleImportSection() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<LessonScheduleImportPreviewActionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [includeWarnings, setIncludeWarnings] = useState(false);
  const [commitResult, setCommitResult] = useState<
    Extract<LessonScheduleImportCommitActionResult, { ok: true }>["result"] | null
  >(null);

  async function processFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Yalnızca .csv dosyaları kabul edilir.");
      return;
    }
    const text = await file.text();
    setCsvText(text);
    setFileName(file.name);
    setPreview(null);
    setError(null);
    setCommitResult(null);
    setIncludeWarnings(false);
  }

  async function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await processFile(file);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void processFile(file);
  }

  function handleResetFile() {
    setCsvText(null);
    setFileName(null);
    setPreview(null);
    setError(null);
    setCommitResult(null);
  }

  async function handlePreview() {
    if (!csvText) return;
    setLoading(true);
    setError(null);
    const result = await actionPreviewLessonScheduleImport(csvText);
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setPreview(result);
  }

  async function handleCommit() {
    if (!csvText) return;
    setCommitting(true);
    setError(null);
    const result = await actionCommitLessonScheduleImport(csvText, includeWarnings);
    setCommitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setCommitResult(result.result);
    setPreview(null);
    setCsvText(null);
    setFileName(null);
  }

  const downloadHref = `data:text/csv;charset=utf-8,${encodeURIComponent(LESSON_SCHEDULE_CSV_SAMPLE)}`;
  const p = preview?.ok ? preview.preview : null;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-[var(--color-text)] dark:text-slate-50">5. Ders Programı</h3>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Öğrenci ve öğretmen önce opsiyonel <code>ogrenci_kodu</code> / <code>ogretmen_kodu</code> (sistem
            kimliği) ile, yoksa AD SOYADI ile eşleşir. Aynı isimde birden fazla kişi varsa kod zorunludur —
            sistem rastgele seçim yapmaz. Tekil ders için <code>tekrar_tipi</code> boş veya &quot;once&quot;
            (eski şablon uyumlu: <code>tarih</code>/<code>saat</code>/<code>sure_dk</code>). Haftalık seri:{" "}
            <code>tekrar_tipi=weekly</code>, <code>tekrar_gunleri</code>, <code>bitis_tarihi</code> veya{" "}
            <code>toplam_tekrar</code>. Müsaitlik dışı saatler uyarıdır; onayınız olmadan oluşmaz.
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">Sütunlar: {LESSON_SCHEDULE_CSV_COLUMNS.join(", ")}</p>
        </div>
        <a
          href={downloadHref}
          download="ders_programi_tekrarlayan_ornek.csv"
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-amber-600 hover:text-amber-700"
        >
          <Download className="h-4 w-4" /> Örnek CSV indir
        </a>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={cn(
          "relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition",
          dragActive
            ? "border-amber-400 bg-amber-50"
            : fileName
              ? "border-emerald-300 bg-emerald-50/40"
              : "border-slate-300 bg-[var(--color-surface-muted)]/60"
        )}
      >
        {fileName ? (
          <>
            <FileText className="h-6 w-6 text-emerald-600" />
            <p className="text-sm font-medium text-[var(--color-text)] dark:text-slate-200">{fileName}</p>
            <span className="pointer-events-none text-xs font-medium text-amber-600">Değiştir</span>
          </>
        ) : (
          <>
            <UploadCloud className="h-6 w-6 text-[var(--color-text-muted)]" />
            <p className="text-sm text-[var(--color-text-muted)]">CSV dosyanızı buraya sürükleyin veya seçin</p>
            <span className="pointer-events-none inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--color-surface)] px-3.5 py-2 text-sm font-medium text-[var(--color-text-muted)] shadow-sm ring-1 ring-slate-200">
              Dosya seç
            </span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => void handleInputChange(e)}
          aria-label="Ders Programı CSV dosyası seç"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={() => void handlePreview()} disabled={!csvText || loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Önizle
        </Button>
        {p ? (
          <Button
            type="button"
            onClick={() => void handleCommit()}
            disabled={p.errorCount > 0 || p.valid.length === 0 || committing}
          >
            {committing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {p.summary.totalLessonsToCreate} ders / {p.summary.seriesRowCount} seri oluştur
          </Button>
        ) : null}
        {fileName ? (
          <button type="button" onClick={handleResetFile} className="text-xs font-medium text-[var(--color-text-muted)]">
            Dosyayı kaldır
          </button>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}

      {p ? (
        <div className="mt-4 border-t border-[var(--color-border)] pt-4">
          <p className="text-sm font-medium text-[var(--color-text-muted)] dark:text-slate-300">
            Toplam {p.totalRows} satır · Geçerli {p.valid.length} · Hatalı {p.errorCount} · Uyarı {p.warningCount}
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            {p.summary.singleLessonRowCount} tekil ders satırı · {p.summary.seriesRowCount} tekrarlayan seri satırı ·
            toplam {p.summary.totalLessonsToCreate} ders oluşturulacak
            {p.summary.firstLessonDate ? ` (${p.summary.firstLessonDate} – ${p.summary.lastLessonDate})` : ""}.
          </p>

          {p.errorCount > 0 ? (
            <div className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-lg bg-rose-50 p-2 text-xs text-rose-800">
              {p.errors.map((e, i) => (
                <p key={i}>
                  Satır {e.row} · {e.field}: {e.message}
                </p>
              ))}
            </div>
          ) : null}

          {p.warningCount > 0 ? (
            <div className="mt-2 space-y-2">
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
                {p.warnings.map((w, i) => (
                  <p key={i}>
                    Satır {w.row}: {w.message}
                  </p>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs font-medium text-[var(--color-text)]">
                <input
                  type="checkbox"
                  checked={includeWarnings}
                  onChange={(e) => setIncludeWarnings(e.target.checked)}
                />
                Bu uyarılı satırları da yine de oluştur (müsaitlik dışı override).
              </label>
              {!includeWarnings ? (
                <p className="text-[11px] text-amber-700">
                  İşaretlemezseniz bu satırlar aktarımda atlanır — diğer (uyarısız) satırlar yine de oluşturulur.
                </p>
              ) : null}
            </div>
          ) : null}

          {p.errorCount === 0 && p.warningCount === 0 ? (
            <p className="mt-2 text-xs text-emerald-600">Hata/uyarı yok — içe aktarmaya hazır.</p>
          ) : null}
        </div>
      ) : null}

      {commitResult ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-800">
            Aktarım tamamlandı: {commitResult.createdSingleLessonCount} tekil ders, {commitResult.createdSeriesCount}{" "}
            seri (toplam {commitResult.createdTotalLessonCount} ders) oluşturuldu
            {commitResult.skippedCount ? `, ${commitResult.skippedCount} satır atlandı` : ""}.
          </p>
          {commitResult.rowMessages.length > 0 ? (
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-emerald-900">
              {commitResult.rowMessages.map((m, i) => (
                <p key={i}>
                  Satır {m.row}: {m.message}
                </p>
              ))}
            </div>
          ) : null}
          <Link
            href="/panel/program"
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-emerald-700 underline hover:text-emerald-900"
          >
            Ders programını görüntüle <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : null}
    </Card>
  );
}
