"use client";

/**
 * Evraklar — şablon yönetimi (oluştur/düzenle/arşivle). Yeni REST uçlarını
 * (`/api/v1/documents/templates`) kullanır — `createDocumentTemplateTool`/
 * `updateDocumentTemplateTool`/`archiveDocumentTemplateTool` sunucuda
 * `bodyHtml`'i sanitize eder (script/iframe/event handler/javascript: URL
 * elenir); bu bileşen yalnızca formu sunar, güvenlik sınırı sunucudadır.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Select } from "@/components/ui";
import { friendlyApiErrorMessage } from "@/lib/api/friendly-error";
import { cn } from "@/lib/utils";

const KIND_OPTIONS: { value: string; label: string }[] = [
  { value: "student_enrollment_contract", label: "Öğrenci Kayıt Sözleşmesi" },
  { value: "parent_social_media_consent", label: "Veli / Sosyal Medya İzni" },
  { value: "kvkk", label: "KVKK" },
  { value: "teacher_contract", label: "Öğretmen Sözleşmesi" },
  { value: "teacher_info_form", label: "Öğretmen Bilgi Formu" },
  { value: "trial_form", label: "Deneme Formu" },
  { value: "makeup_request", label: "Telafi Talebi" },
  { value: "payment_commitment", label: "Ödeme Taahhüdü" },
  { value: "petition", label: "Dilekçe" },
  { value: "custom", label: "Özel Şablon" },
];

const PLACEHOLDER_HELP =
  "Kullanılabilir alanlar: {{document.referenceNumber}}, {{document.createdAt}}, {{institution.name}}, {{institution.address}}, {{student.fullName}}, {{student.birthDate}}, {{parent.fullName}}, {{parent.phone}}, {{teacher.fullName}}, {{currentDate}}";

export type TemplateRow = {
  id: string;
  name: string;
  kind: string;
  active: boolean;
  version: number;
  updatedAt: string;
  bodyHtml: string;
  /** DOCX olarak yüklenmiş bir kaynak dosyası var mı — varsa "Word Dosyasını İndir" gösterilir. */
  hasSourceFile: boolean;
};

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Dosya okunamadı"));
    reader.readAsDataURL(file);
  });
}

