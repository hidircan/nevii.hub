"use client";

import { useMemo, useState } from "react";
import { Button, Card, Input, Select } from "@/components/ui";
import { ConfirmBar } from "@/components/platform/confirm-dialog";
import { SETTING_CATEGORY_LABELS, SOURCE_SCOPE_LABELS } from "@/lib/platform/catalog";
import type { ResolvedSetting, SettingCategory } from "@/lib/platform/types";

type Props = {
  settings: ResolvedSetting[];
  endpoint: string;
  targetLabel: string;
  /** Kurum paneli: platformOnly ayarlar salt-okur gösterilir (sunucu da reddeder). */
  lockPlatformOnly?: boolean;
  /** Override kaldırma (DELETE endpoint) — üst katmandan miras. */
  allowReset?: boolean;
};

type Draft = string | boolean | number | string[];

export function SettingsEditor({ settings: initial, endpoint, targetLabel, lockPlatformOnly, allowReset }: Props) {
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [confirm, setConfirm] = useState<{ key: string; value: unknown; reset?: boolean } | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<SettingCategory, ResolvedSetting[]>();
    for (const s of rows) {
      const list = map.get(s.category) ?? [];
      list.push(s);
      map.set(s.category, list);
    }
    return map;
  }, [rows]);

  async function persist(key: string, value: unknown, confirmed: boolean, reset = false) {
    setError(null);
    setPendingKey(key);
    try {
      const res = await fetch(endpoint, {
        method: reset ? "DELETE" : "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reset ? { key, confirm: confirmed } : { key, value, confirm: confirmed }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { setting: ResolvedSetting };
        error?: { message: string; details?: { requiresConfirm?: boolean } };
      };
      if (!json.ok) {
        if (json.error?.details?.requiresConfirm && !confirmed) {
          setConfirm({ key, value, reset });
          return;
        }
        setError(json.error?.message ?? "Kayıt başarısız");
        return;
      }
      if (json.data?.setting) {
        setRows((prev) => prev.map((r) => (r.key === key ? json.data!.setting : r)));
        setDrafts((d) => {
          const next = { ...d };
          delete next[key];
          return next;
        });
      }
      setConfirm(null);
    } catch {
      setError("Ağ hatası");
    } finally {
      setPendingKey(null);
    }
  }

  function currentValue(row: ResolvedSetting): unknown {
    if (drafts[row.key] !== undefined) return drafts[row.key];
    return row.effectiveValue;
  }

  /** json ayarlar metin olarak düzenlenir; kaydederken ayrıştırılır, sunucu şemayla doğrular. */
  function valueForSave(row: ResolvedSetting): unknown {
    const v = currentValue(row);
    if (row.type !== "json" || typeof v !== "string") return v;
    try {
      return JSON.parse(v);
    } catch {
      return Symbol.for("invalid-json");
    }
  }

  function save(row: ResolvedSetting) {
    const v = valueForSave(row);
    if (v === Symbol.for("invalid-json")) {
      setError(`${row.key}: geçerli bir JSON girin.`);
      return;
    }
    void persist(row.key, v, false);
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--color-text-muted)]">
        Hedef: <strong className="text-[var(--color-text)]">{targetLabel}</strong>
      </p>
      {error ? (
        <p className="text-sm text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      ) : null}
      {[...grouped.entries()].map(([category, list]) => (
        <Card key={category}>
          <h2 className="mb-4 text-sm font-semibold text-[var(--color-text)]">
            {SETTING_CATEGORY_LABELS[category]}
          </h2>
          <div className="space-y-4">
            {list.map((row) => {
              const value = currentValue(row);
              const id = `setting-${row.key}`;
              const locked = Boolean(lockPlatformOnly && row.platformOnly);
              return (
                <div key={row.key} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div>
                    <label htmlFor={id} className="mb-1 block text-xs font-medium text-[var(--color-text-muted)]">
                      {row.description}
                    </label>
                    {row.type === "json" ? (
                      <textarea
                        id={id}
                        disabled={locked}
                        rows={Math.min(14, JSON.stringify(row.effectiveValue, null, 2).split("\n").length + 1)}
                        spellCheck={false}
                        className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 font-mono text-xs"
                        value={typeof value === "string" ? value : JSON.stringify(value, null, 2)}
                        onChange={(e) => setDrafts((d) => ({ ...d, [row.key]: e.target.value }))}
                      />
                    ) : row.type === "boolean" ? (
                      <Select
                        id={id}
                        disabled={locked}
                        aria-label={row.description}
                        value={String(value)}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [row.key]: e.target.value === "true" }))
                        }
                      >
                        <option value="true">Açık</option>
                        <option value="false">Kapalı</option>
                      </Select>
                    ) : row.type === "enum" && row.enumValues?.length ? (
                      <Select
                        id={id}
                        disabled={locked}
                        value={String(value ?? "")}
                        onChange={(e) => setDrafts((d) => ({ ...d, [row.key]: e.target.value }))}
                      >
                        {row.enumValues.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </Select>
                    ) : row.type === "number" ? (
                      <Input
                        id={id}
                        disabled={locked}
                        type="number"
                        value={String(value ?? "")}
                        onChange={(e) => setDrafts((d) => ({ ...d, [row.key]: Number(e.target.value) }))}
                      />
                    ) : (
                      <Input
                        id={id}
                        disabled={locked}
                        value={Array.isArray(value) ? value.join(",") : String(value ?? "")}
                        onChange={(e) =>
                          setDrafts((d) => ({
                            ...d,
                            [row.key]:
                              row.type === "string_list"
                                ? e.target.value.split(",").map((x) => x.trim()).filter(Boolean)
                                : e.target.value,
                          }))
                        }
                      />
                    )}
                    <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                      Kaynak: {SOURCE_SCOPE_LABELS[row.sourceScope]} · {row.key}
                      {row.enumValues?.length && row.type === "string_list" ? ` · seçenekler: ${row.enumValues.join(", ")}` : ""}
                      {locked ? " · NeviiOS tarafından yönetilir" : ""}
                      {row.critical ? " · kritik" : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {allowReset && !locked && (row.sourceScope === "tenant" || row.sourceScope === "branch") ? (
                      <Button
                        variant="ghost"
                        disabled={pendingKey === row.key}
                        onClick={() => void persist(row.key, null, false, true)}
                      >
                        Sıfırla
                      </Button>
                    ) : null}
                    <Button variant="secondary" disabled={locked || pendingKey === row.key} onClick={() => save(row)}>
                      Kaydet
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ))}
      <ConfirmBar
        open={Boolean(confirm)}
        title="Kritik ayar değişikliği"
        description={`${targetLabel} için bu ayar denetim kaydı üretir. Onaylıyor musunuz?`}
        pending={Boolean(pendingKey)}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && void persist(confirm.key, confirm.value, true, confirm.reset)}
      />
    </div>
  );
}
