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
  actionChangeTeacherPortalEmail,
  actionGetStaffAccountStatus,
  actionSetStaffAccountActive,
  actionSendStaffPasswordReset,
  actionInviteStaffAccount,
  type MobileAccessSummary,
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

/** Efektif MOBİL erişim satırı — sunucudaki getMobilePolicy kararı (giriş hesabından ayrı). */
function MobileAccessLine({ mobile }: { mobile: MobileAccessSummary }) {
  if (!mobile) return null;
  return mobile.allowed ? (
    <p className="text-xs font-medium text-emerald-700">Mobil uygulama: izinli</p>
  ) : (
    <p className="text-xs font-medium text-rose-700">Mobil uygulama: kapalı — {mobile.reasons.join(" ")}</p>
  );
}

function inviteStatusLabel(status: "invited" | "active" | "revoked"): { label: string; tone: "green" | "amber" | "gray" | "red" } {
  if (status === "active") return { label: "Giriş hesabı açık", tone: "green" };
  if (status === "invited") return { label: "Gönderildi (kabul bekleniyor)", tone: "amber" };
  return { label: "Giriş hesabı kapalı", tone: "red" };
}

/* --------------------------- Öğrenci --------------------------- */

export function StudentPortalAccessCard({ studentId, defaultEmail }: { studentId: string; defaultEmail?: string }) {
  const [accounts, setAccounts] = useState<StudentPortalAccessSummaryRow[] | null>(null);
  const [mobile, setMobile] = useState<MobileAccessSummary>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [rowMessage, setRowMessage] = useState<Record<string, { tone: "ok" | "error"; text: string }>>({});

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState(defaultEmail ?? "");
  const [inviteType, setInviteType] = useState<"SELF" | "GUARDIAN">("GUARDIAN");
  const [invitePending, setInvitePending] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  // Yalnız bu admin oturumunun belleğinde tutulur; hiçbir yere loglanmaz/kalıcı yazılmaz.
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const load = useCallback(async () => {
    const result = await actionGetStudentPortalAccess({ studentId });
    if (!result.ok) {
      setLoadError(result.message);
      return;
    }
    setLoadError(null);
    setAccounts(result.accounts);
    setMobile(result.mobile);
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

  // Parametreli: "Daveti yeniden gönder" satırın e-posta/tipini setState beklemeden iletir.
  async function onInvite(email = inviteEmail, accessType = inviteType) {
    setInviteMessage(null);
    setInviteLink(null);
    setLinkCopied(false);
    if (!email.trim()) {
      setInviteMessage({ tone: "error", text: "Önce geçerli bir e-posta adresi ekleyin." });
      return;
    }
    setInvitePending(true);
    const result = await actionInviteStudentPortalAccess({ studentId, email: email.trim(), accessType });
    setInvitePending(false);
    if (!result.ok) {
      setInviteMessage({ tone: "error", text: result.message });
      return;
    }
    // 10. tur iş #1 — mevcut kullanılabilir hesaba şifre daveti GÖNDERİLMEZ,
    // erişim doğrudan bağlanır (şifre değişmez). Yetkili admin'e açıklayıcı bilgi.
    if (result.linkedExistingAccount) {
      setInviteMessage({
        tone: "ok",
        text: "Bu e-postaya ait portal hesabı mevcut; bu öğrenciye erişim bağlandı. Mevcut şifre değişmedi — kullanıcı aynı şifresiyle giriş yapıp öğrenciler arasında geçiş yapabilir.",
      });
    } else if (result.delivered) {
      setInviteMessage({ tone: "ok", text: "Davet e-postası gönderildi." });
    } else {
      setInviteMessage({
        tone: "error",
        text: result.blocked
          ? "Davet kaydı oluşturuldu ama e-posta GÖNDERİLEMEDİ — bu ortamda e-posta sağlayıcısı yapılandırılmamış. Davet linkini kopyalayıp kişiye güvenli bir kanaldan iletebilirsiniz."
          : "Davet kaydı oluşturuldu ama e-posta GÖNDERİLEMEDİ — e-posta sağlayıcısı gönderimi reddetti. Davet linkini kopyalayıp kişiye güvenli bir kanaldan iletebilirsiniz.",
      });
      setInviteLink(result.activationLink ?? null);
    }
    setInviteOpen(false);
    await load();
  }

  async function onCopyInviteLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setLinkCopied(true);
    } catch {
      setInviteMessage({ tone: "error", text: "Link panoya kopyalanamadı — tarayıcı izin vermedi." });
    }
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
        <div className="mb-2">
          <MobileAccessLine mobile={mobile} />
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
                        onInvite(a.email, a.accessType);
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

      {!inviteOpen && inviteMessage ? (
        <p className={`mb-2 text-xs font-medium ${inviteMessage.tone === "ok" ? "text-emerald-700" : "text-rose-600"}`}>{inviteMessage.text}</p>
      ) : null}
      {!inviteOpen && inviteLink ? (
        <div className="mb-3">
          <Button variant="secondary" onClick={onCopyInviteLink}>
            {linkCopied ? "Davet linki kopyalandı" : "Davet linkini kopyala"}
          </Button>
        </div>
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
            <Button disabled={invitePending} onClick={() => onInvite()}>
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

export function TeacherPortalAccessCard({
  teacherId,
  defaultEmail,
  canChangePortalEmail = false,
}: {
  teacherId: string;
  defaultEmail?: string;
  /** 2026-10-14 — yalnız kurum sahibi (sunucu da ayrıca doğrular). */
  canChangePortalEmail?: boolean;
}) {
  const [status, setStatus] = useState<TeacherAccountStatusSummary | null>(null);
  const [mobile, setMobile] = useState<MobileAccessSummary>(null);
  const [emailChangeOpen, setEmailChangeOpen] = useState(false);
  const [newPortalEmail, setNewPortalEmail] = useState("");
  const [emailChangeConfirmed, setEmailChangeConfirmed] = useState(false);
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
    setMobile(result.mobile);
  }, [teacherId]);

  useEffect(() => {
    // Bileşen bağlandığında/studentId|teacherId değişince veriyi getir — load()
    // içindeki setState çağrıları await SONRASI (senkron değil); eslint'in
    // set-state-in-effect kuralı async fetch-on-mount deseninde yanlış pozitif verir.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load, defaultEmail]);

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

  async function onChangePortalEmail() {
    if (!emailChangeConfirmed) return;
    setPending(true);
    setMessage(null);
    const result = await actionChangeTeacherPortalEmail({ teacherId, newEmail: newPortalEmail.trim(), confirm: true });
    setPending(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.message });
      return;
    }
    setEmailChangeOpen(false);
    setNewPortalEmail("");
    setEmailChangeConfirmed(false);
    setMessage(
      result.mode === "pending_invitation_updated"
        ? { tone: "ok", text: `Bekleyen davetin adresi ${result.newEmail} oldu; eski davet bağlantısı geçersiz. Yeni daveti "Davet gönder" ile iletin.` }
        : result.delivered
          ? { tone: "ok", text: `Doğrulama bağlantısı ${result.newEmail} adresine gönderildi. Öğretmen bağlantıyı açana kadar giriş adresi DEĞİŞMEZ.` }
          : { tone: "error", text: `Değişiklik isteği kaydedildi ama doğrulama e-postası ${result.newEmail} adresine GÖNDERİLEMEDİ — e-posta sağlayıcısını kontrol edip isteği yeniden gönderin. Giriş adresi değişmedi.` }
    );
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
          <p className="text-sm text-[var(--color-text)]">
            İletişim e-postası: <span className="font-medium">{defaultEmail || "Eklenmemiş"}</span>
          </p>
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
          <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-[var(--color-text-muted)]">İletişim e-postası</dt>
              <dd className="font-medium text-[var(--color-text)]">{defaultEmail || "Eklenmemiş"}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--color-text-muted)]">Portal giriş e-postası</dt>
              <dd className="flex flex-wrap items-center gap-2 font-medium text-[var(--color-text)]">
                {status.email || "Bilinmiyor"}
                <StatusBadge tone={status.active ? "green" : "red"}>{status.active ? "Giriş hesabı açık" : "Giriş hesabı kapalı"}</StatusBadge>
              </dd>
            </div>
          </dl>
          <MobileAccessLine mobile={mobile} />
          {status.pendingEmailChange ? (
            <p className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900" role="status">
              Bekleyen yeni giriş adresi: {status.pendingEmailChange.newEmail} — doğrulanmadı, giriş hâlâ {status.email} ile yapılır
              (bağlantı {formatDateTime(status.pendingEmailChange.expiresAt)} tarihine kadar geçerli).
            </p>
          ) : null}
          {status.invitationPending ? (
            <p className="text-xs text-amber-800">
              {status.invitationLinkActive
                ? "Davet kabul edilmeyi bekliyor."
                : "Eski davet bağlantısı geçersiz; yeni davet yönetici tarafından gönderilmelidir."}
            </p>
          ) : status.email.toLowerCase() !== (defaultEmail ?? "").trim().toLowerCase() ? (
            <p className="text-xs text-[var(--color-text-muted)]">
              İletişim e-postası ile portal giriş e-postası ayrı kayıtlardır; profildeki iletişim adresini değiştirmek giriş adresini
              değiştirmez. Giriş e-postasını yalnız kurum sahibi &quot;Portal e-postasını değiştir&quot; ile değiştirir.
            </p>
          ) : null}
          <dl className="grid grid-cols-1 gap-1 text-xs text-[var(--color-text-muted)] sm:grid-cols-2">
            <div>Son davet/şifre bağlantısı isteği: {formatDateTime(status.lastPasswordResetRequestedAt)}</div>
          </dl>
          <div className="flex flex-wrap gap-2">
            {status.invitationPending ? (
              <Button variant="secondary" disabled={pending || !defaultEmail} onClick={onInvite}>
                {pending ? "Gönderiliyor…" : status.invitationLinkActive ? "Davet e-postasını yeniden gönder" : "Davet gönder"}
              </Button>
            ) : null}
            {status.active ? (
              <Button variant="secondary" disabled={pending} onClick={() => onToggle(false)}>
                Portal erişimini kapat
              </Button>
            ) : (
              <Button variant="secondary" disabled={pending} onClick={() => onToggle(true)}>
                Portal erişimini aç
              </Button>
            )}
            {status.active && !status.invitationPending ? (
              <Button variant="ghost" disabled={pending} onClick={onSendReset}>
                Şifre sıfırlama bağlantısı gönder
              </Button>
            ) : null}
            {canChangePortalEmail && !emailChangeOpen ? (
              <Button variant="ghost" disabled={pending} onClick={() => setEmailChangeOpen(true)}>
                Portal e-postasını değiştir
              </Button>
            ) : null}
          </div>
          {canChangePortalEmail && emailChangeOpen ? (
            <div className="space-y-2 rounded-md border border-[var(--color-border)] p-3">
              <Label>Yeni portal giriş e-postası</Label>
              <Input
                aria-label="Yeni portal giriş e-postası"
                type="email"
                autoComplete="off"
                value={newPortalEmail}
                onChange={(e) => {
                  setNewPortalEmail(e.target.value);
                  setEmailChangeConfirmed(false);
                }}
              />
              {newPortalEmail.trim() ? (
                <div className="space-y-1 text-xs text-[var(--color-text)]">
                  <p>
                    Eski: <span className="font-medium">{status.email}</span> → Yeni: <span className="font-medium">{newPortalEmail.trim().toLowerCase()}</span>
                  </p>
                  <p className="text-[var(--color-text-muted)]">
                    {status.invitationPending
                      ? "Davet henüz kabul edilmedi: giriş ve davet adresi hemen yeni adres olur, eski davet bağlantısı geçersizleşir; yeni daveti ayrıca gönderirsiniz."
                      : "Giriş adresi hemen DEĞİŞMEZ: yeni adrese doğrulama bağlantısı, eski adrese güvenlik bildirimi gider. Bağlantı açılınca öğretmen yeni adresle girer, açık oturumları kapanır ve eski sıfırlama/davet bağlantıları geçersizleşir. Öğretmenin dersleri ve yetkileri değişmez."}
                  </p>
                  <label className="flex items-start gap-2">
                    <input type="checkbox" checked={emailChangeConfirmed} onChange={(e) => setEmailChangeConfirmed(e.target.checked)} />
                    <span>Eski/yeni adresi ve girişe etkisini okudum; değişikliği onaylıyorum.</span>
                  </label>
                </div>
              ) : null}
              <div className="flex gap-2">
                <Button disabled={pending || !newPortalEmail.trim() || !emailChangeConfirmed} onClick={onChangePortalEmail}>
                  {pending ? "Gönderiliyor…" : "Değişikliği başlat"}
                </Button>
                <Button
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    setEmailChangeOpen(false);
                    setNewPortalEmail("");
                    setEmailChangeConfirmed(false);
                  }}
                >
                  Vazgeç
                </Button>
              </div>
            </div>
          ) : null}
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
  const [mobile, setMobile] = useState<MobileAccessSummary>(null);
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
    setMobile(result.mobile);
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
            <StatusBadge tone={status.active ? "green" : "red"}>{status.active ? "Giriş hesabı açık" : "Giriş hesabı kapalı"}</StatusBadge>
            {status.role ? <StatusBadge tone="gray">{status.role === "SCHOOL_ADMIN" ? "Yönetim paneli" : status.role}</StatusBadge> : null}
          </div>
          <MobileAccessLine mobile={mobile} />
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
