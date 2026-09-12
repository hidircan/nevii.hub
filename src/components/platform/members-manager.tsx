"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Select } from "@/components/ui";
import { callApi } from "@/components/platform/api";
import { InviteLink } from "@/components/platform/tenant-admin-controls";

type Member = { id: string; email: string; role: string; active: boolean; branchIds: string[] };
type Branch = { id: string; name: string };
type Impact = {
  fromRole: string;
  toRole: string;
  addedPermissions: string[];
  removedPermissions: string[];
  warnings: string[];
  blockers: string[];
};

const ROLE_OPTIONS = [
  { value: "SUPER_ADMIN", label: "Kurum Sahibi" },
  { value: "SCHOOL_ADMIN", label: "Kurum Yöneticisi" },
  { value: "BRANCH_MANAGER", label: "Şube Müdürü" },
];
const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Kurum Sahibi",
  SCHOOL_ADMIN: "Kurum Yöneticisi",
  BRANCH_MANAGER: "Şube Müdürü",
  TEACHER: "Öğretmen",
  STUDENT: "Öğrenci/Veli",
  AI_AGENT: "AI Ajanı",
};

export function MembersManager({
  tenantId,
  members,
  branches,
  writable,
}: {
  tenantId: string;
  members: Member[];
  branches: Branch[];
  writable: boolean;
}) {
  const router = useRouter();
  const base = `/api/v1/platform/tenants/${tenantId}`;
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [preview, setPreview] = useState<{ userId: string; role: string; impact: Impact } | null>(null);
  const [invite, setInvite] = useState({ name: "", email: "", role: "SCHOOL_ADMIN", branchIds: [] as string[] });
  const [invitePath, setInvitePath] = useState<string | null>(null);
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id;

  async function doPreview(userId: string, role: string) {
    setError(null);
    const res = await callApi<{ impact: Impact }>(`${base}/members/role?preview=1`, "POST", { userId, role });
    if (!res.ok) return setError(res.error.message);
    setPreview({ userId, role, impact: res.data.impact });
  }

  async function applyRole() {
    if (!preview) return;
    setPending(true);
    const res = await callApi(`${base}/members/role`, "POST", { userId: preview.userId, role: preview.role, confirm: true });
    setPending(false);
    if (!res.ok) return setError(res.error.message);
    setPreview(null);
    router.refresh();
  }

  async function toggleBranch(userId: string, branchId: string, has: boolean) {
    setError(null);
    const res = await callApi(`${base}/members/branch-access`, has ? "DELETE" : "POST", { userId, branchId });
    if (!res.ok) return setError(res.error.message);
    router.refresh();
  }

  async function sendInvite() {
    setError(null);
    setInvitePath(null);
    const res = await callApi<{ invitePath: string }>(`${base}/invitations`, "POST", {
      ...invite,
      branchIds: invite.role === "BRANCH_MANAGER" ? invite.branchIds : undefined,
    });
    if (!res.ok) return setError(res.error.message);
    setInvitePath(res.data.invitePath);
    setInvite({ name: "", email: "", role: "SCHOOL_ADMIN", branchIds: [] });
  }

  return (
    <div className="space-y-4">
      {!writable ? (
        <Card>
          <p className="text-sm text-[var(--color-text-muted)]">
            json/memory modu: demo hesapları koddadır; rol değişikliği ve davet kabulü yalnız <code>STORE_MODE=db</code> ile
            kalıcıdır. Şube erişimi ve etki önizlemesi bu modda da çalışır.
          </p>
        </Card>
      ) : null}
      {error ? <p role="alert" className="text-sm text-[var(--color-danger)]">{error}</p> : null}
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs text-[var(--color-text-muted)]" style={{ borderColor: "var(--color-border)" }}>
              <th className="px-4 py-2">Kullanıcı</th>
              <th className="px-4 py-2">Rol</th>
              <th className="px-4 py-2">Şube erişimi</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-4 text-[var(--color-text-muted)]">Kullanıcı yok</td>
              </tr>
            ) : null}
            {members.map((m) => {
              const assignable = ROLE_OPTIONS.some((r) => r.value === m.role);
              return (
                <tr key={m.id} className="border-b align-top" style={{ borderColor: "var(--color-border)" }}>
                  <td className="px-4 py-2">
                    {m.email}
                    {!m.active ? <span className="ml-2 text-xs text-[var(--color-danger)]">pasif</span> : null}
                  </td>
                  <td className="px-4 py-2">
                    {assignable ? (
                      <Select aria-label={`${m.email} rolü`} value={m.role} onChange={(e) => void doPreview(m.id, e.target.value)}>
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <span className="text-[var(--color-text-muted)]">{ROLE_LABEL[m.role] ?? m.role} (değiştirilemez)</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {m.role === "BRANCH_MANAGER" ? (
                      <div className="flex flex-wrap gap-2">
                        {branches.length === 0 ? <span className="text-xs text-[var(--color-text-muted)]">Şube verisi yok</span> : null}
                        {branches.map((b) => {
                          const has = m.branchIds.includes(b.id);
                          return (
                            <label key={b.id} className="flex items-center gap-1 text-xs">
                              <input type="checkbox" checked={has} onChange={() => void toggleBranch(m.id, b.id, has)} />
                              {b.name}
                            </label>
                          );
                        })}
                        {m.branchIds.length === 0 ? (
                          <span className="text-xs text-[var(--color-danger)]">Atama yok — hiçbir veri göremez</span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {m.role === "SUPER_ADMIN" || m.role === "SCHOOL_ADMIN" ? "Kurum geneli" : "—"}
                        {m.branchIds.length ? ` · atamalar: ${m.branchIds.map(branchName).join(", ")}` : ""}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {preview ? (
        <Card>
          <h2 className="text-sm font-semibold">
            Rol etki önizlemesi: {ROLE_LABEL[preview.impact.fromRole] ?? preview.impact.fromRole} →{" "}
            {ROLE_LABEL[preview.impact.toRole]}
          </h2>
          <div className="mt-2 grid gap-3 text-xs sm:grid-cols-2">
            <div>
              <p className="font-semibold text-[var(--color-success)]">Kazanılan izinler</p>
              <p>{preview.impact.addedPermissions.join(", ") || "—"}</p>
            </div>
            <div>
              <p className="font-semibold text-[var(--color-danger)]">Kaybedilen izinler</p>
              <p>{preview.impact.removedPermissions.join(", ") || "—"}</p>
            </div>
          </div>
          <ul className="mt-2 list-disc pl-5 text-xs text-[var(--color-text-muted)]">
            {preview.impact.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          {preview.impact.blockers.length ? (
            <p role="alert" className="mt-2 text-sm text-[var(--color-danger)]">{preview.impact.blockers.join(" ")}</p>
          ) : null}
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={() => setPreview(null)}>Vazgeç</Button>
            <Button
              variant="danger"
              disabled={pending || preview.impact.blockers.length > 0 || preview.impact.fromRole === preview.impact.toRole}
              onClick={() => void applyRole()}
            >
              Onayla ve uygula
            </Button>
          </div>
        </Card>
      ) : null}

      <Card>
        <h2 className="text-sm font-semibold">Kullanıcı davet et</h2>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Platform yöneticisi rolü davetle verilemez. Sistem e-posta göndermez; tek seferlik bağlantı üretilir.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Input aria-label="Ad soyad" placeholder="Ad soyad" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
          <Input aria-label="E-posta" placeholder="E-posta" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
          <Select aria-label="Davet rolü" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
        {invite.role === "BRANCH_MANAGER" ? (
          <div className="mt-2 flex flex-wrap gap-3">
            {branches.map((b) => (
              <label key={b.id} className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={invite.branchIds.includes(b.id)}
                  onChange={(e) =>
                    setInvite({
                      ...invite,
                      branchIds: e.target.checked ? [...invite.branchIds, b.id] : invite.branchIds.filter((x) => x !== b.id),
                    })
                  }
                />
                {b.name}
              </label>
            ))}
          </div>
        ) : null}
        <Button className="mt-3" onClick={() => void sendInvite()}>Davet bağlantısı üret</Button>
        {invitePath ? <InviteLink path={invitePath} /> : null}
      </Card>
    </div>
  );
}
