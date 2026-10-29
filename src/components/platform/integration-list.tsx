"use client";

import { useState } from "react";
import { Button, Card, Input } from "@/components/ui";
import { ConfirmBar } from "@/components/platform/confirm-dialog";
import type { PublicIntegration } from "@/lib/platform/integrations";

export function IntegrationList({
  integrations: initial,
  endpoint,
  allowSecrets,
  targetLabel,
}: {
  integrations: PublicIntegration[];
  endpoint: string;
  allowSecrets: boolean;
  targetLabel: string;
}) {
  const [rows, setRows] = useState(initial);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [confirmProvider, setConfirmProvider] = useState<string | null>(null);

  async function save(provider: string, confirmed: boolean) {
    setError(null);
    setNotice(null);
    setPending(provider);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          secret: secrets[provider] || undefined,
          confirm: confirmed,
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { integration: PublicIntegration; notice?: string };
        error?: { message: string; details?: { requiresConfirm?: boolean } };
      };
      if (!json.ok) {
        if (json.error?.details?.requiresConfirm && !confirmed) {
          setConfirmProvider(provider);
          return;
        }
        setError(json.error?.message ?? "Kayıt başarısız");
        return;
      }
      if (json.data?.integration) {
        setRows((prev) => prev.map((r) => (r.provider === provider ? json.data!.integration : r)));
      }
      if (json.data?.notice) setNotice(json.data.notice);
      setSecrets((s) => ({ ...s, [provider]: "" }));
      setConfirmProvider(null);
    } catch {
      setError("Ağ hatası");
    } finally {
      setPending(null);
    }
  }

  async function test(provider: string) {
    setError(null);
    setPending(provider);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { integration: PublicIntegration };
        error?: { message: string };
      };
      if (!json.ok) {
        setError(json.error?.message ?? "Test başarısız");
        return;
      }
      if (json.data?.integration) {
        setRows((prev) => prev.map((r) => (r.provider === provider ? json.data!.integration : r)));
      }
    } catch {
      setError("Ağ hatası");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-text-muted)]">Kapsam: {targetLabel}</p>
      {error ? (
        <p className="text-sm text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p className="text-sm text-[var(--color-warning)]">{notice}</p> : null}
      {rows.map((row) => {
        const secretId = `secret-${row.provider}`;
        return (
          <Card key={row.provider}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[var(--color-text)]">{row.label}</h3>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]" title={row.status}>
                  Durum: {row.status === "connected" ? "Bağlı" : row.status === "error" ? "Hatalı" : "Yapılandırılmadı"}
                  {row.envConfigured ? " · ortam ayarı var" : " · ortam ayarı yok"}
                  {row.secretLast4 ? ` · ****${row.secretLast4}` : ""}
                  {row.lastVerifiedAt ? ` · son doğrulama ${row.lastVerifiedAt}` : ""}
                </p>
              </div>
              <Button variant="secondary" disabled={pending === row.provider} onClick={() => void test(row.provider)}>
                Bağlantıyı dene
              </Button>
            </div>
            {allowSecrets ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <label htmlFor={secretId} className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
                    Gizli anahtar (yalnız kaydet, asla listelenmez)
                  </label>
                  <Input
                    id={secretId}
                    type="password"
                    autoComplete="off"
                    value={secrets[row.provider] ?? ""}
                    onChange={(e) => setSecrets((s) => ({ ...s, [row.provider]: e.target.value }))}
                  />
                </div>
                <Button
                  variant="secondary"
                  disabled={pending === row.provider || !(secrets[row.provider] ?? "").trim()}
                  onClick={() => void save(row.provider, false)}
                >
                  Kaydet
                </Button>
              </div>
            ) : (
              <p className="mt-3 text-xs text-[var(--color-text-muted)]">
                Global gizli anahtarlar bu ekranda gösterilmez. Kurum, kendi sağlayıcı durumunu görür.
              </p>
            )}
          </Card>
        );
      })}
      <ConfirmBar
        open={Boolean(confirmProvider)}
        title="Gizli anahtar kaydı"
        description="Anahtar düz metin olarak saklanmaz. PLATFORM_ENCRYPTION_KEY yoksa yalnızca son dört karakter izlenir."
        pending={Boolean(pending)}
        onCancel={() => setConfirmProvider(null)}
        onConfirm={() => confirmProvider && void save(confirmProvider, true)}
      />
    </div>
  );
}
