import { CalendarClock, CheckCircle2, ClipboardCheck, RefreshCcw, XCircle } from "lucide-react";
import { ATTENDED_PLANNED_MAKEUP_LABEL, type LessonFinalStatus } from "@/lib/lesson-live-status";
import { PlannedMakeupMarker } from "./planned-makeup-marker";

const PRESENTATION: Record<LessonFinalStatus, { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  planned: { label: "Planlandı", className: "bg-slate-100 text-slate-700", Icon: CalendarClock },
  attended: { label: "Geldi", className: "bg-emerald-100 text-emerald-800", Icon: CheckCircle2 },
  processed: { label: "İşlendi", className: "bg-rose-100 text-rose-900", Icon: ClipboardCheck },
  makeup: { label: "Telafi", className: "bg-amber-100 text-amber-900", Icon: RefreshCcw },
  makeup_planned: { label: "Planlanan telafi", className: "bg-[#e5fb57] text-slate-900", Icon: RefreshCcw },
  cancelled: { label: "İptal", className: "bg-slate-700 text-white", Icon: XCircle },
};

/**
 * `plannedMakeup` = ders Telafi Merkezi'nden planlanan telafi dersi (`lesson.type === "makeup"`). Yalnız
 * "Geldi" (attended) ile birlikte anlam taşır: aynı yeşil + "Planlanan telafiye geldi" + T işareti.
 */
export function LessonStatusBadge({ status, plannedMakeup = false }: { status: LessonFinalStatus; plannedMakeup?: boolean }) {
  const presentation = PRESENTATION[status];
  const Icon = presentation.Icon;
  const attendedMakeup = status === "attended" && plannedMakeup;
  const label = attendedMakeup ? ATTENDED_PLANNED_MAKEUP_LABEL : presentation.label;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${presentation.className}`}
      aria-label={`Ders durumu: ${label}`}
      title={`Ders durumu: ${label}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
      {attendedMakeup ? <PlannedMakeupMarker /> : null}
    </span>
  );
}