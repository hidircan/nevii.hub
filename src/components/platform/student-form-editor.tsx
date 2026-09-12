"use client";

import { useState } from "react";
import { Button, Card, Input, Select } from "@/components/ui";
import { ConfirmBar } from "@/components/platform/confirm-dialog";
import { callApi } from "@/components/platform/api";
import {
  FORM_EDITOR_ROLES,
  STUDENT_FORM_CONFIGURABLE_FIELDS,
  STUDENT_FORM_CORE_FIELDS,
  type StudentFormConfig,
  type StudentFormField,
  type StudentFormFieldKey,
} from "@/lib/platform/policies";

const KEYS = Object.keys(STUDENT_FORM_CONFIGURABLE_FIELDS) as StudentFormFieldKey[];
const ROLE_LABEL: Record<string, string> = { SUPER_ADMIN: "Kurum sahibi", SCHOOL_ADMIN: "Kurum yöneticisi", AI_AGENT: "AI" };

function defaults(cfg: StudentFormConfig): StudentFormField[] {
  const byKey = new Map(cfg.fields.map((f) => [f.key, f]));
  return KEYS.map((key, i) => byKey.get(key) ?? { key, visible: true, required: false, order: i * 10 });
}

/**
 * Yeni Öğrenci Kaydı alan konfigürasyonu. Çekirdek alanlar (ad, telefon,
 * veli, şube, enstrüman, öğretmen, paket, ücret) listelenmez — gizlenemez.
 * Sunucu şemayla doğrular ve createStudentTool'da uygular.
 */
export function StudentFormEditor({ endpoint, initial }: { endpoint: string; initial: StudentFormConfig }) {
  const [fields, setFields] = useState<StudentFormField[]>(() => defaults(initial));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  const update = (key: StudentFormFieldKey, patch: Partial<StudentFormField>) =>
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  async function save() {
    setPending(true);
    setError(null);
    setNotice(null);
    const clean = fields.map((f) => ({
      ...f,
      defaultValue: f.defaultValue || undefined,
      helpText: f.helpText || undefined,
      visibleWhen: f.visibleWhen?.field ? f.visibleWhen : undefined,
      editableBy: f.editableBy?.length ? f.editableBy : undefined,
    }));
    const res = await callApi(endpoint, "PATCH", {
      key: "forms.studentRegistration",
      value: { fields: clean },
      confirm: true,
    });
    setPending(false);
    setConfirming(false);
    if (!res.ok) return setError(res.error.message);
    setNotice("Form konfigürasyonu kaydedildi ve sunucuda uygulanıyor.");
  }

  const sorted = [...fields].sort((a, b) => a.order - b.order);
  return (
    <Card className="overflow-x-auto">
      <p className="mb-3 text-xs text-[var(--color-text-muted)]">
        Korunan çekirdek alanlar (gizlenemez/opsiyonel yapılamaz): {STUDENT_FORM_CORE_FIELDS.join(", ")}
      </p>
      <table className="w-full min-w-[1100px] text-left text-xs [&_td]:px-2 [&_td]:py-2 [&_th]:px-2 [&_th]:py-2">
        <thead>
          <tr className="border-b text-[var(--color-text-muted)]" style={{ borderColor: "var(--color-border)" }}>
            <th>Alan</th>
            <th className="text-center">Görünür</th>
            <th className="text-center">Zorunlu</th>
            <th className="w-24">Sıra</th>
            <th>Varsayılan</th>
            <th>Yardım metni</th>
            <th>Koşul (alan = değer)</th>
            <th>Düzenleyebilir</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((f) => (
            <tr key={f.key} className="border-b align-top" style={{ borderColor: "var(--color-border)" }}>
              <td className="whitespace-nowrap font-medium">{STUDENT_FORM_CONFIGURABLE_FIELDS[f.key]}</td>
              <td className="text-center">
                <input
                  type="checkbox"
                  aria-label={`${f.key} görünür`}
                  checked={f.visible}
                  onChange={(e) => update(f.key, { visible: e.target.checked, required: e.target.checked ? f.required : false })}
                />
              </td>
              <td className="text-center">
                <input
                  type="checkbox"
                  aria-label={`${f.key} zorunlu`}
                  disabled={!f.visible}
                  checked={f.required}
                  onChange={(e) => update(f.key, { required: e.target.checked })}
                />
              </td>
              <td className="w-24">
                <Input type="number" aria-label={`${f.key} sıra`} value={String(f.order)} onChange={(e) => update(f.key, { order: Number(e.target.value) || 0 })} />
              </td>
              <td>
                <Input aria-label={`${f.key} varsayılan`} value={f.defaultValue ?? ""} onChange={(e) => update(f.key, { defaultValue: e.target.value })} />
              </td>
              <td>
                <Input aria-label={`${f.key} yardım`} value={f.helpText ?? ""} onChange={(e) => update(f.key, { helpText: e.target.value })} />
              </td>
              <td>
                <div className="flex gap-1">
                  <Select
                    aria-label={`${f.key} koşul alanı`}
                    value={f.visibleWhen?.field ?? ""}
                    onChange={(e) =>
                      update(f.key, { visibleWhen: e.target.value ? { field: e.target.value, equals: f.visibleWhen?.equals ?? "" } : undefined })
                    }
                  >
                    <option value="">—</option>
                    {[...STUDENT_FORM_CORE_FIELDS, ...KEYS.filter((k) => k !== f.key)].map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </Select>
                  {f.visibleWhen ? (
                    <Input
                      aria-label={`${f.key} koşul değeri`}
                      value={f.visibleWhen.equals}
                      onChange={(e) => update(f.key, { visibleWhen: { field: f.visibleWhen!.field, equals: e.target.value } })}
                    />
                  ) : null}
                </div>
              </td>
              <td>
                {FORM_EDITOR_ROLES.map((r) => (
                  <label key={r} className="flex items-center gap-1 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={!f.editableBy || f.editableBy.includes(r)}
                      onChange={(e) => {
                        const cur = f.editableBy ?? [...FORM_EDITOR_ROLES];
                        const next = e.target.checked ? [...new Set([...cur, r])] : cur.filter((x) => x !== r);
                        update(f.key, { editableBy: next.length === FORM_EDITOR_ROLES.length ? undefined : next });
                      }}
                    />
                    {ROLE_LABEL[r]}
                  </label>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error ? <p role="alert" className="mt-3 text-sm text-[var(--color-danger)]">{error}</p> : null}
      {notice ? <p role="status" className="mt-3 text-sm text-[var(--color-success)]">{notice}</p> : null}
      <Button className="mt-3" disabled={pending} onClick={() => setConfirming(true)}>Kaydet</Button>
      <ConfirmBar
        open={confirming}
        title="Form konfigürasyonu"
        description="Yeni öğrenci kayıtlarında zorunlu alan ve rol kuralları sunucuda hemen uygulanır. Mevcut kayıtlar değişmez. Denetim kaydı yazılır."
        pending={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void save()}
      />
    </Card>
  );
}
