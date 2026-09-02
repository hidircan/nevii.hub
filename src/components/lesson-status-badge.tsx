import { CalendarClock, CheckCircle2, ClipboardCheck, RefreshCcw, XCircle } from "lucide-react";
import type { LessonFinalStatus } from "@/lib/lesson-live-status";

const PRESENTATION: Record<LessonFinalStatus, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  planned: { label: "Planlandı", className: "bg-slate-100 text-slate-700", Icon: CalendarClock },
  attended: { label: "Geldi", className: "bg-emerald-100 text-emerald-800", Icon: CheckCircle2 },
  processed: { label: "İşlendi", className: "bg-amber-100 text-amber-900", Icon: ClipboardCheck },
  makeup: { label: "Telafi", className: "bg-rose-100 text-rose-800", Icon: RefreshCcw },
  cancelled: { label: "İptal", className: "bg-slate-700 text-white", Icon: XCircle },
};

export function LessonStatusBadge({ status }: { status: LessonFinalStatus }) {
  const presentation = PRESENTATION[status];
  const Icon = presentation.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${presentation.className}`}
      aria-label={`Ders durumu: ${presentation.label}`}
      title={`Ders durumu: ${presentation.label}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {presentation.label}
    </span>
  );
}