"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { ConfirmBar } from "@/components/platform/confirm-dialog";
import type { ResolvedFeatureFlag } from "@/lib/platform/types";

/** Sunucudaki canManageInstitutionFeatures ile aynı kural (yalnız UI; sunucu yine doğrular). */
function canToggleFor(role: FeatureActorRole, f: ResolvedFeatureFlag): boolean {
  if (f.locked) return false;
  if (!f.enabled && !f.entitled) return false;
  if (role === "HYPER_ADMIN") return true;
  if (role === "SUPER_ADMIN") return f.institutionManageable;
  return f.institutionManageable && !f.critical;
}

export type FeatureActorRole = "HYPER_ADMIN" | "SUPER_ADMIN" | "SCHOOL_ADMIN";

const ENTITLEMENT_LABEL: Record<ResolvedFeatureFlag["entitlementSource"], string> = {
  plan: "pakette",
  addon: "eklenti",
  override: "platform özel izni",
  none: "pakette yok",
};

export function FeatureToggles({
  features: initial,
  endpoint,
  targetLabel,
  actorRole,
}: {
  features: ResolvedFeatureFlag[];
  endpoint: string;
  targetLabel: string;
  actorRole: FeatureActorRole;
}) {
  const canToggle = (f: ResolvedFeatureFlag) => canToggleFor(actorRole, f);
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ResolvedFeatureFlag | null>(null);

  async function persist(flag: ResolvedFeatureFlag, enabled: boolean, confirmed: boolean) {
    setError(null);
    setPending(flag.key);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flag: flag.key, enabled, confirm: confirmed }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { feature: ResolvedFeatureFlag };
        error?: { message: string; details?: { requiresConfirm?: boolean } };
      };
      if (!json.ok) {
        if (json.error?.details?.requiresConfirm && !confirmed) {
          setConfirm(flag);
          return;
        }
        setError(json.error?.message ?? "Kayıt başarısız");
        return;
      }
      if (json.data?.feature) {
        setRows((prev) => prev.map((r) => (r.key === flag.key ? json.data!.feature : r)));
      }
      setConfirm(null);
    } catch {
      setError("Ağ hatası");
    } finally {
      setPending(null);
    }
  }

  return (
    <Card>
      <p className="mb-4 text-sm text-[var(--color-text-muted)]">
        Hedef kurum: <strong className="text-[var(--color-text)]">{targetLabel}</strong>
      </p>
      {error ? (
        <p className="mb-3 text-sm text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="divide-y" style={{ borderColor: "var(--color-border)" }}>
        {rows.map((flag) => {
          const disabled = !canToggle(flag) || flag.locked || pending === flag.key;
          return (
            <li key={flag.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">{flag.label}</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {flag.description}
                  {flag.locked ? " · zorunlu" : ""}
                  {flag.critical ? " · kritik" : ""} · ticari hak: {ENTITLEMENT_LABEL[flag.entitlementSource]} · kaynak:{" "}
                  {flag.sourceScope}
                </p>
              </div>
              <Button
                variant={flag.enabled ? "success" : "secondary"}
                disabled={disabled}
                aria-pressed={flag.enabled}
                onClick={() => void persist(flag, !flag.enabled, false)}
              >
                {flag.enabled ? "Açık" : "Kapalı"}
              </Button>
            </li>
          );
        })}
      </ul>
      <ConfirmBar
        open={Boolean(confirm)}
        title="Kritik özellik değişikliği"
        description={`${targetLabel} için ${confirm?.label ?? "bu modül"} değişecek ve denetim kaydı yazılacak.`}
        pending={Boolean(pending)}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && void persist(confirm, !confirm.enabled, true)}
      />
    </Card>
  );
}
