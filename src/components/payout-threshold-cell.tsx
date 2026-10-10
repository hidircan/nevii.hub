"use client";

/**
 * 10. tur iş #11 — Hakedişler ana ekranında öğretmen satırında eşik yönetimi.
 * Salt görüntü + satır-içi düzenleme (yetki: SCHOOL_ADMIN/SUPER_ADMIN —
 * sunucu `updateTeacherProfileTool` ile aynı kapı, istemcide yalnız
 * görünürlük). Eşik öğretmene özeldir; genel bir eşik AYARI YOKTUR —
 * burası tüm öğretmenlerin eşiklerini tek ekrandan yönetme evidir.
 * Kayıtlı hakedişlerin yöntemini değiştirmez (yalnız gelecek kayıtların
 * varsayımı).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { actionUpdateTeacherProfile } from "@/lib/actions";

export function PayoutThresholdCell({
  teacherId,
  teacherName,
  threshold,
  canEdit,
}: {
  teacherId: string;
  teacherName: string;
  threshold?: number;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(threshold !== undefined ? String(threshold) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className={threshold === undefined ? "text-[var(--color-text-muted)]" : undefined}>
          {threshold === undefined ? "Tanımlı değil" : `${threshold} sa`}
        </span>
        {canEdit ? (
          <button
            type="button"
            onClick={() => {
              setValue(threshold !== undefined ? String(threshold) : "");
              setError(null);
              setEditing(true);
            }}
            className="text-xs font-medium text-amber-700 hover:underline"
            aria-label={`${teacherName} için eşiği düzenle`}
          >
            Düzenle
          </button>
        ) : null}
      </span>
    );
  }

  async function save() {
    const trimmed = value.trim();
    const n = Number(trimmed);
    // Profil yaması `undefined` alanları KORUR (temizlemez) — boş giriş
    // burada hata verilir, sessiz no-op yapılmaz.
    if (trimmed === "" || !Number.isInteger(n) || n < 1 || n > 80) {
      setError("Eşik 1 ile 80 arasında tam sayı olmalı.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await actionUpdateTeacherProfile({
      teacherId,
      weeklyHoursThreshold: n,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <input
        type="number"
        min={1}
        max={80}
        value={value}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        placeholder="—"
        aria-label={`${teacherName} haftalık saat eşiği`}
        className="w-16 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1 text-xs"
      />
      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-50"
      >
        {saving ? "…" : "Kaydet"}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        disabled={saving}
        className="text-xs text-[var(--color-text-muted)] hover:underline"
      >
        Vazgeç
      </button>
      {error ? (
        <span role="alert" className="w-full text-[11px] font-medium text-rose-600">
          {error}
        </span>
      ) : null}
    </span>
  );
}
