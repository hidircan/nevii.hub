"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Select } from "@/components/ui";
import { callApi } from "@/components/platform/api";

const ENVS = [
  ["local", "Yerel"],
  ["preview", "Preview"],
  ["test", "Test"],
  ["production", "Production"],
] as const;
const CHECKS = [
  ["unknown", "Bilinmiyor"],
  ["pending", "Bekliyor"],
  ["passed", "Geçti"],
  ["failed", "Başarısız"],
] as const;
const area = "w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm";

function useSubmit() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(body: Record<string, unknown>, okText: string) {
    setBusy(true);
    setMsg(null);
    const res = await callApi("/api/v1/platform/releases", "POST", body);
    setBusy(false);
    if (!res.ok) {
      setMsg({ kind: "err", text: res.error.message });
      return false;
    }
    setMsg({ kind: "ok", text: okText });
    router.refresh();
    return true;
  }
  return { msg, busy, submit };
}

function Msg({ msg }: { msg: { kind: "ok" | "err"; text: string } | null }) {
  if (!msg) return null;
  return (
    <p role={msg.kind === "err" ? "alert" : "status"} className={`text-sm ${msg.kind === "err" ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}>
      {msg.text}
    </p>
  );
}

/** Elle release kaydı. Her commit release değildir — bu form bilinçli bir yayın kararını kaydeder. */
export function ReleaseForm({ tenants }: { tenants: { tenantId: string; name: string }[] }) {
  const { msg, busy, submit } = useSubmit();
  const [f, setF] = useState({
    product: "neviihub",
    name: "",
    version: "",
    sha: "",
    branch: "main",
    prNumber: "",
    prUrl: "",
    environment: "test",
    deploymentUrl: "",
    build: "unknown",
    tests: "unknown",
    migrations: "",
    rollbackTarget: "",
    tenantMode: "all",
    tenantIds: [] as string[],
    modules: "",
    summary: "",
    technicalNotes: "",
    knownRisks: "",
  });
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  return (
    <Card className="space-y-3">
      <h2 className="text-sm font-semibold">Yeni release kaydı (elle)</h2>
      <p className="text-xs text-[var(--color-text-muted)]">Kaynak “manuel” olarak işaretlenir. GitHub/Vercel’den otomatik veri çekilmez.</p>
      <Msg msg={msg} />
      <div className="grid gap-2 sm:grid-cols-4">
        <Select aria-label="Ürün" value={f.product} onChange={(e) => set("product", e.target.value)}>
          <option value="neviihub">NeviiHub (web)</option>
          <option value="neviios">NeviiOS (kontrol merkezi)</option>
        </Select>
        <Input aria-label="Release adı" placeholder="Release adı" value={f.name} onChange={(e) => set("name", e.target.value)} />
        <Input aria-label="Sürüm" placeholder="Sürüm (ör. 1.4.0)" value={f.version} onChange={(e) => set("version", e.target.value)} />
        <Select aria-label="Ortam" value={f.environment} onChange={(e) => set("environment", e.target.value)}>
          {ENVS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        <Input aria-label="Commit SHA" placeholder="Commit SHA" value={f.sha} onChange={(e) => set("sha", e.target.value)} />
        <Input aria-label="Branch" placeholder="Branch" value={f.branch} onChange={(e) => set("branch", e.target.value)} />
        <Input aria-label="PR numarası" placeholder="PR no (ops.)" value={f.prNumber} onChange={(e) => set("prNumber", e.target.value)} />
        <Input aria-label="PR bağlantısı" placeholder="PR URL (ops.)" value={f.prUrl} onChange={(e) => set("prUrl", e.target.value)} />
        <Input aria-label="Deployment URL" placeholder="Deployment URL (ops.)" value={f.deploymentUrl} onChange={(e) => set("deploymentUrl", e.target.value)} />
        <Select aria-label="Build" value={f.build} onChange={(e) => set("build", e.target.value)}>
          {CHECKS.map(([v, l]) => (
            <option key={v} value={v}>
              Build: {l}
            </option>
          ))}
        </Select>
        <Select aria-label="Testler" value={f.tests} onChange={(e) => set("tests", e.target.value)}>
          {CHECKS.map(([v, l]) => (
            <option key={v} value={v}>
              Test: {l}
            </option>
          ))}
        </Select>
        <Input aria-label="Geri dönüş hedefi" placeholder="Rollback hedefi (sürüm/SHA)" value={f.rollbackTarget} onChange={(e) => set("rollbackTarget", e.target.value)} />
      </div>
      <Input aria-label="Migration listesi" placeholder="Migration adları (virgülle; durum: bekliyor)" value={f.migrations} onChange={(e) => set("migrations", e.target.value)} />
      <div className="grid gap-2 sm:grid-cols-2">
        <Input aria-label="Etkilenen modüller" placeholder="Etkilenen modüller (virgülle)" value={f.modules} onChange={(e) => set("modules", e.target.value)} />
        <Select aria-label="Etkilenen kurumlar" value={f.tenantMode} onChange={(e) => set("tenantMode", e.target.value)}>
          <option value="all">Tüm kurumlar</option>
          <option value="some">Seçili kurumlar</option>
        </Select>
      </div>
      {f.tenantMode === "some" ? (
        <div className="flex flex-wrap gap-3 text-sm">
          {tenants.map((t) => (
            <label key={t.tenantId} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={f.tenantIds.includes(t.tenantId)}
                onChange={(e) => setF({ ...f, tenantIds: e.target.checked ? [...f.tenantIds, t.tenantId] : f.tenantIds.filter((x) => x !== t.tenantId) })}
              />
              {t.name}
            </label>
          ))}
        </div>
      ) : null}
      <textarea aria-label="Kullanıcı özeti" className={area} rows={3} placeholder="Kullanıcıya anlaşılır özellik özeti" value={f.summary} onChange={(e) => set("summary", e.target.value)} />
      <textarea aria-label="Teknik detay" className={area} rows={3} placeholder="Teknik detay" value={f.technicalNotes} onChange={(e) => set("technicalNotes", e.target.value)} />
      <textarea aria-label="Bilinen riskler" className={area} rows={2} placeholder="Bilinen riskler" value={f.knownRisks} onChange={(e) => set("knownRisks", e.target.value)} />
      <Button
        disabled={busy}
        onClick={() =>
          submit(
            {
              op: "release_create",
              product: f.product,
              name: f.name,
              version: f.version,
              commit: { sha: f.sha.trim(), branch: f.branch, prNumber: f.prNumber ? Number(f.prNumber) : null, prUrl: f.prUrl || null },
              environment: f.environment,
              deploymentUrl: f.deploymentUrl || null,
              build: f.build,
              tests: f.tests,
              migrations: f.migrations
                .split(",")
                .map((m) => m.trim())
                .filter(Boolean)
                .map((name) => ({ name, status: "pending" })),
              rollbackTarget: f.rollbackTarget || null,
              affectedTenants: f.tenantMode === "all" ? "all" : f.tenantIds,
              affectedModules: f.modules.split(",").map((m) => m.trim()).filter(Boolean),
              summary: f.summary,
              technicalNotes: f.technicalNotes,
              knownRisks: f.knownRisks,
            },
            "Release kaydedildi; denetim kaydı yazıldı."
          )
        }
      >
        Release kaydet
      </Button>
    </Card>
  );
}

export function DeploymentForm({ releases }: { releases: { id: string; label: string }[] }) {
  const { msg, busy, submit } = useSubmit();
  const [f, setF] = useState({ product: "neviihub", provider: "manual", environment: "preview", url: "", commitSha: "", branch: "main", status: "unknown", releaseId: "" });
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });
  return (
    <Card className="space-y-3">
      <h2 className="text-sm font-semibold">Deployment kaydı (elle)</h2>
      <Msg msg={msg} />
      <div className="grid gap-2 sm:grid-cols-4">
        <Select aria-label="Ürün" value={f.product} onChange={(e) => set("product", e.target.value)}>
          <option value="neviihub">NeviiHub</option>
          <option value="neviios">NeviiOS</option>
        </Select>
        <Select aria-label="Sağlayıcı" value={f.provider} onChange={(e) => set("provider", e.target.value)}>
          <option value="manual">Manuel</option>
          <option value="vercel">Vercel (elle girilen)</option>
        </Select>
        <Select aria-label="Ortam" value={f.environment} onChange={(e) => set("environment", e.target.value)}>
          {ENVS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
        <Select aria-label="Durum" value={f.status} onChange={(e) => set("status", e.target.value)}>
          {["unknown", "queued", "building", "ready", "error", "canceled"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Input aria-label="Commit SHA" placeholder="Commit SHA" value={f.commitSha} onChange={(e) => set("commitSha", e.target.value)} />
        <Input aria-label="Branch" placeholder="Branch" value={f.branch} onChange={(e) => set("branch", e.target.value)} />
        <Input aria-label="URL" placeholder="Deployment URL" value={f.url} onChange={(e) => set("url", e.target.value)} />
        <Select aria-label="Bağlı release" value={f.releaseId} onChange={(e) => set("releaseId", e.target.value)}>
          <option value="">Release’e bağlı değil</option>
          {releases.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </Select>
      </div>
      <Button
        disabled={busy}
        onClick={() =>
          submit(
            { op: "deployment_record", ...f, url: f.url || null, commitSha: f.commitSha.trim(), releaseId: f.releaseId || null },
            "Deployment kaydedildi; denetim kaydı yazıldı."
          )
        }
      >
        Deployment kaydet
      </Button>
    </Card>
  );
}
