"use client";

import { useEffect, useRef, useState } from "react";
import Link from "@/components/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Input, Select } from "@/components/ui";
import { callApi } from "@/components/platform/api";
import { InviteLink } from "@/components/platform/tenant-admin-controls";
import { roleLabelTr } from "@/lib/auth/role-labels";
import type { AppRole } from "@/lib/auth/types";

type UserRow = {
  id: string;
  email: string;
  displayName: string | null;
  tenantId: string;
  tenantName: string;
  role: AppRole;
  status: "active" | "deactivated" | "deleted";
  branchIds: string[];
  customRoleCount: number;
  lastLoginAt: string | null;
  portalAccess: "active" | "revoked" | "none" | null;
};
type InviteRow = { id: string; email: string; name: string; role: string; tenantId: string; tenantName: string; status: string; expiresAt: string };

const STATUS_LABEL = { active: "Aktif", deactivated: "Pasif", deleted: "Silinmiş" } as const;

function UserDrawer({ user, onClose, writable }: { user: UserRow; onClose: () => void; writable: boolean }) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [resetPath, setResetPath] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function op(name: string, extra: Record<string, unknown> = {}) {
    setMsg(null);
    const res = await callApi<{ resetPath?: string }>("/api/v1/platform/users", "POST", { op: name, userId: user.id, reason, confirm: true, ...extra });
    if (!res.ok) return setMsg({ kind: "err", text: res.error.message });
    if (res.data.resetPath) setResetPath(res.data.resetPath);
    setMsg({ kind: "ok", text: "İşlem tamamlandı ve denetim kaydına yazıldı." });
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-drawer-title"
        className="h-full w-full max-w-md overflow-auto p-5 shadow-[var(--shadow-md)] outline-none"
        style={{ background: "var(--color-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 id="user-drawer-title" className="text-base font-semibold">{user.displayName || user.email}</h2>
            <p className="text-xs text-[var(--color-text-muted)]">{user.email}</p>
          </div>
          <Button variant="ghost" onClick={onClose}>Kapat</Button>
        </div>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-[var(--color-text-muted)]">Kurum</dt><dd>{user.tenantName}</dd>
          <dt className="text-[var(--color-text-muted)]">Rol</dt><dd>{roleLabelTr(user.role)}{user.customRoleCount ? ` + ${user.customRoleCount} özel rol` : ""}</dd>
          <dt className="text-[var(--color-text-muted)]">Durum</dt><dd>{STATUS_LABEL[user.status]}</dd>
          <dt className="text-[var(--color-text-muted)]">Şubeler</dt><dd>{user.branchIds.join(", ") || "—"}</dd>
          <dt className="text-[var(--color-text-muted)]">Son giriş</dt><dd>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("tr-TR") : "kayıt yok"}</dd>
          {user.portalAccess ? (<><dt className="text-[var(--color-text-muted)]">Portal</dt><dd>{user.portalAccess}</dd></>) : null}
        </dl>
        {user.tenantId !== "tenant_platform" ? (
          <Link href={`/platform/kurumlar/${user.tenantId}/kullanicilar`} className="mt-3 inline-block text-sm text-[var(--color-primary)] hover:underline">
            Rol ve şube ataması →
          </Link>
        ) : null}
        <label className="mt-4 block text-xs text-[var(--color-text-muted)]">
          Gerekçe (pasifleştirme/silme için zorunlu)
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          {user.status === "active" ? (
            <>
              <Button variant="danger" onClick={() => void op("deactivate")}>Pasifleştir</Button>
              <Button variant="danger" onClick={() => void op("soft_delete")}>Sil (soft)</Button>
              <Button variant="secondary" onClick={() => void op("password_reset")}>Şifre sıfırlama bağlantısı</Button>
            </>
          ) : (
            <Button variant="success" onClick={() => void op("reactivate")}>Yeniden aktifleştir</Button>
          )}
          {user.portalAccess && user.portalAccess !== "none" ? (
            <Button variant="secondary" onClick={() => void op("portal", { enabled: user.portalAccess !== "active" })}>
              Portal erişimini {user.portalAccess === "active" ? "kapat" : "aç"}
            </Button>
          ) : null}
          <Button variant="ghost" disabled={!writable} onClick={() => void op("hard_delete")}>
            Kalıcı sil (yalnız taslak)
          </Button>
        </div>
        {msg ? <p role={msg.kind === "err" ? "alert" : "status"} className={`mt-3 text-sm ${msg.kind === "err" ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}>{msg.text}</p> : null}
        {resetPath ? <InviteLink path={resetPath} /> : null}
        <p className="mt-4 text-xs text-[var(--color-text-muted)]">
          Soft delete kaydı ve tahsilat/sözleşme/yoklama/audit ilişkilerini korur; giriş ve açık oturumlar hemen kesilir.
        </p>
      </div>
    </div>
  );
}

export function PlatformUsersManager({
  users,
  invitations,
  tenants,
  writable,
}: {
  users: UserRow[];
  invitations: InviteRow[];
  tenants: { tenantId: string; name: string }[];
  writable: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<UserRow | null>(null);
  const [invite, setInvite] = useState({ tenantId: tenants.find((t) => t.tenantId !== "tenant_platform")?.tenantId ?? "", name: "", email: "", role: "SCHOOL_ADMIN" });
  const [invitePath, setInvitePath] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function inviteOp(op: string, invitationId: string) {
    setMsg(null);
    const res = await callApi<{ invitePath?: string }>("/api/v1/platform/users", "POST", { op, invitationId });
    if (!res.ok) return setMsg(res.error.message);
    if (res.data.invitePath) setInvitePath(res.data.invitePath);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {!writable ? (
        <Card>
          <p className="text-sm text-[var(--color-text-muted)]">
            json/memory modu: pasifleştirme/silme demo hesaplarına bindirme olarak uygulanır ve giriş/oturumu keser; kalıcı silme,
            rol yazımı ve parola değişimi yalnız <code>STORE_MODE=db</code> ile.
          </p>
        </Card>
      ) : null}
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b text-xs text-[var(--color-text-muted)]" style={{ borderColor: "var(--color-border)" }}>
              <th className="px-4 py-2">Ad / e-posta</th>
              <th className="px-4 py-2">Kurum</th>
              <th className="px-4 py-2">Rol</th>
              <th className="px-4 py-2">Şube</th>
              <th className="px-4 py-2">Durum</th>
              <th className="px-4 py-2">Son giriş</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-4 text-[var(--color-text-muted)]">Filtreye uyan kullanıcı yok</td></tr>
            ) : null}
            {users.map((u) => (
              <tr key={u.id} className="border-b" style={{ borderColor: "var(--color-border)" }}>
                <td className="px-4 py-2">
                  <button type="button" className="text-left text-[var(--color-primary)] hover:underline" onClick={() => setOpen(u)}>
                    {u.displayName || u.email}
                  </button>
                  {u.displayName ? <p className="text-xs text-[var(--color-text-muted)]">{u.email}</p> : null}
                </td>
                <td className="px-4 py-2 text-xs">{u.tenantName}</td>
                <td className="px-4 py-2 text-xs">{roleLabelTr(u.role)}</td>
                <td className="px-4 py-2 text-xs">{u.branchIds.length || "—"}</td>
                <td className="px-4 py-2"><Badge>{STATUS_LABEL[u.status]}</Badge></td>
                <td className="px-4 py-2 text-xs text-[var(--color-text-muted)]">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString("tr-TR") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card>
        <h2 className="text-sm font-semibold">Davetler ({invitations.length})</h2>
        {msg ? <p role="alert" className="mt-1 text-sm text-[var(--color-danger)]">{msg}</p> : null}
        <ul className="mt-2 divide-y text-sm" style={{ borderColor: "var(--color-border)" }}>
          {invitations.length === 0 ? <li className="py-2 text-[var(--color-text-muted)]">Filtreye uyan davet yok</li> : null}
          {invitations.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {i.name} · {i.email} <span className="text-xs text-[var(--color-text-muted)]">· {i.tenantName} · {roleLabelTr(i.role as AppRole)} · {i.status}</span>
              </span>
              {i.status === "pending" || i.status === "expired" ? (
                <span className="flex gap-1">
                  <Button variant="secondary" onClick={() => void inviteOp("invite_resend", i.id)}>Yeniden gönder</Button>
                  {i.status === "pending" ? <Button variant="ghost" onClick={() => void inviteOp("invite_revoke", i.id)}>İptal et</Button> : null}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        {invitePath ? <InviteLink path={invitePath} /> : null}
      </Card>
      <Card>
        <h2 className="text-sm font-semibold">Kullanıcı davet et</h2>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">Platform sahibi rolü davetle verilemez. Şube müdürü daveti şube seçimi için kurum sekmesinden yapılır.</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          <Select aria-label="Kurum" value={invite.tenantId} onChange={(e) => setInvite({ ...invite, tenantId: e.target.value })}>
            {tenants.filter((t) => t.tenantId !== "tenant_platform").map((t) => (
              <option key={t.tenantId} value={t.tenantId}>{t.name}</option>
            ))}
          </Select>
          <Input aria-label="Ad soyad" placeholder="Ad soyad" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
          <Input aria-label="E-posta" type="email" placeholder="E-posta" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
          <Select aria-label="Rol" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
            <option value="SUPER_ADMIN">Kurum Sahibi</option>
            <option value="SCHOOL_ADMIN">Kurum Yöneticisi</option>
          </Select>
        </div>
        <Button
          className="mt-3"
          onClick={async () => {
            setMsg(null);
            const res = await callApi<{ invitePath: string }>(`/api/v1/platform/tenants/${invite.tenantId}/invitations`, "POST", invite);
            if (!res.ok) return setMsg(res.error.message);
            setInvitePath(res.data.invitePath);
            router.refresh();
          }}
        >
          Davet bağlantısı üret
        </Button>
      </Card>
      {open ? <UserDrawer user={open} writable={writable} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
