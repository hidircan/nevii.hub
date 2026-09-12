"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Select } from "@/components/ui";
import { callApi } from "@/components/platform/api";

type Session = { id: string; reason: string; startedAt: string; expiresAt: string; endedAt: string | null; status: string };
type View = {
  counts: Record<string, number>;
  branches: { id: string; name: string }[];
  students: { id: string; name: string; branchId: string }[];
};

const STATUS_LABEL: Record<string, string> = { active: "Aktif", expired: "Süresi doldu", ended: "Kapatıldı" };

export function SupportAccessPanel({ tenantId, sessions }: { tenantId: string; sessions: Session[] }) {
  const router = useRouter();
  const base = `/api/v1/platform/tenants/${tenantId}/support`;
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState("60");
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const active = sessions.find((s) => s.status === "active");

  async function open() {
    setError(null);
    const res = await callApi(base, "POST", { reason, durationMinutes: Number(minutes) });
    if (!res.ok) return setError(res.error.message);
    setReason("");
    router.refresh();
  }
  async function end(sessionId: string) {
    const res = await callApi(base, "PATCH", { sessionId });
    if (!res.ok) return setError(res.error.message);
    setView(null);
    router.refresh();
  }
  async function load() {
    setError(null);
    const res = await callApi<View>(`${base}/view`, "GET");
    if (!res.ok) return setError(res.error.message);
    setView(res.data);
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-sm font-semibold">Destek erişimi</h2>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Impersonation değildir: kimliğiniz platform yöneticisi olarak kalır. Gerekçe zorunlu, en fazla 4 saat, salt-okur;
          süre dolunca otomatik kapanır. Açma, kapama ve her görüntüleme denetim kaydına yazılır.
        </p>
        {active ? (
          <div className="mt-3 text-sm">
            <p>
              Aktif oturum · bitiş: <strong>{new Date(active.expiresAt).toLocaleString("tr-TR")}</strong>
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">Gerekçe: {active.reason}</p>
            <div className="mt-2 flex gap-2">
              <Button variant="secondary" onClick={() => void load()}>Kurum verisini görüntüle</Button>
              <Button variant="danger" onClick={() => void end(active.id)}>Oturumu kapat</Button>
            </div>
          </div>
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <Input aria-label="Gerekçe" placeholder="Gerekçe (en az 15 karakter, örn. destek talebi #123)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Select aria-label="Süre" value={minutes} onChange={(e) => setMinutes(e.target.value)}>
              {[15, 30, 60, 120, 240].map((m) => (
                <option key={m} value={m}>
                  {m} dk
                </option>
              ))}
            </Select>
            <Button onClick={() => void open()}>Erişim aç</Button>
          </div>
        )}
        {error ? <p role="alert" className="mt-2 text-sm text-[var(--color-danger)]">{error}</p> : null}
      </Card>
      {view ? (
        <Card>
          <h2 className="text-sm font-semibold">Salt-okur kurum özeti</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {Object.entries(view.counts).map(([k, v]) => `${k}: ${v}`).join(" · ")}
          </p>
          <ul className="mt-2 max-h-64 overflow-auto text-sm">
            {view.students.map((s) => (
              <li key={s.id}>
                {s.name} <span className="text-xs text-[var(--color-text-muted)]">· {view.branches.find((b) => b.id === s.branchId)?.name ?? s.branchId}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      <Card>
        <h2 className="text-sm font-semibold">Geçmiş</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {sessions.length === 0 ? <li className="text-[var(--color-text-muted)]">Kayıt yok</li> : null}
          {sessions.map((s) => (
            <li key={s.id} className="text-[var(--color-text-muted)]">
              {new Date(s.startedAt).toLocaleString("tr-TR")} · {STATUS_LABEL[s.status] ?? s.status} · {s.reason}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
