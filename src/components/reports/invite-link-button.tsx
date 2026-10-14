"use client";

import { useState } from "react";
import { apiFetchJson } from "@/lib/api/client-fetch";
import { Button } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { reportErrorMessage } from "./form-parts";

/** Yönetici: öğrenci seç → kişiye özel 14 günlük değerlendirme bağlantısı üret → kopyala / WhatsApp ile paylaş (insan gönderir). */
export function InviteLinkCreator({ students }: { students: { id: string; name: string }[] }) {
  const [studentId, setStudentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<{ url: string; expiresAt: string; inviteId: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function create() {
    if (!studentId) return setError("Önce bir öğrenci seçin.");
    setBusy(true);
    setError(null);
    setCopied(false);
    const r = await apiFetchJson<{ url: string; expiresAt: string; inviteId: string }>("/api/v1/feedback-invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId }),
    });
    setBusy(false);
    if (!r.ok) return setError(reportErrorMessage(r.error, "Bağlantı oluşturulamadı. Tekrar deneyin."));
    setLink({ ...r.data, name: students.find((s) => s.id === studentId)?.name ?? "" });
  }

  async function revoke() {
    if (!link) return;
    setBusy(true);
    const r = await apiFetchJson(`/api/v1/feedback-invites/${encodeURIComponent(link.inviteId)}/revoke`, { method: "POST" });
    setBusy(false);
    if (!r.ok) return setError(reportErrorMessage(r.error, "Bağlantı iptal edilemedi."));
    setLink(null);
  }

  const message = link
    ? `Merhaba, ${link.name} için öğretmen değerlendirme formumuz: ${link.url} (bağlantı ${formatDate(link.expiresAt)} tarihine kadar geçerlidir).`
    : "";

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="davet-ogrenci">
          Öğrenci
        </label>
        <select
          id="davet-ogrenci"
          value={studentId}
          onChange={(e) => {
            setStudentId(e.target.value);
            setLink(null);
          }}
          className="min-h-10 flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)]"
        >
          <option value="">Öğrenci seçin…</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <Button onClick={() => void create()} disabled={busy}>
          {busy ? "Hazırlanıyor…" : "Bağlantı oluştur"}
        </Button>
      </div>
      {error ? <p className="text-sm font-medium text-[var(--color-danger)]">{error}</p> : null}
      {link ? (
        <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3">
          <p className="break-all font-mono text-xs text-[var(--color-text)]">{link.url}</p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {formatDate(link.expiresAt)} tarihine kadar geçerli. Bu öğrencinin önceki bağlantısı iptal edildi. Bağlantı bir daha
            gösterilmez; kaybolursa yenisini oluşturun.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(link.url).then(() => setCopied(true), () => setCopied(false));
              }}
            >
              {copied ? "Kopyalandı" : "Kopyala"}
            </Button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-3.5 py-2 text-sm font-medium text-[var(--color-text)]"
            >
              WhatsApp ile paylaş
            </a>
            <Button variant="ghost" onClick={() => void revoke()} disabled={busy}>
              İptal et
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Sabit linkler (öğretmen formu / öğrenci değerlendirmesi) için kopyalama kutusu. */
export function CopyLinkField({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
        <p className="truncate font-mono text-sm text-[var(--color-text)]">{url}</p>
      </div>
      <Button
        variant="secondary"
        onClick={() => {
          void navigator.clipboard?.writeText(url).then(() => setCopied(true), () => setCopied(false));
        }}
      >
        {copied ? "Kopyalandı" : "Kopyala"}
      </Button>
    </div>
  );
}
