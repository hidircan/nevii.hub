"use client";

import { useState } from "react";
import { Button, Input, Label } from "@/components/ui";

export function AccountPasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" | "success" | "error"; message?: string }>({ kind: "idle" });
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: "idle" });

    if (newPassword.length < 8) {
      setStatus({ kind: "error", message: "Yeni şifre en az 8 karakter olmalı." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setStatus({ kind: "error", message: "Yeni şifre tekrarı eşleşmiyor." });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/account/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setStatus({ kind: "success", message: "Şifreniz güncellendi." });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setStatus({ kind: "error", message: json.error?.message || "Şifre değiştirilemedi." });
      }
    } catch {
      setStatus({ kind: "error", message: "Bağlantı hatası — tekrar deneyin." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <Label>Mevcut şifre</Label>
        <Input
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      </div>
      <div>
        <Label>Yeni şifre</Label>
        <Input
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          minLength={8}
          required
        />
      </div>
      <div>
        <Label>Yeni şifre (tekrar)</Label>
        <Input
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          minLength={8}
          required
        />
      </div>

      {status.kind === "error" ? (
        <p role="alert" className="rounded-[var(--radius-md)] border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-3 py-2 text-xs text-[var(--color-danger)]">
          {status.message}
        </p>
      ) : null}
      {status.kind === "success" ? (
        <p role="status" className="rounded-[var(--radius-md)] border border-[var(--color-success)]/30 bg-[var(--color-success-soft)] px-3 py-2 text-xs text-[var(--color-success)]">
          {status.message}
        </p>
      ) : null}

      <Button type="submit" disabled={submitting}>
        {submitting ? "Kaydediliyor…" : "Şifreyi güncelle"}
      </Button>
    </form>
  );
}
