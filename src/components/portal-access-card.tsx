"use client";

/**
 * Portal erişim yönetimi görevi — öğrenci VE öğretmen detay ekranlarında
 * kullanılan paylaşılan "Portal erişimi" kartı. Öğrenci tarafı çoklu hesap
 * destekler (veli + öğrencinin kendisi — StudentPortalAccess many-to-many);
 * öğretmen tarafı tek hesaptır (User.teacherId). İki ayrı bileşen olarak
 * (StudentPortalAccessCard / TeacherPortalAccessCard) ama ORTAK görsel
 * alt-parçalarla (StatusBadge, ActionButton) yazıldı — davranışları
 * yeterince farklı (çoklu hesap listesi vs tek satır) olduğu için tek bir
 * generic bileşene zorlamak okunabilirliği düşürürdü.
 */

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import {
  actionGetStudentPortalAccess,
  actionRevokeStudentPortalAccess,
  actionReactivateStudentPortalAccess,
  actionSendStudentPortalPasswordReset,
  actionInviteStudentPortalAccess,
  actionGetTeacherAccountStatus,
  actionSetTeacherAccountActive,
  actionSendTeacherPasswordReset,
  actionInviteTeacherAccount,
  actionGetStaffAccountStatus,
  actionSetStaffAccountActive,
  actionSendStaffPasswordReset,
  actionInviteStaffAccount,
} from "@/lib/actions";
import type {
  StudentPortalAccessSummaryRow,
  TeacherAccountStatusSummary,
  StaffAccountStatusSummary,
} from "@/lib/services/tools";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function StatusBadge({ tone, children }: { tone: "green" | "amber" | "gray" | "red"; children: React.ReactNode }) {
  const cls =
    tone === "green"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : tone === "amber"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : tone === "red"
          ? "bg-rose-50 text-rose-800 border-rose-200"
          : "bg-gray-50 text-gray-700 border-gray-200";
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}

function inviteStatusLabel(status: "invited" | "active" | "revoked"): { label: string; tone: "green" | "amber" | "gray" | "red" } {
  if (status === "active") return { label: "Kabul edildi / Aktif", tone: "green" };
  if (status === "invited") return { label: "Gönderildi (kabul bekleniyor)", tone: "amber" };
  return { label: "Erişim kapalı", tone: "red" };
}

/* --------------------------- Öğrenci --------------------------- */

