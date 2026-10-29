"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Select } from "@/components/ui";
import { callApi } from "@/components/platform/api";
import { PERM_RESOURCES, type Grant } from "@/lib/platform/permission-matrix";

type DirUser = { id: string; name: string | null; emailMasked: string; tenantId: string; tenantName: string; status: string; branchIds: string[] };
type ScreenRef = { id: string; label: string; path: string; area: string; feature?: string | null };
type SystemRole = {
  key: string;
  label: string;
  loginRole: string;
  note: string;
  assignable: boolean;
  userCount: number;
  activeCount: number;
  users: DirUser[];
  grants: Grant[];
  screens: ScreenRef[];
  effectiveAs: string | null;
};
type CustomRole = { id: string; key: string; label: string; grants: Grant[]; archived: boolean; userCount: number; users: DirUser[]; screens: ScreenRef[] };
type RegistryScreen = ScreenRef & { requires: Grant; enforcement: "matrix" | "system_role"; grantableToCustomRole: boolean };
export type RoleDirectoryData = {
  tenantId: string | null;
  tenants: { tenantId: string; name: string }[];
  managerPreset: { preset: string | null; ownerDefault: boolean; options: string[] } | null;
  systemRoles: SystemRole[];
  customRoles: CustomRole[];
  screens: RegistryScreen[];
  features: { key: string; label: string; resources: string[]; screens: string[] }[];
  writable: boolean;
};

const ASSIGNABLE = [
  { value: "SUPER_ADMIN", label: "Kurum Sahibi" },
  { value: "SCHOOL_ADMIN", label: "Kurum Yöneticisi" },
  { value: "BRANCH_MANAGER", label: "Şube Müdürü" },
];
const PRESET_LABEL: Record<string, string> = {
  unified: "Birleşik — Şube Müdürü = Kurum Yöneticisi",
  branch_scoped: "Ayrık — Şube Müdürü yalnız atanmış şube",
};
const STATUS_LABEL: Record<string, string> = { active: "Aktif", deactivated: "Pasif", deleted: "Silinmiş" };

function grantSummary(grants: Grant[]): { resource: string; text: string }[] {
  const by = new Map<string, Grant[]>();
  for (const g of grants) by.set(g.resource, [...(by.get(g.resource) ?? []), g]);
  return [...by.entries()].map(([r, gs]) => ({
    resource: PERM_RESOURCES[r as keyof typeof PERM_RESOURCES] ?? r,
    text: `${gs.map((g) => g.action).join(", ")} · ${gs[0]!.scope}`,
  }));
}

type Impact = Record<string, unknown>;

