"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Select } from "@/components/ui";
import { ConfirmBar } from "@/components/platform/confirm-dialog";
import { callApi } from "@/components/platform/api";

function useAction(tenantId: string) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  async function run(path: string, method: string, body: unknown, success: string) {
    setPending(true);
    setError(null);
    setNotice(null);
    const res = await callApi<Record<string, unknown>>(`/api/v1/platform/tenants/${tenantId}${path}`, method, body);
    setPending(false);
    if (!res.ok) {
      setError(res.error.message);
      return null;
    }
    setNotice(success);
    router.refresh();
    return res.data;
  }
  return { pending, error, notice, run };
}

function Status({ error, notice }: { error: string | null; notice: string | null }) {
  if (error) return <p role="alert" className="mt-2 text-sm text-[var(--color-danger)]">{error}</p>;
  if (notice) return <p role="status" className="mt-2 text-sm text-[var(--color-success)]">{notice}</p>;
  return null;
}

/** Paket değişikliği — kritik, onaylı; veriler silinmez, yalnız yeni işlemler limitlenir. */
export function PlanSelector({ tenantId, current, plans }: { tenantId: string; current: string; plans: { key: string; label: string }[] }) {
  const [plan, setPlan] = useState(current);
  const [confirming, setConfirming] = useState(false);
  const a = useAction(tenantId);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Paket" value={plan} onChange={(e) => setPlan(e.target.value)}>
          {plans.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </Select>
        <Button disabled={plan === current || a.pending} onClick={() => setConfirming(true)}>
          Paketi değiştir
        </Button>
      </div>
      <Status error={a.error} notice={a.notice} />
      <ConfirmBar
        open={confirming}
        title="Paket değişikliği"
        description="Mevcut veriler silinmez. Yeni paketin dışındaki modüller kapanır ve limit üstü yeni kayıt/davet engellenir. Denetim kaydı yazılır."
        pending={a.pending}
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          await a.run("", "PATCH", { planKey: plan, confirm: true }, "Paket güncellendi.");
          setConfirming(false);
        }}
      />
    </div>
  );
}

const LIFECYCLE_ACTIONS: { value: string; label: string }[] = [
  { value: "active", label: "Aktifleştir" },
  { value: "suspended", label: "Askıya al" },
  { value: "archived", label: "Arşivle (geri alınamaz)" },
];

/** Yaşam döngüsü — askı/arşiv kurum kullanıcılarının girişini ve oturum yenilemesini durdurur. */
export function LifecycleControl({ tenantId, lifecycle }: { tenantId: string; lifecycle: string }) {
  const [target, setTarget] = useState<string | null>(null);
  const a = useAction(tenantId);
  if (lifecycle === "draft" || lifecycle === "provisioning") return null;
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {LIFECYCLE_ACTIONS.filter((x) => x.value !== lifecycle && lifecycle !== "archived").map((x) => (
          <Button key={x.value} variant={x.value === "active" ? "success" : "danger"} disabled={a.pending} onClick={() => setTarget(x.value)}>
            {x.label}
          </Button>
        ))}
      </div>
      <Status error={a.error} notice={a.notice} />
      <ConfirmBar
        open={Boolean(target)}
        title="Kurum durumu değişikliği"
        description="Askıya alınan veya arşivlenen kurumun kullanıcıları giriş yapamaz ve oturumları yenilenmez. Veriler silinmez."
        pending={a.pending}
        onCancel={() => setTarget(null)}
        onConfirm={async () => {
          await a.run("", "PATCH", { lifecycle: target, confirm: true }, "Kurum durumu güncellendi.");
          setTarget(null);
        }}
      />
    </div>
  );
}

/** Taslak kurumu kurar; ham davet bağlantısı yalnız bir kez gösterilir (e-posta gönderilmez). */
export function ProvisionPanel({ tenantId, lifecycle }: { tenantId: string; lifecycle: string }) {
  const a = useAction(tenantId);
  const [invitePath, setInvitePath] = useState<string | null>(null);
  if (lifecycle !== "draft" && lifecycle !== "provisioning") return null;
  return (
    <div>
      <Button
        disabled={a.pending}
        onClick={async () => {
          const data = await a.run("/provision", "POST", { retry: lifecycle === "provisioning" }, "Kurum kuruldu.");
          if (data?.invitePath) setInvitePath(String(data.invitePath));
        }}
      >
        {a.pending ? "Kuruluyor…" : lifecycle === "provisioning" ? "Kurulumu yeniden dene" : "Kurumu kur"}
      </Button>
      <Status error={a.error} notice={a.notice} />
      {invitePath ? <InviteLink path={invitePath} /> : null}
    </div>
  );
}

export function InviteLink({ path }: { path: string }) {
  const url = typeof window === "undefined" ? path : `${window.location.origin}${path}`;
  return (
    <div className="mt-3 rounded-[var(--radius-md)] border p-3 text-xs" style={{ borderColor: "var(--color-border)" }}>
      <p className="font-semibold text-[var(--color-text)]">Tek seferlik davet bağlantısı</p>
      <p className="mt-1 text-[var(--color-text-muted)]">
        Bu bağlantı bir daha gösterilmez; sistem e-posta göndermez. Güvenli kanaldan iletin.
      </p>
      <code className="mt-2 block break-all">{url}</code>
    </div>
  );
}
