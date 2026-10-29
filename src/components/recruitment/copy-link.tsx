"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

/** Paylaşım bağlantısı — göreli yol + tarayıcı origin'i; kopyala düğmesi. */
export function CopyLink({ path, label }: { path: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOrigin(window.location.origin), []);
  const full = `${origin}${path}`;
  return (
    <div className="flex min-w-0 items-center gap-2">
      {label ? <span className="w-24 shrink-0 text-xs font-medium text-[var(--color-text-muted)]">{label}</span> : null}
      <code className="min-w-0 flex-1 truncate rounded-[var(--radius-sm)] bg-[var(--color-surface-muted)] px-2 py-1 text-xs" title={full}>
        {full}
      </code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(`${window.location.origin}${path}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* pano izni yoksa sessiz */
          }
        }}
        className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] px-2 py-1 text-xs hover:bg-[var(--color-surface-muted)]"
        aria-label="Bağlantıyı kopyala"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-[var(--color-success)]" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Kopyalandı" : "Kopyala"}
      </button>
    </div>
  );
}
