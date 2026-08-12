"use client";

/**
 * Bildirim ayarları — kategori bazlı in-app switch'ler.
 * Push altyapısı yok; sahte push switch'i yok.
 * Yalnız çağıranın kendi tercihleri (server actions userId almaz).
 */
import { useMemo, useState, useTransition } from "react";
import {
  actionResetNotificationPreferences,
  actionSetNotificationPreferences,
} from "@/lib/actions";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_GROUPS,
  NOTIFICATION_GROUP_ORDER,
  type NotificationCategory,
  type NotificationCategoryGroup,
} from "@/lib/notification-categories";
import { Button } from "@/components/ui";

type PrefRow = { category: string; inAppEnabled: boolean; pushEnabled: boolean };

export function NotificationPreferencesForm({ initialPreferences }: { initialPreferences: PrefRow[] }) {
  const [prefs, setPrefs] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(initialPreferences.map((p) => [p.category, p.inAppEnabled]))
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const implemented = useMemo(
    () => NOTIFICATION_CATEGORIES.filter((c) => c.implemented && !c.criticalLocked),
    []
  );

  function setCategory(category: string, enabled: boolean) {
    setPrefs((prev) => ({ ...prev, [category]: enabled }));
    setSuccess(null);
    setError(null);
  }

  function applyBulk(enabled: boolean) {
    setPrefs((prev) => {
      const next = { ...prev };
      for (const c of implemented) next[c.category] = enabled;
      return next;
    });
    setSuccess(null);
    setError(null);
  }

  function save(updates: Array<{ category: string; inAppEnabled: boolean }>) {
    startTransition(async () => {
      setError(null);
      setSuccess(null);
      const res = await actionSetNotificationPreferences({ updates });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setPrefs(Object.fromEntries(res.data.preferences.map((p) => [p.category, p.inAppEnabled])));
      setSuccess("Tercihler kaydedildi.");
    });
  }

  function onSaveAll() {
    const updates = implemented.map((c) => ({
      category: c.category,
      inAppEnabled: prefs[c.category] ?? c.defaultInAppEnabled,
    }));
    save(updates);
  }

  function onEnableAll() {
    applyBulk(true);
    save(implemented.map((c) => ({ category: c.category, inAppEnabled: true })));
  }

  function onDisableAll() {
    applyBulk(false);
    save(implemented.map((c) => ({ category: c.category, inAppEnabled: false })));
  }

  function onReset() {
    startTransition(async () => {
      setError(null);
      setSuccess(null);
      const res = await actionResetNotificationPreferences();
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setPrefs(Object.fromEntries(res.data.preferences.map((p) => [p.category, p.inAppEnabled])));
      setSuccess("Varsayılan tercihlere dönüldü.");
    });
  }

  return (
    <div className="space-y-6">
      <div
        className="rounded-[var(--radius-md)] border px-3 py-2.5 text-xs"
        style={{
          borderColor: "var(--color-border)",
          background: "var(--color-surface-muted)",
          color: "var(--color-text-muted)",
        }}
      >
        Push bildirimleri yakında desteklenecek. Şimdilik yalnızca uygulama içi bildirimleri yönetebilirsiniz.
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={onEnableAll} disabled={pending} className="text-xs">
          Tümünü aç
        </Button>
        <Button type="button" variant="secondary" onClick={onDisableAll} disabled={pending} className="text-xs">
          Tümünü kapat
        </Button>
        <Button type="button" variant="secondary" onClick={onReset} disabled={pending} className="text-xs">
          Varsayılana dön
        </Button>
        <Button type="button" onClick={onSaveAll} disabled={pending} className="text-xs">
          {pending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </div>

      {error ? (
        <p
          className="rounded-[var(--radius-md)] border px-3 py-2 text-sm"
          style={{
            borderColor: "var(--color-danger)",
            background: "var(--color-danger-soft, var(--color-surface-muted))",
            color: "var(--color-danger)",
          }}
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="text-sm font-medium" style={{ color: "var(--color-success)" }}>
          {success}
        </p>
      ) : null}

      {NOTIFICATION_GROUP_ORDER.map((group) => (
        <CategoryGroup
          key={group}
          group={group}
          prefs={prefs}
          disabled={pending}
          onToggle={setCategory}
        />
      ))}
    </div>
  );
}

function CategoryGroup({
  group,
  prefs,
  disabled,
  onToggle,
}: {
  group: NotificationCategoryGroup;
  prefs: Record<string, boolean>;
  disabled: boolean;
  onToggle: (category: string, enabled: boolean) => void;
}) {
  const items = NOTIFICATION_CATEGORIES.filter((c) => c.group === group);
  if (items.length === 0) return null;

  return (
    <section
      className="rounded-[var(--radius-lg)] border p-4 sm:p-5"
      style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
    >
      <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--color-text)" }}>
        {NOTIFICATION_CATEGORY_GROUPS[group]}
      </h2>
      <ul className="divide-y" style={{ borderColor: "var(--color-border)" }}>
        {items.map((def) => {
          const checked = prefs[def.category] ?? def.defaultInAppEnabled;
          const locked = !def.implemented || Boolean(def.criticalLocked);
          return (
            <li key={def.category} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                  {def.label}
                  {!def.implemented ? (
                    <span
                      className="ml-2 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{
                        background: "var(--color-surface-muted)",
                        color: "var(--color-text-muted)",
                      }}
                    >
                      Yakında
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs" style={{ color: "var(--color-text-muted)" }}>
                  {def.description}
                </p>
                {def.deferralNote ? (
                  <p className="mt-1 text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                    {def.deferralNote}
                  </p>
                ) : null}
              </div>
              <label
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition ${
                  locked || disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
                }`}
                style={{
                  background: checked ? "var(--color-primary)" : "var(--color-surface-muted)",
                  borderColor: checked ? "var(--color-primary)" : "var(--color-border-strong)",
                }}
              >
                <span className="sr-only">{def.label} uygulama içi bildirim</span>
                <input
                  type="checkbox"
                  role="switch"
                  className="sr-only"
                  checked={checked}
                  disabled={disabled || locked}
                  onChange={(e) => onToggle(def.category as NotificationCategory, e.target.checked)}
                />
                <span
                  className="pointer-events-none absolute top-0.5 h-4 w-4 rounded-full shadow transition"
                  style={{
                    left: checked ? "calc(100% - 1.125rem)" : "0.125rem",
                    background: "var(--color-surface)",
                    boxShadow: "var(--shadow-sm)",
                  }}
                  aria-hidden
                />
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