export function RoleDirectory({ data }: { data: RoleDirectoryData }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string>(data.systemRoles.find((r) => r.userCount > 0)?.key ?? "SUPER_ADMIN");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pending, setPending] = useState<{ title: string; lines: string[]; blockers: string[]; run: () => Promise<void> } | null>(null);
  const [preset, setPreset] = useState({ value: data.managerPreset?.preset ?? "branch_scoped", reason: "" });
  const [roleTarget, setRoleTarget] = useState<Record<string, string>>({});
  const [assignUser, setAssignUser] = useState("");
  const [screenQ, setScreenQ] = useState("");
  const screenTerm = screenQ.trim().toLocaleLowerCase("tr");

  const sys = data.systemRoles.find((r) => r.key === selected);
  const custom = data.customRoles.find((r) => r.id === selected);
  const members = useMemo(
    () => data.systemRoles.filter((r) => r.key !== "HYPER_ADMIN").flatMap((r) => r.users.map((u) => ({ ...u, role: r.key }))),
    [data.systemRoles]
  );

  async function post<T>(url: string, body: unknown) {
    setMsg(null);
    const res = await callApi<T>(url, "POST", body);
    if (!res.ok) setMsg({ kind: "err", text: res.error.message });
    return res;
  }

  async function previewSystemRole(user: DirUser) {
    const to = roleTarget[user.id];
    if (!to || !data.tenantId) return;
    const url = `/api/v1/platform/tenants/${data.tenantId}/members/role`;
    const res = await post<{ impact: { addedPermissions: string[]; removedPermissions: string[]; warnings: string[]; blockers: string[] } }>(
      `${url}?preview=1`,
      { userId: user.id, role: to }
    );
    if (!res.ok) return;
    const i = res.data.impact;
    setPending({
      title: `${user.name ?? user.emailMasked} → ${ASSIGNABLE.find((a) => a.value === to)?.label}`,
      lines: [
        `Eklenen izin: ${i.addedPermissions.join(", ") || "—"}`,
        `Kaldırılan izin: ${i.removedPermissions.join(", ") || "—"}`,
        ...i.warnings,
      ],
      blockers: i.blockers,
      run: async () => {
        const done = await post(url, { userId: user.id, role: to, confirm: true });
        if (done.ok) {
          setMsg({ kind: "ok", text: "Rol değişti; önceki/yeni değer denetim kaydına yazıldı." });
          router.refresh();
        }
      },
    });
  }

  async function customRoleOp(body: Record<string, unknown>, okText: string) {
    const res = await post(`/api/v1/platform/tenants/${data.tenantId}/roles`, body);
    if (res.ok) {
      setMsg({ kind: "ok", text: okText });
      router.refresh();
    }
  }

  async function toggleScreen(role: CustomRole, screen: RegistryScreen, enabled: boolean) {
    const body = { op: "screen_toggle", tenantId: data.tenantId, roleId: role.id, screenId: screen.id, enabled };
    const res = await callApi<unknown>("/api/v1/platform/roles", "POST", body);
    const impact = !res.ok ? (res.error.details?.impact as Impact | undefined) : undefined;
    if (!res.ok && !impact) {
      setMsg({ kind: "err", text: res.error.message });
      return;
    }
    const list = (k: string) => ((impact?.[k] as string[] | undefined) ?? []).join(", ") || "—";
    setPending({
      title: `${role.label}: "${screen.label}" ${enabled ? "eklenecek" : "kaldırılacak"}`,
      lines: [
        `Etkilenen kullanıcı: ${String(impact?.affectedUsers ?? 0)}`,
        `Açılacak ekranlar: ${list("screensOpened")}`,
        `Kapanacak ekranlar: ${list("screensClosed")}`,
        ...(((impact?.risks as string[] | undefined) ?? []).map((r) => `Kritik: ${r}`)),
      ],
      blockers: [],
      run: async () => {
        const done = await post("/api/v1/platform/roles", { ...body, confirm: true });
        if (done.ok) {
          setMsg({ kind: "ok", text: "Ekran erişimi güncellendi; denetim kaydı yazıldı." });
          router.refresh();
        }
      },
    });
  }

  async function previewPreset() {
    if (!data.tenantId) return;
    const res = await post<{
      before: string;
      after: string;
      changed: boolean;
      affectedUsers: DirUser[];
      screensOpened: string[];
      screensClosed: string[];
      notes: string[];
    }>("/api/v1/platform/roles", { op: "preset_preview", tenantId: data.tenantId, preset: preset.value });
    if (!res.ok) return;
    const d = res.data;
    setPending({
      title: `Yönetici hazır şablonu: ${PRESET_LABEL[d.before]} → ${PRESET_LABEL[d.after]}`,
      lines: [
        `Etkilenen şube müdürü: ${d.affectedUsers.length} (${d.affectedUsers.map((u) => u.name ?? u.emailMasked).join(", ") || "—"})`,
        `Açılacak ekranlar: ${d.screensOpened.join(", ") || "—"}`,
        `Kapanacak ekranlar: ${d.screensClosed.join(", ") || "—"}`,
        ...d.notes,
      ],
      blockers: d.changed ? (preset.reason.trim().length < 10 ? ["Gerekçe en az 10 karakter olmalı."] : []) : ["Değişiklik yok."],
      run: async () => {
        const done = await post("/api/v1/platform/roles", {
          op: "preset_apply",
          tenantId: data.tenantId,
          preset: preset.value,
          reason: preset.reason,
          confirm: true,
        });
        if (done.ok) {
          setMsg({ kind: "ok", text: "Preset yayınlandı: yeni politika sürümü + denetim kaydı." });
          router.refresh();
        }
      },
    });
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-[var(--color-text-muted)]">
          Kurum
          <Select
            aria-label="Kurum seç"
            value={data.tenantId ?? ""}
            onChange={(e) => router.push(e.target.value ? `/platform/roller?tenantId=${e.target.value}` : "/platform/roller")}
          >
            <option value="">Tüm kurumlar (yalnız görüntüleme)</option>
            {data.tenants.map((t) => (
              <option key={t.tenantId} value={t.tenantId}>
                {t.name}
              </option>
            ))}
          </Select>
        </label>
        <p className="text-xs text-[var(--color-text-muted)]">
          Kurum seçince rol atama, özel rol ve yönetici hazır şablonu açılır. Sistem rollerinin izinleri değiştirilemez; Platform Sahibi izinleri bu ekrandan değiştirilemez.
        </p>
      </Card>

      {msg ? (
        <p role={msg.kind === "err" ? "alert" : "status"} className={`text-sm ${msg.kind === "err" ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}>
          {msg.text}
        </p>
      ) : null}

      {data.managerPreset ? (
        <Card>
          <h2 className="text-sm font-semibold">Yönetici hazır izin şablonu</h2>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Şu an: <strong>{PRESET_LABEL[data.managerPreset.preset ?? "branch_scoped"]}</strong>
            {data.managerPreset.ownerDefault ? " · owner kararıyla varsayılan birleşik" : ""}. Rol adları ayrı kalır; yalnız efektif izin seti eşitlenir.
            Personel ve finans özeti her iki şablonda da yalnız Kurum Sahibi’ndedir.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
            <Select aria-label="Preset" value={preset.value} onChange={(e) => setPreset({ ...preset, value: e.target.value })}>
              {data.managerPreset.options.map((o) => (
                <option key={o} value={o}>
                  {PRESET_LABEL[o]}
                </option>
              ))}
            </Select>
            <Input aria-label="Gerekçe" placeholder="Gerekçe (en az 10 karakter)" value={preset.reason} onChange={(e) => setPreset({ ...preset, reason: e.target.value })} />
            <Button variant="secondary" onClick={previewPreset}>
              Etkiyi önizle
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {data.systemRoles.map((r) => (
          <button
            key={r.key}
            type="button"
            aria-pressed={selected === r.key}
            onClick={() => setSelected(r.key)}
            className="rounded-[var(--radius-md)] border p-3 text-left text-sm"
            style={{
              borderColor: selected === r.key ? "var(--color-primary)" : "var(--color-border)",
              background: "var(--color-surface)",
            }}
          >
            <span className="block font-semibold">{r.label}</span>
            <span className="block text-xs text-[var(--color-text-muted)]">{r.loginRole}</span>
            <span className="mt-1 block text-xs">
              <strong>{r.userCount}</strong> kullanıcı · {r.activeCount} aktif
            </span>
            {r.effectiveAs ? <span className="mt-1 block text-[11px] text-[var(--color-primary)]">efektif: Kurum Yöneticisi izinleri</span> : null}
          </button>
        ))}
        {data.customRoles.map((r) => (
          <button
            key={r.id}
            type="button"
            aria-pressed={selected === r.id}
            onClick={() => setSelected(r.id)}
            className="rounded-[var(--radius-md)] border border-dashed p-3 text-left text-sm"
            style={{ borderColor: selected === r.id ? "var(--color-primary)" : "var(--color-border)", background: "var(--color-surface)" }}
          >
            <span className="block font-semibold">{r.label}</span>
            <span className="block text-xs text-[var(--color-text-muted)]">özel rol · {r.key}{r.archived ? " · arşiv" : ""}</span>
            <span className="mt-1 block text-xs">
              <strong>{r.userCount}</strong> kullanıcı
            </span>
          </button>
        ))}
      </div>

      {sys ? (
        <Card className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">{sys.label}</h2>
            <p className="text-xs text-[var(--color-text-muted)]">{sys.note}</p>
          </div>
          <UsersTable
            users={sys.users}
            action={
              sys.assignable && data.tenantId
                ? (u) => (
                    <span className="flex gap-1">
                      <Select aria-label="Yeni rol" value={roleTarget[u.id] ?? ""} onChange={(e) => setRoleTarget({ ...roleTarget, [u.id]: e.target.value })}>
                        <option value="">Rol değiştir…</option>
                        {ASSIGNABLE.filter((a) => a.value !== sys.key).map((a) => (
                          <option key={a.value} value={a.value}>
                            {a.label}
                          </option>
                        ))}
                      </Select>
                      <Button variant="secondary" disabled={!roleTarget[u.id]} onClick={() => previewSystemRole(u)}>
                        Önizle
                      </Button>
                    </span>
                  )
                : undefined
            }
          />
          {!data.writable && sys.assignable && data.tenantId ? (
            <p className="text-xs text-[var(--color-text-muted)]">json/memory modunda rol değişikliği önizlenir ama kalıcı yazılmaz (yalnız STORE_MODE=db).</p>
          ) : null}
          <GrantsAndScreens grants={sys.grants} screens={sys.screens} />
        </Card>
      ) : null}

      {custom ? (
        <Card className="space-y-3">
          <h2 className="text-base font-semibold">{custom.label} <code className="text-xs">{custom.key}</code></h2>
          <UsersTable
            users={custom.users}
            action={(u) => (
              <Button variant="ghost" onClick={() => customRoleOp({ op: "unassign", userId: u.id, roleId: custom.id }, "Rol kaldırıldı; denetim kaydı yazıldı.")}>
                Rolden çıkar
              </Button>
            )}
          />
          {!custom.archived ? (
            <div className="flex flex-wrap gap-2">
              <Select aria-label="Kullanıcı ekle" value={assignUser} onChange={(e) => setAssignUser(e.target.value)}>
                <option value="">Kullanıcı seç…</option>
                {members
                  .filter((m) => !custom.users.some((u) => u.id === m.id))
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name ?? m.emailMasked} ({m.role})
                    </option>
                  ))}
              </Select>
              <Button disabled={!assignUser} onClick={() => customRoleOp({ op: "assign", userId: assignUser, roleId: custom.id }, "Rol atandı; denetim kaydı yazıldı.")}>
                Role ata
              </Button>
            </div>
          ) : null}
          <div>
            <h3 className="text-sm font-semibold">Ekran erişimi</h3>
            <p className="text-xs text-[var(--color-text-muted)]">Ekran eklemek, o ekranın izin kaydını role ekler — serbest adres yazılamaz.</p>
            <Input
              aria-label="Ekran ara"
              placeholder="Ekran ara…"
              value={screenQ}
              onChange={(e) => setScreenQ(e.target.value)}
              className="mt-2 max-w-56 text-xs"
            />
            <ul className="mt-2 grid max-h-64 gap-1 overflow-auto text-sm sm:grid-cols-2">
              {data.screens
                .filter((s) => s.area !== "platform")
                .filter((s) => !screenTerm || `${s.label} ${s.id}`.toLocaleLowerCase("tr").includes(screenTerm))
                .map((s) => {
                  const has = custom.screens.some((x) => x.id === s.id);
                  return (
                    <li key={s.id} className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={has}
                          disabled={!s.grantableToCustomRole || custom.archived}
                          onChange={(e) => toggleScreen(custom, s, e.target.checked)}
                        />
                        {s.label}
                      </label>
                      <span className="text-[11px] text-[var(--color-text-muted)]">
                        {!s.grantableToCustomRole ? "yalnız sistem rolü" : s.enforcement === "system_role" ? "panel: sistem rolü kapısı" : "matris"}
                      </span>
                    </li>
                  );
                })}
            </ul>
          </div>
          <GrantsAndScreens grants={custom.grants} screens={custom.screens} />
        </Card>
      ) : null}

      <Card>
        <details>
          <summary className="cursor-pointer text-sm font-semibold hover:underline">
            Modül ve izin ilişkisi ({data.features.length} modül)
          </summary>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">Erişim için dört koşul birlikte gerekir: paket hakkı, açık modül, rol izni ve kapsam. Modül kapalıysa izin tek başına ekran açmaz.</p>
          <div className="overflow-x-auto">
            <table className="mt-2 w-full min-w-[600px] text-left text-xs">
              <thead>
                <tr className="text-[var(--color-text-muted)]">
                  <th className="py-1">Modül</th>
                  <th>İzin kaynakları</th>
                  <th>Bağlı ekranlar</th>
                </tr>
              </thead>
              <tbody>
                {data.features.map((f) => (
                  <tr key={f.key} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                    <td className="py-1">{f.label}</td>
                    <td>{f.resources.join(", ") || "—"}</td>
                    <td>{f.screens.join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Card>

      {pending ? (
        <div role="alertdialog" aria-labelledby="rd-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-[var(--radius-lg)] border p-5 shadow-[var(--shadow-md)]" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
            <h2 id="rd-title" className="text-base font-semibold">Etki önizlemesi — {pending.title}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {pending.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            {pending.blockers.length ? <p className="mt-2 text-sm text-[var(--color-danger)]">Engel: {pending.blockers.join(" ")}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPending(null)}>
                Vazgeç
              </Button>
              <Button
                variant="danger"
                disabled={pending.blockers.length > 0}
                onClick={async () => {
                  const p = pending;
                  setPending(null);
                  await p.run();
                }}
              >
                Onayla ve kaydet
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const PAGE_SIZES = [10, 25, 50] as const;

function UsersTable({ users, action }: { users: DirUser[]; action?: (u: DirUser) => React.ReactNode }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState<(typeof PAGE_SIZES)[number]>(10);
  const term = q.trim().toLocaleLowerCase("tr");
  const filtered = useMemo(
    () =>
      users.filter(
        (u) =>
          (!term || `${u.name ?? ""} ${u.emailMasked} ${u.tenantName}`.toLocaleLowerCase("tr").includes(term)) &&
          (!status || u.status === status)
      ),
    [users, term, status]
  );
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const safePage = Math.min(page, pages - 1);
  const rows = filtered.slice(safePage * size, safePage * size + size);
  if (users.length === 0) return <p className="text-sm text-[var(--color-text-muted)]">Bu rolde kullanıcı yok.</p>;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Kullanıcı ara"
          placeholder="Ad, e-posta veya kurum ara…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
          className="max-w-64"
        />
        <Select
          aria-label="Durum filtresi"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
        >
          <option value="">Tüm durumlar</option>
          <option value="active">Aktif</option>
          <option value="deactivated">Pasif</option>
          <option value="deleted">Silinmiş</option>
        </Select>
        <label className="ml-auto flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
          Sayfa başına
          <Select
            aria-label="Sayfa başına satır"
            value={size}
            onChange={(e) => {
              setSize(Number(e.target.value) as (typeof PAGE_SIZES)[number]);
              setPage(0);
            }}
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </label>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">Filtreye uygun kullanıcı yok.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="text-xs text-[var(--color-text-muted)]">
                <th className="py-1">Kullanıcı</th>
                <th>E-posta</th>
                <th>Kurum</th>
                <th>Şube</th>
                <th>Durum</th>
                {action ? <th>İşlem</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                  <td className="py-1">{u.name ?? "—"}</td>
                  <td>{u.emailMasked}</td>
                  <td>{u.tenantName}</td>
                  <td>{u.branchIds.length || "—"}</td>
                  <td>{STATUS_LABEL[u.status] ?? u.status}</td>
                  {action ? <td>{action(u)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
        <span>
          {filtered.length === 0 ? "0" : `${safePage * size + 1}–${Math.min(filtered.length, safePage * size + size)}`} / {filtered.length} kullanıcı
        </span>
        <span className="flex gap-1">
          <Button variant="ghost" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
            ‹ Önceki
          </Button>
          <Button variant="ghost" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}>
            Sonraki ›
          </Button>
        </span>
      </div>
    </div>
  );
}

function GrantsAndScreens({ grants, screens }: { grants: Grant[]; screens: ScreenRef[] }) {
  const [q, setQ] = useState("");
  const term = q.trim().toLocaleLowerCase("tr");
  const shown = term ? screens.filter((s) => `${s.label} ${s.path} ${s.id}`.toLocaleLowerCase("tr").includes(term)) : screens;
  return (
    <details>
      <summary className="cursor-pointer text-sm font-semibold hover:underline">
        Erişilen ekranlar ({screens.length}) ve izinler ({grantSummary(grants).length} kaynak)
      </summary>
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        <div>
          <Input
            aria-label="Ekran ara"
            placeholder="Ekran ara…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="mb-1 max-w-56 text-xs"
          />
          <ul className="max-h-56 space-y-0.5 overflow-auto text-xs">
            {shown.length === 0 ? <li className="text-[var(--color-text-muted)]">—</li> : null}
            {shown.map((s) => (
              <li key={s.id}>
                {s.label} <code className="text-[10px] text-[var(--color-text-muted)]">{s.path}</code>
                {s.feature ? <span className="text-[10px] text-[var(--color-text-muted)]"> · modül: {s.feature}</span> : null}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold">İzinler (kaynak · aksiyon · kapsam)</h3>
          <ul className="mt-1 max-h-56 space-y-0.5 overflow-auto text-xs">
            {grants.length === 0 ? <li className="text-[var(--color-text-muted)]">—</li> : null}
            {grantSummary(grants).map((g) => (
              <li key={g.resource}>
                <strong>{g.resource}</strong>: {g.text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}
