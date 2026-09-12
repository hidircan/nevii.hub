"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input } from "@/components/ui";
import { callApi } from "@/components/platform/api";
import { roleLabelTr } from "@/lib/auth/role-labels";
import type { AppRole } from "@/lib/auth/types";
import type { LiveUserRow } from "@/lib/platform/live-ops";

type Invite = { id: string; tenantName: string; emailMasked: string; name: string; role: string; status: string; expiresAt: string };

const STATUS: Record<string, string> = { active: "Aktif", deactivated: "Pasif", deleted: "Silinmiş" };

function ago(iso: string | null): string {
  if (!iso) return "—";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} sn önce`;
  if (s < 3600) return `${Math.round(s / 60)} dk önce`;
  if (s < 86_400) return `${Math.round(s / 3600)} sa önce`;
  return new Date(iso).toLocaleString("tr-TR");
}

type Pending = { title: string; description: string; run: (reason: string) => Promise<void>; needsReason: boolean };

export function LiveOpsManager({ users, invitations, writable }: { users: LiveUserRow[]; invitations: Invite[]; writable: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function call<T>(url: string, body: unknown, okText: string) {
    setMsg(null);
    const res = await callApi<T>(url, "POST", body);
    if (!res.ok) {
      setMsg({ kind: "err", text: res.error.message });
      return null;
    }
    setMsg({ kind: "ok", text: okText });
    router.refresh();
    return res.data;
  }

  const ask = (p: Pending) => {
    setReason("");
    setPending(p);
  };

  function userOp(u: LiveUserRow, op: "deactivate" | "reactivate" | "password_reset") {
    const labels = {
      deactivate: ["Kullanıcıyı pasifleştir", "Giriş kapanır, tüm açık oturumlar hemen düşer. Kayıtlar ve audit korunur."],
      reactivate: ["Kullanıcıyı yeniden aktifleştir", "Kullanıcı yeniden giriş yapabilir; eski oturumlar diriltilmez."],
      password_reset: ["Şifre sıfırlama başlat", "1 saat geçerli, tek kullanımlık bağlantı üretilir. E-posta GÖNDERİLMEZ; bağlantıyı güvenli kanaldan iletin."],
    } as const;
    ask({
      title: `${labels[op][0]} — ${u.name ?? u.emailMasked}`,
      description: labels[op][1],
      needsReason: op !== "password_reset",
      run: async (r) => {
        const data = await call<{ resetPath?: string }>("/api/v1/platform/users", { op, userId: u.userId, reason: r, confirm: true }, "İşlem tamamlandı; denetim kaydı yazıldı.");
        if (data?.resetPath) setMsg({ kind: "ok", text: `Sıfırlama bağlantısı (bir kez gösterilir): ${window.location.origin}${data.resetPath}` });
      },
    });
  }

  return (
    <div className="space-y-4">
      {msg ? (
        <p role={msg.kind === "err" ? "alert" : "status"} className={`break-all text-sm ${msg.kind === "err" ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}>
          {msg.text}
        </p>
      ) : null}
      {!writable ? (
        <p className="text-xs text-[var(--color-text-muted)]">
          json/memory modu: oturum sonlandırma ve pasifleştirme çalışır (bindirme kaydı); şifre sıfırlama tamamlama ve kalıcı rol değişimi yalnız STORE_MODE=db.
        </p>
      ) : null}
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead>
            <tr className="border-b text-xs text-[var(--color-text-muted)]" style={{ borderColor: "var(--color-border)" }}>
              <th className="px-3 py-2">Kullanıcı</th>
              <th>Rol</th>
              <th>Kurum / şube</th>
              <th>Durum</th>
              <th>Oturum</th>
              <th>Son görülme</th>
              <th>Son ekran / işlem</th>
              <th>Cihaz</th>
              <th className="px-3">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-4 text-[var(--color-text-muted)]">
                  Kayıt yok.
                </td>
              </tr>
            ) : null}
            {users.map((u) => (
              <FragmentRow key={u.userId}>
                <tr className="border-b align-top" style={{ borderColor: "var(--color-border)" }}>
                  <td className="px-3 py-2">
                    <span className="block font-medium">{u.name ?? "—"}</span>
                    <span className="text-xs text-[var(--color-text-muted)]">{u.emailMasked}</span>
                  </td>
                  <td>{roleLabelTr(u.role as AppRole)}</td>
                  <td>
                    {u.tenantName}
                    {u.branches.length ? <span className="block text-xs text-[var(--color-text-muted)]">{u.branches.join(", ")}</span> : null}
                  </td>
                  <td>{STATUS[u.status] ?? u.status}</td>
                  <td>
                    {u.activeSessions > 0 ? (
                      <button type="button" className="text-[var(--color-primary)] underline" onClick={() => setOpen(open === u.userId ? null : u.userId)} aria-expanded={open === u.userId}>
                        {u.activeSessions} açık
                      </button>
                    ) : (
                      "0"
                    )}
                  </td>
                  <td>{ago(u.lastSeenAt)}</td>
                  <td className="max-w-[220px] truncate text-xs">
                    {u.lastPath ?? "—"}
                    {u.lastAction ? <span className="block text-[var(--color-text-muted)]">{u.lastAction}</span> : null}
                  </td>
                  <td className="text-xs">{u.device ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className="flex flex-wrap gap-1">
                      {u.activeSessions > 0 ? (
                        <Button
                          variant="secondary"
                          onClick={() =>
                            ask({
                              title: `Tüm oturumları kapat — ${u.name ?? u.emailMasked}`,
                              description: "Kullanıcının tüm cihazlardaki oturumları düşer; hesap aktif kalır, yeniden giriş yapabilir.",
                              needsReason: true,
                              run: async (r) => {
                                await call("/api/v1/platform/sessions", { op: "revoke_all", userId: u.userId, reason: r, confirm: true }, "Tüm oturumlar kapatıldı; denetim kaydı yazıldı.");
                              },
                            })
                          }
                        >
                          Tümünü kapat
                        </Button>
                      ) : null}
                      {u.status === "active" ? (
                        <Button variant="ghost" onClick={() => userOp(u, "deactivate")}>
                          Pasifleştir
                        </Button>
                      ) : (
                        <Button variant="ghost" onClick={() => userOp(u, "reactivate")}>
                          Aktifleştir
                        </Button>
                      )}
                      {u.status === "active" ? (
                        <Button variant="ghost" onClick={() => userOp(u, "password_reset")}>
                          Şifre sıfırla
                        </Button>
                      ) : null}
                    </span>
                  </td>
                </tr>
                {open === u.userId
                  ? u.sessions.map((s) => (
                      <tr key={s.id} className="border-b text-xs" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-muted)" }}>
                        <td className="px-3 py-1.5" colSpan={2}>
                          <code>{s.id.slice(0, 14)}…</code> {s.current ? <strong>(bu oturum)</strong> : null}
                        </td>
                        <td>açıldı {ago(s.createdAt)}</td>
                        <td colSpan={2}>bitiş {new Date(s.expiresAt).toLocaleString("tr-TR")}</td>
                        <td>{ago(s.lastSeenAt)}</td>
                        <td>{s.lastPath ?? s.lastAction ?? "—"}</td>
                        <td>{s.device ?? "—"}</td>
                        <td className="px-3">
                          {!s.current ? (
                            <Button
                              variant="danger"
                              onClick={() =>
                                ask({
                                  title: "Oturumu sonlandır",
                                  description: "Bu cihazdaki oturumun bir sonraki isteği reddedilir.",
                                  needsReason: true,
                                  run: async (r) => {
                                    await call("/api/v1/platform/sessions", { op: "revoke", sessionId: s.id, reason: r }, "Oturum sonlandırıldı; denetim kaydı yazıldı.");
                                  },
                                })
                              }
                            >
                              Sonlandır
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  : null}
              </FragmentRow>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold">Bekleyen davetler</h2>
        {invitations.length === 0 ? <p className="mt-1 text-sm text-[var(--color-text-muted)]">Bekleyen davet yok.</p> : null}
        <ul className="mt-2 space-y-1 text-sm">
          {invitations.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {i.name} · {i.emailMasked} · {roleLabelTr(i.role as AppRole)} · {i.tenantName}
                <span className="ml-1 text-xs text-[var(--color-text-muted)]">bitiş {new Date(i.expiresAt).toLocaleDateString("tr-TR")}</span>
              </span>
              <span className="flex gap-1">
                <Button
                  variant="secondary"
                  onClick={async () => {
                    const d = await call<{ invitePath?: string }>("/api/v1/platform/users", { op: "invite_resend", invitationId: i.id }, "Yeni davet bağlantısı üretildi; eskisi iptal edildi.");
                    if (d?.invitePath) setMsg({ kind: "ok", text: `Yeni davet bağlantısı (bir kez gösterilir, e-posta gönderilmedi): ${window.location.origin}${d.invitePath}` });
                  }}
                >
                  Yeniden gönder
                </Button>
                <Button variant="ghost" onClick={() => call("/api/v1/platform/users", { op: "invite_revoke", invitationId: i.id }, "Davet iptal edildi.")}>
                  İptal et
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {pending ? (
        <div role="alertdialog" aria-labelledby="lo-title" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-[var(--radius-lg)] border p-5 shadow-[var(--shadow-md)]" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
            <h2 id="lo-title" className="text-base font-semibold">{pending.title}</h2>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">{pending.description}</p>
            {pending.needsReason ? (
              <Input className="mt-3" aria-label="Gerekçe" placeholder="Gerekçe (en az 5 karakter)" value={reason} onChange={(e) => setReason(e.target.value)} />
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPending(null)} disabled={busy}>
                Vazgeç
              </Button>
              <Button
                variant="danger"
                disabled={busy || (pending.needsReason && reason.trim().length < 5)}
                onClick={async () => {
                  setBusy(true);
                  await pending.run(reason);
                  setBusy(false);
                  setPending(null);
                }}
              >
                Onayla
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
