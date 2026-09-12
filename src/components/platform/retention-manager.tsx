"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input } from "@/components/ui";
import { callApi } from "@/components/platform/api";
import type { RetentionReport, ScheduledJobDefinition } from "@/lib/platform/retention";

type Policy = {
  category: string;
  label: string;
  store: string;
  critical: boolean;
  action: string;
  description: string;
  retentionDays: number | null;
  editable: boolean;
};

const ACTION: Record<string, string> = {
  keep_forever: "Asla silinmez",
  delete: "Süre sonunda silinir",
  aggregate_then_delete: "Sayılır (özet audit'e) → silinir",
  not_persisted: "Kalıcı yazılmaz",
};

export function RetentionManager({ policies, jobs, storeMode }: { policies: Policy[]; jobs: ScheduledJobDefinition[]; storeMode: string }) {
  const router = useRouter();
  const [days, setDays] = useState<Record<string, string>>(Object.fromEntries(policies.filter((p) => p.editable).map((p) => [p.category, String(p.retentionDays ?? "")])));
  const [reason, setReason] = useState("");
  const [report, setReport] = useState<RetentionReport | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function run(dryRun: boolean) {
    setMsg(null);
    const res = await callApi<RetentionReport>("/api/v1/platform/retention", "POST", { op: "run", dryRun, confirm: !dryRun });
    if (!res.ok) return setMsg({ kind: "err", text: res.error.message });
    setReport(res.data);
    setMsg({ kind: "ok", text: dryRun ? "Dry-run tamamlandı — hiçbir kayıt silinmedi; rapor audit'e yazıldı." : `Temizlik tamamlandı: ${res.data.totalDeleted} kayıt silindi.` });
  }

  return (
    <div className="space-y-4">
      {msg ? (
        <p role={msg.kind === "err" ? "alert" : "status"} className={`text-sm ${msg.kind === "err" ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}>
          {msg.text}
        </p>
      ) : null}
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b text-xs text-[var(--color-text-muted)]" style={{ borderColor: "var(--color-border)" }}>
              <th className="px-4 py-2">Log türü</th>
              <th>Depo</th>
              <th>Politika</th>
              <th>Saklama (gün)</th>
            </tr>
          </thead>
          <tbody>
            {policies.map((p) => (
              <tr key={p.category} className="border-b align-top" style={{ borderColor: "var(--color-border)" }}>
                <td className="px-4 py-2">
                  <strong>{p.label}</strong> {p.critical ? <span className="text-xs text-[var(--color-danger)]">kritik</span> : null}
                  <span className="block text-xs text-[var(--color-text-muted)]">{p.description}</span>
                </td>
                <td className="text-xs">{p.store}</td>
                <td>{ACTION[p.action] ?? p.action}</td>
                <td>
                  {p.editable ? (
                    <Input aria-label={`${p.label} saklama günü`} type="number" min={7} max={3650} value={days[p.category] ?? ""} onChange={(e) => setDays({ ...days, [p.category]: e.target.value })} />
                  ) : p.critical ? (
                    "∞"
                  ) : (
                    (p.retentionDays ?? "—")
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap gap-2 p-4">
          <Input className="max-w-md" aria-label="Gerekçe" placeholder="Politika değişikliği gerekçesi" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button
            variant="secondary"
            onClick={async () => {
              setMsg(null);
              const value = Object.fromEntries(Object.entries(days).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)]));
              const res = await callApi("/api/v1/platform/retention", "POST", { op: "policy", days: value, reason, confirm: true });
              if (!res.ok) return setMsg({ kind: "err", text: res.error.message });
              setMsg({ kind: "ok", text: "Politika kaydedildi: yeni sürüm + denetim kaydı." });
              router.refresh();
            }}
          >
            Politikayı kaydet
          </Button>
        </div>
      </Card>
      <Card className="space-y-2">
        <h2 className="text-sm font-semibold">Temizlik işi</h2>
        <p className="text-xs text-[var(--color-text-muted)]">
          Depo modu: {storeMode}. Önce dry-run ile etkiyi görün; gerçek silme yalnız onayla ve yalnız allowlist’teki kayıtlarda çalışır.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => run(true)}>
            Dry-run çalıştır
          </Button>
          <Button
            variant="danger"
            disabled={!report || !report.dryRun}
            onClick={() => {
              if (window.confirm(`${report?.totalAffected ?? 0} kayıt kalıcı silinecek. Kritik audit kayıtları dokunulmaz. Onaylıyor musunuz?`)) void run(false);
            }}
          >
            Onayla ve temizle
          </Button>
        </div>
        {report ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-[var(--color-text-muted)]">
                <th className="py-1 text-left">Kategori</th>
                <th className="text-left">Kesme</th>
                <th className="text-right">Etkilenecek</th>
                <th className="text-right">Silinen</th>
              </tr>
            </thead>
            <tbody>
              {report.categories.map((c) => (
                <tr key={c.category} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                  <td className="py-1">
                    {c.label}
                    <span className="block text-xs text-[var(--color-text-muted)]">{c.note}</span>
                  </td>
                  <td className="text-xs">{c.cutoff ? new Date(c.cutoff).toLocaleDateString("tr-TR") : "—"}</td>
                  <td className="text-right">{c.affected}</td>
                  <td className="text-right">{c.deleted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Card>
      <Card>
        <h2 className="text-sm font-semibold">Zamanlanmış iş sözleşmesi</h2>
        <p className="text-xs text-[var(--color-text-muted)]">Gerçek cron bu sürümde kurulmadı; deploy’da Vercel Cron veya harici zamanlayıcı bu tanımla çağırır.</p>
        <ul className="mt-2 space-y-1 text-sm">
          {jobs.map((j) => (
            <li key={j.id}>
              <code>{j.id}</code> · <code>{j.schedule}</code> · {j.method} <code>{j.endpoint}</code> · Bearer ${j.secretEnv} · varsayılan {j.defaultDryRun ? "dry-run (?apply=1 ile sil)" : "uygula"}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
