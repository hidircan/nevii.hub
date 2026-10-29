"use client";

import Link from "@/components/link";
import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { ArrowRight, Download, FileText, Loader2, Upload, UploadCloud, X } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils";

type ImportRowError = { row: number; field: string; message: string };
type ImportReadRow = { row: number; summary: string };
type ImportPreview<T> = {
  totalRows: number;
  validCount: number;
  errorCount: number;
  errors: ImportRowError[];
  valid: T[];
  readRows: ImportReadRow[];
};
type ImportCommitResult = { created: number; updated: number; skipped?: number };

type PreviewActionResult<T> = { ok: true; preview: ImportPreview<T> } | { ok: false; message: string };
type CommitActionResult = { ok: true; result: ImportCommitResult } | { ok: false; message: string };

export function CsvImportSection<T,>({
  title,
  description,
  columns,
  sampleCsv,
  sampleFileName,
  successHref,
  successLinkLabel,
  onPreview,
  onCommit,
}: {
  title: string;
  description: string;
  columns: readonly string[];
  sampleCsv: string;
  sampleFileName: string;
  successHref: string;
  successLinkLabel: string;
  onPreview: (csvText: string) => Promise<PreviewActionResult<T>>;
  onCommit: (csvText: string) => Promise<CommitActionResult>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<ImportPreview<T> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitSuccess, setCommitSuccess] = useState<ImportCommitResult | null>(null);

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
    setCommitSuccess(null);
  }

  async function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await processFile(file);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(true);
  }

  function handleDragLeave() {
    setDragActive(false);
  }

  async function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await processFile(file);
  }

  function handleResetFile() {
    setCsvText(null);
    setFileName(null);
    setPreview(null);
    setError(null);
  }

  async function handlePreview() {
    if (!csvText) return;
    setLoading(true);
    setError(null);
    const result = await onPreview(csvText);
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setPreview(result.preview);
  }

  async function handleCommit() {
    if (!csvText) return;
    setCommitting(true);
    setError(null);
    const result = await onCommit(csvText);
    setCommitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setCommitSuccess(result.result);
    setPreview(null);
    setCsvText(null);
    setFileName(null);
  }

  const downloadHref = `data:text/csv;charset=utf-8,${encodeURIComponent(sampleCsv)}`;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-[var(--color-text)] dark:text-slate-50">{title}</h3>
          <p className="mt-1 text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">{description}</p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">Sütunlar: {columns.join(", ")}</p>
        </div>
        <a
          href={downloadHref}
          download={sampleFileName}
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-amber-600 hover:text-amber-700"
        >
          <Download className="h-4 w-4" /> Örnek CSV indir
        </a>
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={(e) => void handleDrop(e)}
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
            <p className="text-sm text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">CSV dosyanızı buraya sürükleyin veya seçin</p>
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
          aria-label={`${title} CSV dosyası seç`}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={handlePreview} disabled={!csvText || loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Önizle
        </Button>
        {preview ? (
          <Button
            type="button"
            onClick={handleCommit}
            disabled={preview.errorCount > 0 || preview.validCount === 0 || preview.totalRows === 1 || committing}
          >
            {committing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {preview.validCount} kaydı içe aktar
          </Button>
        ) : null}
        {fileName ? (
          <button
            type="button"
            onClick={handleResetFile}
            className="text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]"
          >
            Dosyayı kaldır
          </button>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}

      {preview ? (
        <div className="mt-4 border-t border-[var(--color-border)] pt-4">
          {preview.totalRows === 1 ? (
            <p className="mb-2 rounded-lg bg-amber-50 p-2 text-xs font-medium text-amber-800">
              Dosyadan yalnızca 1 kayıt okunabildi. CSV ayıracı ve satır formatını kontrol edin.
            </p>
          ) : null}
          <p className="text-sm font-medium text-[var(--color-text-muted)] dark:text-slate-300">
            Toplam {preview.totalRows} satır · Geçerli {preview.validCount} · Hatalı {preview.errorCount}
          </p>

          {preview.readRows.length > 0 ? (
            <div className="mt-2">
              <p className="text-xs font-medium text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">
                Okunan kayıtlar {preview.totalRows > preview.readRows.length ? `(ilk ${preview.readRows.length})` : ""}
              </p>
              <div className="mt-1 max-h-52 space-y-1 overflow-y-auto rounded-lg bg-[var(--color-surface-muted)] p-2 text-xs text-[var(--color-text-muted)] dark:text-slate-300">
                {preview.readRows.map((r) => (
                  <p key={r.row}>
                    Satır {r.row} — {r.summary}
                  </p>
                ))}
              </div>
            </div>
          ) : null}

          {preview.errorCount > 0 ? (
            <div className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-lg bg-rose-50 p-2 text-xs text-rose-800">
              {preview.errors.map((e, i) => (
                <p key={i}>
                  Satır {e.row} · {e.field}: {e.message}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-emerald-600">Hata yok — içe aktarmaya hazır.</p>
          )}
        </div>
      ) : null}

      {commitSuccess ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-emerald-800">
              Aktarım tamamlandı: {commitSuccess.created} yeni kayıt eklendi, {commitSuccess.updated} kayıt
              güncellendi
              {commitSuccess.skipped ? `, ${commitSuccess.skipped} kayıt zaten mevcut olduğu için atlandı` : ""}.
            </p>
            <button
              type="button"
              onClick={() => setCommitSuccess(null)}
              aria-label="Kapat"
              className="shrink-0 text-emerald-600 hover:text-emerald-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <Link
              href={successHref}
              className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 underline hover:text-emerald-900"
            >
              {successLinkLabel} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <button
              type="button"
              onClick={handleResetFile}
              className="text-sm font-medium text-emerald-700 underline hover:text-emerald-900"
            >
              Yeni dosya aktar
            </button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
