"use client";

/**
 * İş Takip hatırlatma tercihleri — küçük bir modal (yeni büyük bir ayarlar
 * modülü DEĞİL). Her zaman ÇAĞIRANIN KENDİ tercihini okur/yazar
 * (actionGetTaskReminderPreference/actionUpdateTaskReminderPreference hiçbir
 * userId parametresi almaz — RBAC bunu tools.ts'te zaten garanti eder, bu
 * yalnızca ikinci bir UI savunması). "Sorumlu atandı" bildirimi bu
 * tercihlerden ETKİLENMEZ, ayrıca belirtilir.
 */

import { useEffect, useState } from "react";
import {
  actionGetTaskReminderPreference,
  actionUpdateTaskReminderPreference,
} from "@/lib/actions";
import { Button } from "@/components/ui";

type Prefs = { dueSoonEnabled: boolean; dueTodayEnabled: boolean; overdueEnabled: boolean };

const DEFAULT_PREFS: Prefs = { dueSoonEnabled: true, dueTodayEnabled: true, overdueEnabled: true };

export function TaskReminderPreferencesModal({ triggerClassName }: { triggerClassName?: string }) {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      setSuccess(false);
      const res = await actionGetTaskReminderPreference();
      if (cancelled) return;
      if (res.ok) setPrefs(res.data);
      else setError(res.message);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function onSave() {
    setSaving(true);
    setError(null);
    setSuccess(false);
    const res = await actionUpdateTaskReminderPreference(prefs);
    setSaving(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setPrefs(res.data);
    setSuccess(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          triggerClassName ??
          "text-sm font-medium text-[var(--color-primary)] hover:underline"
        }
      >
        Hatırlatma tercihleri
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Hatırlatma tercihleri"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-[var(--color-text)]">Hatırlatma tercihleri</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                aria-label="Kapat"
              >
                ✕
              </button>
            </div>

            {loading ? (
              <p className="text-sm text-[var(--color-text-muted)]">Yükleniyor…</p>
            ) : (
              <div className="space-y-3">
                <label className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4"
                    checked={prefs.dueSoonEnabled}
                    onChange={(e) => setPrefs((p) => ({ ...p, dueSoonEnabled: e.target.checked }))}
                  />
                  <span className="text-sm text-[var(--color-text)]">
                    Son tarih yaklaşırken bildir
                    <span className="block text-xs text-[var(--color-text-muted)]">
                      Görevin son tarihinden bir gün önce hatırlatma alın.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4"
                    checked={prefs.dueTodayEnabled}
                    onChange={(e) => setPrefs((p) => ({ ...p, dueTodayEnabled: e.target.checked }))}
                  />
                  <span className="text-sm text-[var(--color-text)]">
                    Son tarih günü bildir
                    <span className="block text-xs text-[var(--color-text-muted)]">
                      Görevin son tarihi geldiğinde sabah hatırlatma alın.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4"
                    checked={prefs.overdueEnabled}
                    onChange={(e) => setPrefs((p) => ({ ...p, overdueEnabled: e.target.checked }))}
                  />
                  <span className="text-sm text-[var(--color-text)]">
                    Geciken görevlerde bildir
                    <span className="block text-xs text-[var(--color-text-muted)]">
                      Bir görev son tarihini geçtiğinde günde bir kez hatırlatma alın.
                    </span>
                  </span>
                </label>

                <p className="text-xs text-[var(--color-text-muted)]">
                  Not: Size yeni bir görev atandığında gelen bildirim bu tercihlerden etkilenmez, her zaman gelir.
                </p>

                {error ? (
                  <p className="rounded-md bg-[var(--color-danger-soft)] px-3 py-2 text-xs font-medium text-[var(--color-danger)]" role="alert">
                    {error}
                  </p>
                ) : null}
                {success ? (
                  <p className="text-xs font-medium text-emerald-600">Tercihler kaydedildi.</p>
                ) : null}

                <div className="flex justify-end gap-2 pt-1">
                  <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
                    Kapat
                  </Button>
                  <Button type="button" onClick={() => void onSave()} disabled={saving}>
                    {saving ? "Kaydediliyor…" : "Kaydet"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