export function StudentPortalAccessCard({ studentId, defaultEmail }: { studentId: string; defaultEmail?: string }) {
  const [accounts, setAccounts] = useState<StudentPortalAccessSummaryRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [rowMessage, setRowMessage] = useState<Record<string, { tone: "ok" | "error"; text: string }>>({});

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState(defaultEmail ?? "");
  const [inviteType, setInviteType] = useState<"SELF" | "GUARDIAN">("GUARDIAN");
  const [invitePending, setInvitePending] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const result = await actionGetStudentPortalAccess({ studentId });
    if (!result.ok) {
      setLoadError(result.message);
      return;
    }
    setLoadError(null);
    setAccounts(result.accounts);
  }, [studentId]);

  useEffect(() => {
    // Bileşen bağlandığında/studentId|teacherId değişince veriyi getir — load()
    // içindeki setState çağrıları await SONRASI (senkron değil); eslint'in
    // set-state-in-effect kuralı async fetch-on-mount deseninde yanlış pozitif verir.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function onRevoke(userId: string) {
    setBusyUserId(userId);
    setRowMessage((m) => ({ ...m, [userId]: undefined as unknown as { tone: "ok" | "error"; text: string } }));
    const result = await actionRevokeStudentPortalAccess({ studentId, userId });
    setBusyUserId(null);
    setRowMessage((m) => ({ ...m, [userId]: result.ok ? { tone: "ok", text: "Erişim kapatıldı." } : { tone: "error", text: result.message } }));
    if (result.ok) await load();
  }

  async function onReactivate(userId: string) {
    setBusyUserId(userId);
    const result = await actionReactivateStudentPortalAccess({ studentId, userId });
    setBusyUserId(null);
    setRowMessage((m) => ({ ...m, [userId]: result.ok ? { tone: "ok", text: "Erişim yeniden açıldı." } : { tone: "error", text: result.message } }));
    if (result.ok) await load();
  }

  async function onSendReset(userId: string) {
    setBusyUserId(userId);
    const result = await actionSendStudentPortalPasswordReset({ studentId, userId });
    setBusyUserId(null);
    if (!result.ok) {
      setRowMessage((m) => ({ ...m, [userId]: { tone: "error", text: result.message } }));
    } else if (result.delivered) {
      setRowMessage((m) => ({ ...m, [userId]: { tone: "ok", text: "Şifre sıfırlama e-postası gönderildi." } }));
    } else {
      setRowMessage((m) => ({
        ...m,
        [userId]: { tone: "error", text: "Kayıt oluşturuldu ama e-posta GÖNDERİLEMEDİ — bu ortamda e-posta sağlayıcısı yapılandırılmamış." },
      }));
    }
    await load();
  }

  async function onInvite() {
    setInviteMessage(null);
    if (!inviteEmail.trim()) {
      setInviteMessage({ tone: "error", text: "Önce geçerli bir e-posta adresi ekleyin." });
      return;
    }
    setInvitePending(true);
    const result = await actionInviteStudentPortalAccess({ studentId, email: inviteEmail.trim(), accessType: inviteType });
    setInvitePending(false);
    if (!result.ok) {
      setInviteMessage({ tone: "error", text: result.message });
      return;
    }
    if (result.delivered) {
      setInviteMessage({ tone: "ok", text: "Davet e-postası gönderildi." });
    } else {
      setInviteMessage({ tone: "error", text: "Davet kaydı oluşturuldu ama e-posta GÖNDERİLEMEDİ — bu ortamda e-posta sağlayıcısı yapılandırılmamış." });
    }
    setInviteOpen(false);
    await load();
  }

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">Portal erişimi</h2>

      {loadError ? <p className="text-xs font-medium text-rose-600">{loadError}</p> : null}

      {accounts === null && !loadError ? <p className="text-sm text-[var(--color-text-muted)]">Yükleniyor…</p> : null}

      {accounts && accounts.length === 0 ? (
        <div className="mb-3 space-y-1">
          <p className="text-sm text-[var(--color-text-muted)]">Bu öğrenci için henüz portal hesabı oluşturulmadı.</p>
          {!defaultEmail ? (
            <p className="text-xs font-medium text-rose-600">
              Davet göndermek için önce öğrenci/veli e-posta adresi ekleyin.
            </p>
          ) : null}
        </div>
      ) : null}

      {accounts && accounts.length > 0 ? (
        <ul className="mb-3 space-y-3">
          {accounts.map((a) => {
            const st = inviteStatusLabel(a.status);
            const msg = rowMessage[a.userId];
            const busy = busyUserId === a.userId;
            return (
              <li key={a.userId} className="rounded-lg border border-[var(--color-border)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-[var(--color-text)]">{a.email || "(e-posta yok)"}</span>
                  <StatusBadge tone={a.status === "revoked" ? "red" : st.tone}>
                    {a.accessType === "SELF" ? "Öğrencinin kendisi" : "Veli"} · {st.label}
                  </StatusBadge>
                </div>
                <dl className="mt-2 grid grid-cols-1 gap-1 text-xs text-[var(--color-text-muted)] sm:grid-cols-2">
                  <div>Son davet gönderimi: {formatDateTime(a.invitedAt)}</div>
                  <div>Kabul zamanı: {formatDateTime(a.activatedAt)}</div>
                  <div>Şifre sıfırlama son istek: {formatDateTime(a.lastPasswordResetRequestedAt)}</div>
                  {a.revokedAt ? <div>Kapatılma zamanı: {formatDateTime(a.revokedAt)}</div> : null}
                </dl>
                <div className="mt-2 flex flex-wrap gap-2">
                  {a.status === "revoked" ? (
                    <Button variant="secondary" disabled={busy} onClick={() => onReactivate(a.userId)}>
                      {busy ? "İşleniyor…" : "Portal erişimini aç"}
                    </Button>
                  ) : (
                    <Button variant="secondary" disabled={busy} onClick={() => onRevoke(a.userId)}>
                      {busy ? "İşleniyor…" : "Portal erişimini kapat"}
                    </Button>
                  )}
                  {a.status === "invited" ? (
                    <Button
                      variant="ghost"
                      disabled={busy || invitePending}
                      onClick={() => {
                        setInviteEmail(a.email);
                        setInviteType(a.accessType);
                        onInvite();
                      }}
                    >
                      Daveti yeniden gönder
                    </Button>
                  ) : null}
                  {a.status !== "revoked" ? (
                    <Button variant="ghost" disabled={busy} onClick={() => onSendReset(a.userId)}>
                      Şifre sıfırlama bağlantısı gönder
                    </Button>
                  ) : null}
                </div>
                {msg ? (
                  <p className={`mt-2 text-xs font-medium ${msg.tone === "ok" ? "text-emerald-700" : "text-rose-600"}`}>{msg.text}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {!inviteOpen ? (
        <Button variant="secondary" disabled={accounts?.length === 0 && !defaultEmail} onClick={() => setInviteOpen(true)}>
          {accounts && accounts.length === 0 ? "Portal erişimini aç ve davet gönder" : "Yeni portal daveti gönder"}
        </Button>
      ) : (
        <div className="space-y-2 rounded-lg border border-dashed border-[var(--color-border)] p-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>E-posta</Label>
              <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="veli@email.com" />
            </div>
            <div>
              <Label>Kime</Label>
              <Select value={inviteType} onChange={(e) => setInviteType(e.target.value as "SELF" | "GUARDIAN")}>
                <option value="GUARDIAN">Veli</option>
                <option value="SELF">Öğrencinin kendisi</option>
              </Select>
            </div>
          </div>
          {inviteMessage ? (
            <p className={`text-xs font-medium ${inviteMessage.tone === "ok" ? "text-emerald-700" : "text-rose-600"}`}>{inviteMessage.text}</p>
          ) : null}
          <div className="flex gap-2">
            <Button disabled={invitePending} onClick={onInvite}>
              {invitePending ? "Gönderiliyor…" : "Davet gönder"}
            </Button>
            <Button variant="ghost" disabled={invitePending} onClick={() => setInviteOpen(false)}>
              Vazgeç
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* --------------------------- Öğretmen --------------------------- */

export function TeacherPortalAccessCard({ teacherId, defaultEmail }: { teacherId: string; defaultEmail?: string }) {
  const [status, setStatus] = useState<TeacherAccountStatusSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const result = await actionGetTeacherAccountStatus({ teacherId });
    if (!result.ok) {
      setLoadError(result.message);
      return;
    }
    setLoadError(null);
    setStatus(result.status);
  }, [teacherId]);

  useEffect(() => {
    // Bileşen bağlandığında/studentId|teacherId değişince veriyi getir — load()
    // içindeki setState çağrıları await SONRASI (senkron değil); eslint'in
    // set-state-in-effect kuralı async fetch-on-mount deseninde yanlış pozitif verir.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function onToggle(active: boolean) {
    setPending(true);
    setMessage(null);
    const result = await actionSetTeacherAccountActive({ teacherId, active });
    setPending(false);
    setMessage(result.ok ? { tone: "ok", text: active ? "Erişim açıldı." : "Erişim kapatıldı." } : { tone: "error", text: result.message });
    if (result.ok) await load();
  }

  async function onInvite() {
    setPending(true);
    setMessage(null);
    const result = await actionInviteTeacherAccount({ teacherId });
    setPending(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
    } else if (result.delivered) {
      setMessage({ tone: "ok", text: "Davet e-postası gönderildi." });
    } else {
      setMessage({ tone: "error", text: "Davet kaydı oluşturuldu ama e-posta GÖNDERİLEMEDİ — bu ortamda e-posta sağlayıcısı yapılandırılmamış." });
    }
    await load();
  }

  async function onSendReset() {
    setPending(true);
    setMessage(null);
    const result = await actionSendTeacherPasswordReset({ teacherId });
    setPending(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
    } else if (result.delivered) {
      setMessage({ tone: "ok", text: "Şifre sıfırlama e-postası gönderildi." });
    } else {
      setMessage({ tone: "error", text: "Kayıt oluşturuldu ama e-posta GÖNDERİLEMEDİ — bu ortamda e-posta sağlayıcısı yapılandırılmamış." });
    }
    await load();
  }

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">Portal erişimi</h2>

      {loadError ? <p className="text-xs font-medium text-rose-600">{loadError}</p> : null}
      {status === null && !loadError ? <p className="text-sm text-[var(--color-text-muted)]">Yükleniyor…</p> : null}

      {status && !status.exists ? (
        <div className="space-y-2">
          <p className="text-sm text-[var(--color-text-muted)]">
            Bu öğretmen için henüz portal erişimi oluşturulmadı{defaultEmail ? "" : " — önce bir e-posta adresi ekleyin"}.
          </p>
          <Button disabled={pending || !defaultEmail} onClick={onInvite}>
            {pending ? "Gönderiliyor…" : "Davet e-postası gönder"}
          </Button>
          {!defaultEmail ? <p className="text-xs font-medium text-rose-600">Önce geçerli bir e-posta adresi ekleyin.</p> : null}
        </div>
      ) : null}

      {status && status.exists ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-[var(--color-text)]">{status.email}</span>
            <StatusBadge tone={status.active ? "green" : "red"}>{status.active ? "Erişim açık" : "Erişim kapalı"}</StatusBadge>
          </div>
          <dl className="grid grid-cols-1 gap-1 text-xs text-[var(--color-text-muted)] sm:grid-cols-2">
            <div>Şifre sıfırlama son istek: {formatDateTime(status.lastPasswordResetRequestedAt)}</div>
          </dl>
          <div className="flex flex-wrap gap-2">
            {status.active ? (
              <Button variant="secondary" disabled={pending} onClick={() => onToggle(false)}>
                Portal erişimini kapat
              </Button>
            ) : (
              <Button variant="secondary" disabled={pending} onClick={() => onToggle(true)}>
                Portal erişimini aç
              </Button>
            )}
            {status.active ? (
              <Button variant="ghost" disabled={pending} onClick={onSendReset}>
                Şifre sıfırlama bağlantısı gönder
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {message ? <p className={`text-xs font-medium ${message.tone === "ok" ? "text-emerald-700" : "text-rose-600"}`}>{message.text}</p> : null}
    </Card>
  );
}

/* --------------------------- Personel --------------------------- */

/**
 * P0 personel onboarding revizyonu — personel detay ekranındaki "Portal
 * erişimi" kartı. Öğretmen kartıyla AYNI desen (tek hesap): erişim durumu,
 * atanan rol, davet/aktivasyon durumu, son davet tarihi + daveti yeniden
 * gönderme / aç-kapat / şifre sıfırlama aksiyonları.
 */
export function StaffPortalAccessCard({ staffId, defaultEmail }: { staffId: string; defaultEmail?: string }) {
  const [status, setStatus] = useState<StaffAccountStatusSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const result = await actionGetStaffAccountStatus({ staffId });
    if (!result.ok) {
      setLoadError(result.message);
      return;
    }
    setLoadError(null);
    setStatus(result.status);
  }, [staffId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function onToggle(active: boolean) {
    setPending(true);
    setMessage(null);
    const result = await actionSetStaffAccountActive({ staffId, active });
    setPending(false);
    setMessage(result.ok ? { tone: "ok", text: active ? "Erişim açıldı." : "Erişim kapatıldı." } : { tone: "error", text: result.message });
    if (result.ok) await load();
  }

  async function onInvite() {
    setPending(true);
    setMessage(null);
    const result = await actionInviteStaffAccount({ staffId });
    setPending(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
    } else if (result.delivered) {
      setMessage({ tone: "ok", text: "Davet e-postası gönderildi." });
    } else {
      setMessage({ tone: "error", text: "Davet kaydı oluşturuldu ama e-posta GÖNDERİLEMEDİ — bu ortamda e-posta sağlayıcısı yapılandırılmamış." });
    }
    await load();
  }

  async function onSendReset() {
    setPending(true);
    setMessage(null);
    const result = await actionSendStaffPasswordReset({ staffId });
    setPending(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
    } else if (result.delivered) {
      setMessage({ tone: "ok", text: "Şifre sıfırlama e-postası gönderildi." });
    } else {
      setMessage({ tone: "error", text: "Kayıt oluşturuldu ama e-posta GÖNDERİLEMEDİ — bu ortamda e-posta sağlayıcısı yapılandırılmamış." });
    }
    await load();
  }

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">Portal erişimi</h2>

      {loadError ? <p className="text-xs font-medium text-rose-600">{loadError}</p> : null}
      {status === null && !loadError ? <p className="text-sm text-[var(--color-text-muted)]">Yükleniyor…</p> : null}

      {status && !status.exists ? (
        <div className="space-y-2">
          <p className="text-sm text-[var(--color-text-muted)]">
            Bu personel için henüz portal erişimi oluşturulmadı{defaultEmail ? "" : " — önce bir e-posta adresi ekleyin"}.
          </p>
          <Button disabled={pending || !defaultEmail} onClick={onInvite}>
            {pending ? "Gönderiliyor…" : "Davet e-postası gönder"}
          </Button>
          {!defaultEmail ? <p className="text-xs font-medium text-rose-600">Önce geçerli bir e-posta adresi ekleyin.</p> : null}
        </div>
      ) : null}

      {status && status.exists ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-[var(--color-text)]">{status.email}</span>
            <StatusBadge tone={status.active ? "green" : "red"}>{status.active ? "Erişim açık" : "Erişim kapalı"}</StatusBadge>
            {status.role ? <StatusBadge tone="gray">{status.role === "SCHOOL_ADMIN" ? "Yönetim paneli" : status.role}</StatusBadge> : null}
          </div>
          <dl className="grid grid-cols-1 gap-1 text-xs text-[var(--color-text-muted)] sm:grid-cols-2">
            <div>Son davet gönderimi: {formatDateTime(status.lastInvitedAt)}</div>
            <div>Şifre sıfırlama son istek: {formatDateTime(status.lastPasswordResetRequestedAt)}</div>
          </dl>
          <div className="flex flex-wrap gap-2">
            {status.active ? (
              <Button variant="secondary" disabled={pending} onClick={() => onToggle(false)}>
                Portal erişimini kapat
              </Button>
            ) : (
              <Button variant="secondary" disabled={pending} onClick={() => onToggle(true)}>
                Portal erişimini aç
              </Button>
            )}
            <Button variant="ghost" disabled={pending} onClick={onInvite}>
              Daveti yeniden gönder
            </Button>
            {status.active ? (
              <Button variant="ghost" disabled={pending} onClick={onSendReset}>
                Şifre sıfırlama bağlantısı gönder
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {message ? <p className={`text-xs font-medium ${message.tone === "ok" ? "text-emerald-700" : "text-rose-600"}`}>{message.text}</p> : null}
    </Card>
  );
}
