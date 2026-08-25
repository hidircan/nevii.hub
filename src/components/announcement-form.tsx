"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export type AnnouncementRecipientOption = {
  userId: string;
  name: string;
  role: string;
  subLabel?: string;
};

/** Duyurular artık yalnız şahsa özel (seçili kullanıcı) gönderilebilir — bkz. listAnnouncementRecipientsTool. */
export function AnnouncementForm({ recipients }: { recipients: AnnouncementRecipientOption[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [publishNow, setPublishNow] = useState(true);
  const [pinned, setPinned] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const ACCEPT =
    "application/pdf,image/jpeg,image/png,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx";

  const filteredRecipients = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    if (!q) return recipients;
    return recipients.filter(
      (r) => r.name.toLocaleLowerCase("tr").includes(q) || r.role.toLocaleLowerCase("tr").includes(q)
    );
  }, [recipients, search]);

  const selectedRecipients = recipients.filter((r) => selectedIds.includes(r.userId));

  function toggleRecipient(userId: string) {
    setSelectedIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  function inferAnnouncementMime(file: File): string {
    if (file.type) return file.type;
    const n = file.name.toLowerCase();
    if (n.endsWith(".pdf")) return "application/pdf";
    if (n.endsWith(".png")) return "image/png";
    if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
    if (n.endsWith(".doc")) return "application/msword";
    if (n.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (n.endsWith(".xls")) return "application/vnd.ms-excel";
    if (n.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    return "application/octet-stream";
  }

  function readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Dosya okunamadı"));
      reader.readAsDataURL(file);
    });
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (selectedIds.length === 0) {
      setError("En az bir alıcı seçin.");
      return;
    }
    if (files.length > 3) {
      setError("En fazla 3 dosya eklenebilir.");
      return;
    }
    for (const file of files) {
      if (file.size > 2 * 1024 * 1024) {
        setError(`${file.name} 2 MB üstünde.`);
        return;
      }
    }

    setBusy(true);
    try {
      const attachments = await Promise.all(
        files.map(async (file) => ({
          fileName: file.name,
          mimeType: inferAnnouncementMime(file),
          fileData: await readAsDataUrl(file),
        }))
      );
      const res = await fetch("/api/v1/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          audienceType: "selected",
          audienceRef: { userIds: selectedIds },
          status: publishNow ? "published" : "draft",
          pinned,
          attachments: attachments.length ? attachments : undefined,
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!json.ok) {
        setError(json.error?.message || "Duyuru oluşturulamadı.");
        setBusy(false);
        return;
      }
      setTitle("");
      setBody("");
      setSelectedIds([]);
      setFiles([]);
      router.refresh();
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">Başlık</label>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)] outline-none ring-amber-200 focus:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">İçerik</label>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          required
          rows={3}
          className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-muted)] outline-none ring-amber-200 focus:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        />
      </div>

      <div ref={pickerRef} className="relative">
        <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
          Alıcılar (şahsa özel — en az 1 kişi seçin)
        </label>
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className="flex w-full flex-wrap items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left text-sm outline-none ring-amber-200 focus:ring-2 dark:border-slate-700 dark:bg-slate-900"
        >
          {selectedRecipients.length === 0 ? (
            <span className="text-[var(--color-text-muted)]">Kişi seçmek için tıklayın…</span>
          ) : (
            selectedRecipients.map((r) => (
              <span
                key={r.userId}
                className="flex items-center gap-1 rounded-full bg-[var(--color-primary-soft)] px-2 py-0.5 text-xs font-medium text-[var(--color-primary)]"
              >
                {r.name}
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleRecipient(r.userId);
                  }}
                  className="cursor-pointer text-[var(--color-primary)]/70 hover:text-[var(--color-primary)]"
                  aria-label={`${r.name} kaldır`}
                >
                  ×
                </span>
              </span>
            ))
          )}
        </button>

        {pickerOpen ? (
          <div className="absolute z-30 mt-1 w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-[var(--shadow-md)] dark:border-slate-700 dark:bg-slate-900">
            <div className="border-b border-[var(--color-border)] p-2">
              <input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="İsim veya rol ara…"
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm outline-none dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <div className="max-h-60 overflow-y-auto p-1">
              {filteredRecipients.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-[var(--color-text-muted)]">Sonuç yok.</p>
              ) : (
                filteredRecipients.map((r) => (
                  <label
                    key={r.userId}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--color-surface-muted)] dark:hover:bg-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(r.userId)}
                      onChange={() => toggleRecipient(r.userId)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span className="flex-1">
                      <span className="block text-[var(--color-text)]">{r.name}</span>
                      <span className="block text-[11px] text-[var(--color-text-muted)]">
                        {r.role}
                        {r.subLabel ? ` · ${r.subLabel}` : ""}
                      </span>
                    </span>
                  </label>
                ))
              )}
            </div>
            <div className="flex items-center justify-between border-t border-[var(--color-border)] p-2">
              <span className="text-[11px] text-[var(--color-text-muted)]">{selectedIds.length} kişi seçildi</span>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="rounded-md bg-[var(--color-primary)] px-2.5 py-1 text-xs font-medium text-white"
              >
                Tamam
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
          Ekler (en fazla 3, her biri 2 MB — PDF, JPG, PNG, DOC/DOCX, XLS/XLSX)
        </label>
        <input
          type="file"
          accept={ACCEPT}
          multiple
          onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 3))}
          className="block w-full text-xs text-[var(--color-text-muted)] file:mr-2 file:rounded-md file:border-0 file:bg-[var(--color-surface-muted)] file:px-2 file:py-1"
        />
        {files.length > 0 ? (
          <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">{files.map((f) => f.name).join(", ")}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] dark:text-slate-300">
          <input
            type="checkbox"
            checked={publishNow}
            onChange={(event) => setPublishNow(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Hemen yayınla
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] dark:text-slate-300">
          <input
            type="checkbox"
            checked={pinned}
            onChange={(event) => setPinned(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Sabitle (listenin başında göster)
        </label>
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? "Oluşturuluyor..." : "Duyuru oluştur"}
      </Button>
      {error ? <p className="text-xs font-medium text-rose-600">{error}</p> : null}
    </form>
  );
}