export function DocumentTemplateManager({
  templates,
  lockKind,
}: {
  templates: TemplateRow[];
  /** Verilirse "Belge türü" seçici gizlenir, yeni şablonlar hep bu türde oluşturulur (ör. yalnız kayıt sözleşmesi şablonları için ayrı bir bölüm). */
  lockKind?: string;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingActive, setEditingActive] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState(lockKind ?? KIND_OPTIONS[0]!.value);
  const [bodyHtml, setBodyHtml] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showDocxForm, setShowDocxForm] = useState(false);
  const [docxName, setDocxName] = useState("");
  const [docxKind, setDocxKind] = useState(lockKind ?? KIND_OPTIONS[0]!.value);
  const [docxFile, setDocxFile] = useState<File | null>(null);
  const [docxBusy, setDocxBusy] = useState(false);
  const [docxError, setDocxError] = useState<string | null>(null);
  const [docxMissingFields, setDocxMissingFields] = useState<string[] | null>(null);

  async function onDocxUpload() {
    if (!docxFile || !docxName) return;
    setDocxBusy(true);
    setDocxError(null);
    setDocxMissingFields(null);
    try {
      const fileData = await readFileAsBase64(docxFile);
      const res = await fetch("/api/v1/documents/templates/docx-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: docxKind,
          name: docxName,
          fileName: docxFile.name,
          fileMimeType:
            docxFile.type ||
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          fileData,
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        data?: { missingRequiredPlaceholders: string[] };
        error?: { code?: string; message: string };
      };
      if (!json.ok) {
        setDocxError(friendlyApiErrorMessage(json.error, "Dosya yüklenemedi. Lütfen tekrar deneyin."));
        return;
      }
      if (json.data!.missingRequiredPlaceholders.length > 0) {
        setDocxMissingFields(json.data!.missingRequiredPlaceholders);
      }
      setDocxFile(null);
      setDocxName("");
      router.refresh();
    } catch {
      setDocxError("Bağlantı hatası.");
    } finally {
      setDocxBusy(false);
    }
  }

  async function onDownloadSource(templateId: string, name: string) {
    const res = await fetch(`/api/v1/documents/templates/${templateId}/source-file`);
    if (!res.ok) {
      setError("Word dosyası indirilemedi. Lütfen tekrar deneyin.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.docx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setEditingActive(false);
    setName("");
    setBodyHtml("");
    setKind(lockKind ?? KIND_OPTIONS[0]!.value);
    setError(null);
  }

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      // Aktif (yayında/üretimde kullanılan) bir şablon YERİNDE değiştirilmez —
      // bu, geçmişe dönük belgeleri etkileyecek riskli bir işlem olurdu.
      // Bunun yerine yeni bir taslak (active:false) oluşturulur; yayınlamak
      // ayrı, bilinçli bir "Geri Aç" adımı gerektirir.
      if (editingId && editingActive) {
        const createRes = await fetch("/api/v1/documents/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, kind, bodyHtml }),
        });
        const createJson = (await createRes.json()) as {
          ok: boolean;
          data?: { templateId: string };
          error?: { code?: string; message: string };
        };
        if (!createJson.ok) {
          setError(friendlyApiErrorMessage(createJson.error, "Şablon verisi yüklenemedi. Lütfen tekrar deneyin."));
          return;
        }
        const draftId = createJson.data!.templateId;
        const archiveRes = await fetch(`/api/v1/documents/templates/${draftId}/archive`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active: false }),
        });
        const archiveJson = (await archiveRes.json()) as { ok: boolean; error?: { code?: string; message: string } };
        if (!archiveJson.ok) {
          setError(friendlyApiErrorMessage(archiveJson.error, "Şablon verisi yüklenemedi. Lütfen tekrar deneyin."));
          return;
        }
        resetForm();
        router.refresh();
        return;
      }

      const res = editingId
        ? await fetch(`/api/v1/documents/templates/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, ...(bodyHtml ? { bodyHtml } : {}) }),
          })
        : await fetch("/api/v1/documents/templates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, kind, bodyHtml }),
          });
      const json = (await res.json()) as { ok: boolean; error?: { code?: string; message: string } };
      if (!json.ok) {
        setError(friendlyApiErrorMessage(json.error, "Şablon verisi yüklenemedi. Lütfen tekrar deneyin."));
        return;
      }
      resetForm();
      router.refresh();
    } catch {
      setError("Bağlantı hatası.");
    } finally {
      setBusy(false);
    }
  }

  async function onToggleActive(id: string, nextActive: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/documents/templates/${id}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextActive }),
      });
      const json = (await res.json()) as { ok: boolean; error?: { code?: string; message: string } };
      if (!json.ok) {
        setError(friendlyApiErrorMessage(json.error, "Şablon verisi yüklenemedi. Lütfen tekrar deneyin."));
        return;
      }
      router.refresh();
    } catch {
      setError("Bağlantı hatası.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p className="text-xs font-medium text-rose-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="space-y-1.5">
        {templates.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-[var(--color-surface-muted)] px-3 py-2 text-sm">
            <div>
              <span className="font-medium text-[var(--color-text)]">{t.name}</span>{" "}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  t.active
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                )}
              >
                {t.active ? "Aktif" : "Arşiv/Taslak"}
              </span>{" "}
              <span className="text-xs text-[var(--color-text-muted)]">
                ({KIND_OPTIONS.find((k) => k.value === t.kind)?.label ?? t.kind} · v{t.version})
              </span>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                {t.active
                  ? "Yeni formal sözleşmeler bu şablondan oluşturulur."
                  : "Bu şablon yeni sözleşmeler için kullanılmaz."}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-medium">
              {t.hasSourceFile ? (
                <button
                  type="button"
                  onClick={() => void onDownloadSource(t.id, t.name)}
                  className="text-[var(--color-primary)] hover:underline"
                >
                  Word Dosyasını İndir
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setEditingId(t.id);
                  setEditingActive(t.active);
                  setName(t.name);
                  setKind(t.kind);
                  setBodyHtml(t.bodyHtml);
                  setShowForm(true);
                }}
                className="text-[var(--color-primary)] hover:underline"
              >
                Düzenle
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onToggleActive(t.id, !t.active)}
                className={t.active ? "text-rose-600 hover:underline" : "text-emerald-700 hover:underline"}
              >
                {t.active ? "Arşivle" : "Geri Aç"}
              </button>
            </div>
          </div>
        ))}
        {templates.length === 0 ? <p className="text-xs text-[var(--color-text-muted)]">Henüz şablon yok.</p> : null}
      </div>

      {showForm ? (
        <div className="space-y-2 rounded-md border border-dashed border-slate-300 p-3">
          {editingId && editingActive ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              Bu şablon şu anda aktif — yerinde değiştirilmez. Kaydettiğinizde yeni bir taslak sürüm
              oluşturulur; mevcut aktif şablon ve geçmişte üretilmiş belgeler değişmeden kalır. Taslağı
              üretime almak için listede &quot;Geri Aç&quot; ile ayrıca etkinleştirmeniz gerekir.
            </p>
          ) : editingId ? (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-[var(--color-text-muted)] dark:bg-slate-900/30">
              Bu şablon taslak/arşiv durumunda — değişiklikler doğrudan bu sürüme kaydedilir, üretimde
              kullanılan aktif şablonu etkilemez.
            </p>
          ) : null}
          <div>
            <Label>Başlık</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Örn. Kayıt Sözleşmesi v2" />
          </div>
          {!editingId && !lockKind ? (
            <div>
              <Label>Belge türü</Label>
              <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                {KIND_OPTIONS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div>
            <Label>İçerik (HTML)</Label>
            <textarea
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              rows={6}
              placeholder={editingId ? "Boş bırakılırsa mevcut içerik korunur…" : "<h1>Başlık</h1><p>{{student.fullName}}</p>"}
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 font-mono text-xs text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]/30"
            />
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">{PLACEHOLDER_HELP}</p>
            <p className="mt-1 text-[11px] text-amber-700">
              Kaydedilen içerik sunucuda otomatik temizlenir — script, iframe, event handler ve tehlikeli
              bağlantılar kaldırılır.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" disabled={busy || !name || (!editingId && !bodyHtml)} onClick={() => void onSubmit()}>
              {busy
                ? "Kaydediliyor…"
                : editingId && editingActive
                  ? "Yeni Taslak Sürüm Oluştur"
                  : editingId
                    ? "Güncelle"
                    : "Şablonu Oluştur"}
            </Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={resetForm}>
              Vazgeç
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => setShowForm(true)}>
            Yeni Şablon
          </Button>
          <Button type="button" variant="secondary" onClick={() => setShowDocxForm((v) => !v)}>
            DOCX Yükle
          </Button>
        </div>
      )}

      {showDocxForm ? (
        <div className="space-y-2 rounded-md border border-dashed border-slate-300 p-3">
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            Yüklenen .docx her zaman yeni bir TASLAK olarak eklenir — otomatik etkinleştirilmez, mevcut
            aktif şablona dokunulmaz. Word&apos;deki biçimlendirmenin (tablo, kalın/italik vb.) bire bir
            önizlemesi garanti edilmez; orijinal dosya değişmeden saklanır ve her zaman aynen indirilebilir.
          </p>
          <div>
            <Label>Başlık</Label>
            <Input
              value={docxName}
              onChange={(e) => setDocxName(e.target.value)}
              placeholder="Örn. 2026–2027 Öğrenci Kayıt Sözleşmesi — Taslak Revizyon 2"
            />
          </div>
          {!lockKind ? (
            <div>
              <Label>Belge türü</Label>
              <Select value={docxKind} onChange={(e) => setDocxKind(e.target.value)}>
                {KIND_OPTIONS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div>
            <Label>Word dosyası (.docx)</Label>
            <input
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => setDocxFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-[var(--color-text)]"
            />
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
              Yalnızca .docx desteklenir. Eski .doc dosyanız varsa önce Word&apos;de .docx olarak kaydedip
              öyle yükleyin. PDF, düzenlenebilir şablon kaynağı olarak kabul edilmez — yalnızca arşiv/referans
              belgesi olarak Evraklar &gt; Dosya Yükle&apos;den eklenebilir.
            </p>
          </div>
          {docxError ? (
            <p className="text-xs font-medium text-rose-600" role="alert">
              {docxError}
            </p>
          ) : null}
          {docxMissingFields && docxMissingFields.length > 0 ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              Taslak oluşturuldu, ancak şu zorunlu alanlar Word dosyasında bulunamadı:{" "}
              {docxMissingFields.join(", ")}. Word&apos;de ilgili {"{{alan}}"} etiketlerini ekleyip yeniden
              yükleyebilir veya taslağı &quot;Düzenle&quot; ile tamamlayabilirsiniz.
            </p>
          ) : docxMissingFields ? (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
              Taslak oluşturuldu — tüm zorunlu alanlar bulundu.
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <Button type="button" disabled={docxBusy || !docxFile || !docxName} onClick={() => void onDocxUpload()}>
              {docxBusy ? "Yükleniyor…" : "Taslak Olarak Yükle"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={docxBusy}
              onClick={() => {
                setShowDocxForm(false);
                setDocxFile(null);
                setDocxName("");
                setDocxError(null);
                setDocxMissingFields(null);
              }}
            >
              Kapat
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
