"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Select } from "@/components/ui";
import { callApi } from "@/components/platform/api";
import type { PolicyVersion } from "@/lib/platform/types";

type Preview = { before: unknown; after: unknown; changedKeys: string[]; notes: string[]; blockers: string[]; draft: PolicyVersion };

const STATUS_LABEL: Record<string, string> = { draft: "Taslak", published: "Yayında", superseded: "Önceki", discarded: "Vazgeçildi" };

function fmt(v: unknown): string {
  return v === null ? "null (üst katmandan miras)" : JSON.stringify(v, null, 2);
}

/**
 * Kritik politika sürümleri. Yayın ve geri alma sunucuda doğrulanır ve
 * audit'lenir; geri alma eski sürümü silmez, yeni sürüm üretir.
 */
export function PolicyVersionsPanel({
  scope,
  versions,
  draftKeys,
  currentValues,
}: {
  scope: string;
  versions: PolicyVersion[];
  draftKeys: string[];
  currentValues: Record<string, unknown>;
}) {
  const router = useRouter();
  const api = `/api/v1/platform/policies?scope=${encodeURIComponent(scope)}`;
  const [key, setKey] = useState(draftKeys[0] ?? "");
  const [value, setValue] = useState(() => fmt(currentValues[draftKeys[0] ?? ""] ?? null));
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [rollbackReason, setRollbackReason] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const byKey = useMemo(() => {
    const m = new Map<string, PolicyVersion[]>();
    for (const v of versions) m.set(v.key, [...(m.get(v.key) ?? []), v]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [versions]);

  async function run<T>(body: Record<string, unknown>): Promise<T | null> {
    setMsg(null);
    const res = await callApi<T>(api, "POST", body);
    if (!res.ok) {
      setMsg({ kind: "err", text: res.error.message });
      return null;
    }
    return res.data;
  }

  async function createDraft() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      return setMsg({ kind: "err", text: "Değer geçerli JSON olmalı (metin için tırnak kullanın)." });
    }
    const d = await run<{ draft: PolicyVersion }>({ op: "draft", key, value: parsed, reason });
    if (!d) return;
    const p = await run<Preview>({ op: "preview", draftId: d.draft.id });
    if (p) setPreview(p);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {msg ? (
        <p role={msg.kind === "err" ? "alert" : "status"} className={`text-sm ${msg.kind === "err" ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}>
          {msg.text}
        </p>
      ) : null}
      {draftKeys.length ? (
        <Card>
          <h2 className="text-sm font-semibold">Yeni taslak</h2>
          <div className="mt-2 grid gap-2">
            <Select
              aria-label="Politika anahtarı"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setValue(fmt(currentValues[e.target.value] ?? null));
                setPreview(null);
              }}
            >
              {draftKeys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
            <textarea
              aria-label="Taslak değer (JSON)"
              rows={8}
              spellCheck={false}
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 font-mono text-xs"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <Input aria-label="Gerekçe" placeholder="Gerekçe (en az 5 karakter)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button onClick={() => void createDraft()}>Taslak oluştur ve etkiyi önizle</Button>
          </div>
        </Card>
      ) : null}
      {preview ? (
        <Card>
          <h2 className="text-sm font-semibold">
            Etki önizlemesi · {preview.draft.key} v{preview.draft.version}
          </h2>
          <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
            <pre className="overflow-auto rounded bg-[var(--color-surface-muted)] p-2">Şu an: {fmt(preview.before)}</pre>
            <pre className="overflow-auto rounded bg-[var(--color-surface-muted)] p-2">Taslak: {fmt(preview.after)}</pre>
          </div>
          {preview.changedKeys.length ? <p className="mt-2 text-xs">Değişen alanlar: {preview.changedKeys.join(", ")}</p> : null}
          <ul className="mt-2 list-disc pl-5 text-xs text-[var(--color-text-muted)]">
            {preview.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          {preview.blockers.length ? <p role="alert" className="mt-2 text-sm text-[var(--color-danger)]">{preview.blockers.join(" ")}</p> : null}
          <div className="mt-3 flex gap-2">
            <Button
              variant="danger"
              disabled={preview.blockers.length > 0}
              onClick={async () => {
                if (await run({ op: "publish", draftId: preview.draft.id, confirm: true })) {
                  setPreview(null);
                  setMsg({ kind: "ok", text: "Yayınlandı ve denetim kaydına yazıldı." });
                  router.refresh();
                }
              }}
            >
              Onayla ve yayınla
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                if (await run({ op: "discard", draftId: preview.draft.id })) {
                  setPreview(null);
                  router.refresh();
                }
              }}
            >
              Taslaktan vazgeç
            </Button>
          </div>
        </Card>
      ) : null}
      <Card>
        <h2 className="text-sm font-semibold">Sürüm geçmişi</h2>
        <label className="mt-2 block text-xs text-[var(--color-text-muted)]">
          Geri alma gerekçesi (zorunlu, en az 10 karakter)
          <Input value={rollbackReason} onChange={(e) => setRollbackReason(e.target.value)} />
        </label>
        {byKey.length === 0 ? <p className="mt-2 text-sm text-[var(--color-text-muted)]">Henüz sürüm yok — ilk yayınla oluşur.</p> : null}
        <div className="mt-3 space-y-3">
          {byKey.map(([k, list]) => (
            <div key={k}>
              <p className="text-sm font-semibold">{k}</p>
              <table className="mt-1 w-full text-left text-xs">
                <tbody>
                  {list
                    .sort((a, b) => b.version - a.version)
                    .map((v) => (
                      <tr key={v.id} className="border-b" style={{ borderColor: "var(--color-border)" }}>
                        <td className="py-1 pr-2">v{v.version}</td>
                        <td className="pr-2">{STATUS_LABEL[v.status]}{v.rollbackOfVersion ? ` (v${v.rollbackOfVersion} geri alındı)` : ""}</td>
                        <td className="pr-2">{v.reason}</td>
                        <td className="pr-2 text-[var(--color-text-muted)]">{v.publishedBy ?? v.createdBy} · {new Date(v.publishedAt ?? v.createdAt).toLocaleString("tr-TR")}</td>
                        <td className="text-right">
                          {v.status === "superseded" ? (
                            <Button
                              variant="ghost"
                              onClick={async () => {
                                if (await run({ op: "rollback", key: k, toVersion: v.version, reason: rollbackReason, confirm: true })) {
                                  setMsg({ kind: "ok", text: `v${v.version} değerine dönüldü (yeni sürüm oluşturuldu).` });
                                  router.refresh();
                                }
                              }}
                            >
                              Bu sürüme dön
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
