import { Loader2 } from "lucide-react";

export default function TeacherPortalLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-cyan-50 to-slate-50">
      <div className="flex flex-col items-center gap-2 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-600" />
        <p className="text-sm">Yükleniyor…</p>
      </div>
    </div>
  );
}
