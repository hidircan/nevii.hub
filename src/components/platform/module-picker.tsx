"use client";

import { useMemo, useState } from "react";
import { Card, Input } from "@/components/ui";
import type { CatalogModule } from "@/lib/platform/commercial-catalog";
import { checkModuleDeps, guideFor } from "@/lib/platform/module-guide";

type Props = {
  modules: CatalogModule[];
  selected: string[];
  disabled: boolean;
  onChange: (next: string[]) => void;
};

/**
 * Kategorili, aranabilir modül seçici. Her modülde fayda, durum
 * (hazır/kurulum gerekli), etki yüzeyi ve — varsa — API denetimi
 * uyarısı gösterilir. Denetlenmeyen bayrak pakete eklenebilir ama
 * erişimi teknik olarak kapatmaz; satışta yanıltıcı olmasın diye
 * bu durum gizlenmez.
 */
export function ModulePicker({ modules, selected, disabled, onChange }: Props) {
  const [q, setQ] = useState("");
  const term = q.trim().toLocaleLowerCase("tr");
  const filtered = useMemo(
    () =>
      term
        ? modules.filter((m) => `${m.label} ${m.description} ${guideFor(m.key).benefit}`.toLocaleLowerCase("tr").includes(term))
        : modules,
    [modules, term]
  );
  const groups = useMemo(() => {
    const map = new Map<string, CatalogModule[]>();
    for (const m of filtered) {
      const cat = guideFor(m.key).category;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(m);
    }
    return [...map.entries()];
  }, [filtered]);
  const depWarnings = checkModuleDeps(selected);

  function toggle(key: string, on: boolean) {
    onChange(on ? [...selected, key] : selected.filter((x) => x !== key));
  }

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Özellikler / modüller ({selected.length} seçili)</h2>
        <Input
          aria-label="Modül ara"
          placeholder="Modül ara…"
          value={q}
          disabled={disabled}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-56"
        />
      </div>
      {depWarnings.length > 0 ? (
        <ul role="alert" className="space-y-1 text-sm text-[var(--color-danger)]">
          {depWarnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
      {groups.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">Aramaya uygun modül yok.</p>
      ) : (
        groups.map(([cat, items]) => (
          <fieldset key={cat}>
            <legend className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{cat}</legend>
            <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
              {items.map((m) => {
                const g = guideFor(m.key);
                const on = selected.includes(m.key);
                return (
                  <label
                    key={m.key}
                    className={`flex items-start gap-2 rounded-[var(--radius-md)] border px-3 py-2 ${
                      on ? "border-[var(--color-primary)]" : "border-[var(--color-border)]"
                    }`}
                  >
                    <input type="checkbox" className="mt-1" disabled={disabled} checked={on} onChange={(e) => toggle(m.key, e.target.checked)} />
                    <span className="min-w-0">
                      <span className="font-medium">
                        {m.label}
                        {!m.active ? <span className="ml-1 text-[10px] font-normal text-[var(--color-text-muted)]">pasif</span> : null}
                        {g.status === "kurulum" ? (
                          <span className="ml-1 rounded bg-[var(--color-warning-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-warning)]" title={g.statusNote ?? "Sağlayıcı bağlantısı gerekli"}>
                            kurulum gerekli
                          </span>
                        ) : null}
                      </span>
                      <span className="block text-xs text-[var(--color-text-muted)]">{g.benefit || m.description}</span>
                      <span className="mt-0.5 block text-[11px] text-[var(--color-text-muted)]">Etki: {g.etki.join(", ")}</span>
                      {!g.enforcedBackend ? (
                        <span className="mt-0.5 block text-[11px] text-[var(--color-warning)]">
                          API denetimi yok — bu hak pakette görünür ama erişimi teknik olarak kapatmaz.
                        </span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))
      )}
      <p className="text-xs text-[var(--color-text-muted)]">
        Kodda doğrulanmış zorunlu modül bağımlılığı yok; seçilen her kombinasyon teknik olarak açılır. Kullanım bazlı
        kotalar (SMS, depolama) ancak ölçülüp uygulandığında satışa eklenmelidir.
      </p>
    </Card>
  );
}
