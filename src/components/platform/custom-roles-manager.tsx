"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Select } from "@/components/ui";
import { callApi } from "@/components/platform/api";
import { OWNER_ONLY_RESOURCES, PERM_ACTIONS, PERM_RESOURCES, PERM_RESOURCE_KEYS, PLATFORM_ONLY_RESOURCES, type Grant, type PermScope } from "@/lib/platform/permission-matrix";

type Role = { id: string; key: string; label: string; grants: Grant[]; archivedAt: string | null; assignedUsers: string[] };
type Member = { id: string; email: string; role: string };
type Impact = { affectedUsers: number; affectedBranches: string[]; added: Grant[]; removed: Grant[]; screensOpened: string[]; screensClosed: string[]; risks: string[] };

const TENANT_RESOURCES = PERM_RESOURCE_KEYS.filter((r) => !PLATFORM_ONLY_RESOURCES.includes(r) && !OWNER_ONLY_RESOURCES.includes(r));
const SCOPES: PermScope[] = ["tenant", "branch", "assigned", "own"];

export function CustomRolesManager({ tenantId, roles, members }: { tenantId: string; roles: Role[]; members: Member[] }) {
  const router = useRouter();
  const api = `/api/v1/platform/tenants/${tenantId}/roles`;
  const [draft, setDraft] = useState<{ id?: string; key: string; label: string; scope: PermScope; cells: Set<string> }>({
    key: "",
    label: "",
    scope: "branch",
    cells: new Set(),
  });
  const [impact, setImpact] = useState<Impact | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [assign, setAssign] = useState({ userId: members[0]?.id ?? "", roleId: roles.find((r) => !r.archivedAt)?.id ?? "" });

  const grants = (): Grant[] =>
    [...draft.cells].map((c) => {
      const [resource, action] = c.split(":");
      return { resource, action, scope: draft.scope } as Grant;
    });

  async function call<T>(body: Record<string, unknown>) {
    setMsg(null);
    const res = await callApi<T>(api, "POST", body);
    if (!res.ok) {
      setMsg({ kind: "err", text: res.error.message });
      return null;
    }
    return res.data;
  }

  function edit(role: Role) {
    setImpact(null);
    setDraft({
      id: role.id,
      key: role.key,
      label: role.label,
      scope: (role.grants[0]?.scope as PermScope) ?? "branch",
      cells: new Set(role.grants.map((g) => `${g.resource}:${g.action}`)),
    });
  }

  return (
    <div className="space-y-4">
      {msg ? (
        <p role={msg.kind === "err" ? "alert" : "status"} className={`text-sm ${msg.kind === "err" ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}>
          {msg.text}
        </p>
      ) : null}
      <Card>
        <h2 className="text-sm font-semibold">Özel roller</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {roles.length === 0 ? <li className="text-[var(--color-text-muted)]">Özel rol yok</li> : null}
          {roles.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <strong>{r.label}</strong> <code className="text-xs">{r.key}</code> · {r.grants.length} izin · {r.assignedUsers.length} kullanıcı
                {r.archivedAt ? <span className="ml-1 text-xs text-[var(--color-danger)]">arşiv</span> : null}
              </span>
              {!r.archivedAt ? (
                <span className="flex gap-1">
                  <Button variant="secondary" onClick={() => edit(r)}>Düzenle</Button>
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      if (await call({ op: "archive", id: r.id })) router.refresh();
                    }}
                  >
                    Arşivle
                  </Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
      <Card className="overflow-x-auto">
        <h2 className="text-sm font-semibold">{draft.id ? "Rolü düzenle" : "Yeni özel rol"}</h2>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Platform kapsamı ve platform kaynakları (paket, entitlement, feature flag, destek erişimi, platform markası, mobil policy) seçilemez.
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <Input aria-label="Rol anahtarı" placeholder="anahtar (ör. danisma)" value={draft.key} disabled={Boolean(draft.id)} onChange={(e) => setDraft({ ...draft, key: e.target.value })} />
          <Input aria-label="Rol adı" placeholder="Görünen ad" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
          <Select aria-label="Kapsam" value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value as PermScope })}>
            {SCOPES.map((s) => (
              <option key={s} value={s}>
                kapsam: {s}
              </option>
            ))}
          </Select>
        </div>
        <table className="mt-3 w-full min-w-[900px] text-left text-xs">
          <thead>
            <tr>
              <th className="py-1">Kaynak</th>
              {PERM_ACTIONS.map((a) => (
                <th key={a} className="px-1 text-center">{a}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TENANT_RESOURCES.map((res) => (
              <tr key={res} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                <td className="py-1">{PERM_RESOURCES[res]}</td>
                {PERM_ACTIONS.map((a) => {
                  const k = `${res}:${a}`;
                  return (
                    <td key={a} className="text-center">
                      <input
                        type="checkbox"
                        aria-label={`${PERM_RESOURCES[res]} ${a}`}
                        checked={draft.cells.has(k)}
                        onChange={(e) => {
                          const cells = new Set(draft.cells);
                          if (e.target.checked) cells.add(k);
                          else cells.delete(k);
                          setDraft({ ...draft, cells });
                          setImpact(null);
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              const d = await call<{ impact: Impact }>({ op: "preview", id: draft.id, key: draft.key, label: draft.label, grants: grants() });
              if (d) setImpact(d.impact);
            }}
          >
            Etkiyi önizle
          </Button>
          <Button
            disabled={!impact}
            onClick={async () => {
              if (await call({ op: "save", id: draft.id, key: draft.key, label: draft.label, grants: grants(), confirm: true })) {
                setMsg({ kind: "ok", text: "Rol kaydedildi, denetim kaydı yazıldı." });
                setImpact(null);
                router.refresh();
              }
            }}
          >
            Onayla ve kaydet
          </Button>
        </div>
        {impact ? (
          <div className="mt-3 text-xs">
            <p>Etkilenen kullanıcı: <strong>{impact.affectedUsers}</strong> · şubeler: {impact.affectedBranches.join(", ") || "—"}</p>
            <p>Eklenen: {impact.added.map((g) => `${g.resource}:${g.action}`).join(", ") || "—"}</p>
            <p>Kaldırılan: {impact.removed.map((g) => `${g.resource}:${g.action}`).join(", ") || "—"}</p>
            <p>Açılacak ekranlar: {impact.screensOpened.join(", ") || "—"} · Kapanacak: {impact.screensClosed.join(", ") || "—"}</p>
            {impact.risks.length ? <p className="text-[var(--color-danger)]">Kritik: {impact.risks.join(" · ")}</p> : null}
          </div>
        ) : null}
      </Card>
      <Card>
        <h2 className="text-sm font-semibold">Özel rol ata</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
          <Select aria-label="Kullanıcı" value={assign.userId} onChange={(e) => setAssign({ ...assign, userId: e.target.value })}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.email} ({m.role})
              </option>
            ))}
          </Select>
          <Select aria-label="Rol" value={assign.roleId} onChange={(e) => setAssign({ ...assign, roleId: e.target.value })}>
            {roles.filter((r) => !r.archivedAt).map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
          <Button onClick={async () => { if (await call({ op: "assign", ...assign })) router.refresh(); }}>Ata</Button>
          <Button variant="secondary" onClick={async () => { if (await call({ op: "unassign", ...assign })) router.refresh(); }}>Kaldır</Button>
        </div>
      </Card>
    </div>
  );
}
