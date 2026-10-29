"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Select } from "@/components/ui";

const STUDENT_TYPES = [
  "Hobi",
  "MEB",
  "London College of Music Hazırlık",
  "Konservatuvar Hazırlık",
  "Güzel Sanatlar Lisesi Hazırlık",
] as const;

/** ~2MB ham dosya sınırı — createTeachingMaterialSchema (validation.ts) ile tutarlı. */
const MAX_FILE_BYTES = 2_000_000;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("Dosya okunamadı"));
    reader.readAsDataURL(file);
  });
}

/** `instrumentOptions`: kurumun AKTİF enstrüman kataloğu (activeInstrumentOptions) — sabit liste değil. */
export function TeachingMaterialForm({ instrumentOptions }: { instrumentOptions: string[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetStudentType, setTargetStudentType] = useState("");
  const [targetInstrument, setTargetInstrument] = useState("");
  const [targetLevel, setTargetLevel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || !description.trim()) {
      setError("Başlık ve açıklama zorunlu.");
      return;
    }
    if (file && file.size > MAX_FILE_BYTES) {
      setError("Dosya çok büyük (en fazla ~2MB).");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(false);
    try {
      const fileData = file ? await readFileAsBase64(file) : undefined;
      const res = await fetch("/api/v1/teaching-materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          targetStudentType: targetStudentType || undefined,
          targetInstrument: targetInstrument || undefined,
          targetLevel: targetLevel.trim() || undefined,
          fileName: file?.name,
          fileMimeType: file?.type,
          fileData,
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!json.ok) {
        setError(json.error?.message || "Materyal paylaşılamadı.");
        setBusy(false);
        return;
      }
      setSuccess(true);
      setTitle("");
      setDescription("");
      setTargetStudentType("");
      setTargetInstrument("");
      setTargetLevel("");
      setFile(null);
      router.refresh();
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <div>
        <Label>Başlık</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Gam pratik videosu" />
      </div>
      <div>
        <Label>Açıklama</Label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] outline-none ring-cyan-500/30 placeholder:text-[var(--color-text-muted)] focus:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label>Öğrenci türü</Label>
          <Select value={targetStudentType} onChange={(e) => setTargetStudentType(e.target.value)}>
            <option value="">Tümü</option>
            {STUDENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Enstrüman</Label>
          <Select value={targetInstrument} onChange={(e) => setTargetInstrument(e.target.value)}>
            <option value="">Tümü</option>
            {instrumentOptions.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Seviye</Label>
          <Input value={targetLevel} onChange={(e) => setTargetLevel(e.target.value)} placeholder="Orta" />
        </div>
      </div>
      <input
        type="file"
        accept="image/*,video/*,audio/*,application/pdf"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-xs text-[var(--color-text-muted)] file:mr-2 file:rounded-lg file:border-0 file:bg-cyan-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
      />
      {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}
      {success ? <p className="text-xs font-medium text-emerald-600">Materyal paylaşıldı.</p> : null}
      <Button type="submit" disabled={busy}>
        {busy ? "Paylaşılıyor…" : "Paylaş"}
      </Button>
    </form>
  );
}
