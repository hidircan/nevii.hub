import { Loader2 } from "lucide-react";

export default function PanelLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-2 text-[var(--color-text-muted)]">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-primary)]" />
        <p className="text-sm">Yükleniyor…</p>
      </div>
    </div>
  );
}
