"use client";

import { useMemo, useState } from "react";
import { parseCsv, rowsToRecords } from "@/lib/import/csv";
import { Badge, Button, Card, EmptyState, Input, Label, Select } from "@/components/ui";

export type BulkStudentOption = {
  id: string;
  name: string;
  teacherId: string;
  teacherName: string;
  instruments: string[];
  level: string;
  branchId: string;
  branchName: string;
  active: boolean;
  /** 2026-10-10 — çok branşlı öğrenci: öğretmen/enstrüman/seviye filtreleri AYNI branşın değerlerine birlikte uygulanır. */
  enrollments?: { teacherId: string; instrument: string; level: string }[];
};

type ManualTopicRow = { sortOrder: number; title: string; description: string };

type CsvTopicRow = {
  rowNumber: number;
  sortOrder: string;
  title: string;
  description: string;
  errors: string[];
};

const MAX_STUDENTS = 200;
const MAX_TOPICS = 100;
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;
const FORMULA_PREFIXES = ["=", "+", "-", "@"];

/** CSV/Excel formula injection önlemi — dışa aktarılırsa formül gibi yorumlanmasın diye tehlikeli önek taşıyan hücrelere görünmez bir düz-metin işareti eklenir. */
function sanitizeCell(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length > 0 && FORMULA_PREFIXES.includes(trimmed[0])) {
    return `'${trimmed}`;
  }
  return trimmed;
}

const CSV_TEMPLATE = "sortOrder,title,description\n1,Bağlama giriş,\n2,Düzen akort,\n3,Temel tezene,\n";

function downloadCsvTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mufredat-sablonu.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function CurriculumBulkAssignWizard({
  students,
  teachers,
  showTeacherFilter,
}: {
  students: BulkStudentOption[];
  teachers: { id: string; name: string }[];
  /** Öğretmen portalında zaten tek öğretmene kapsamlı olduğu için filtre gösterilmez. */
  showTeacherFilter: boolean;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Adım 1 — filtre + seçim
  const [teacherFilter, setTeacherFilter] = useState("");
  const [instrumentFilter, setInstrumentFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const instrumentOptions = useMemo(
    () => Array.from(new Set(students.flatMap((s) => s.instruments))).sort((a, b) => a.localeCompare(b, "tr")),
    [students]
  );
  const levelOptions = useMemo(
    () =>
      Array.from(new Set(students.flatMap((s) => (s.enrollments && s.enrollments.length > 1 ? s.enrollments.map((e) => e.level) : [s.level])).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b, "tr")
      ),
    [students]
  );
  const branchOptions = useMemo(
    () =>
      Array.from(new Map(students.map((s) => [s.branchId, s.branchName])).entries()).sort((a, b) =>
        a[1].localeCompare(b[1], "tr")
      ),
    [students]
  );

  const filteredStudents = useMemo(
    () =>
      students.filter(
        (s) =>
          (!activeOnly || s.active) &&
          (s.enrollments && s.enrollments.length > 1
            ? s.enrollments.some(
                (e) =>
                  (!teacherFilter || e.teacherId === teacherFilter) &&
                  (!instrumentFilter || e.instrument === instrumentFilter) &&
                  (!levelFilter || e.level === levelFilter)
              )
            : (!teacherFilter || s.teacherId === teacherFilter) &&
              (!instrumentFilter || s.instruments.includes(instrumentFilter)) &&
              (!levelFilter || s.level === levelFilter)) &&
          (!branchFilter || s.branchId === branchFilter)
      ),
    [students, activeOnly, teacherFilter, instrumentFilter, levelFilter, branchFilter]
  );

  function toggleStudent(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_STUDENTS) next.add(id);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelectedIds(new Set(filteredStudents.slice(0, MAX_STUDENTS).map((s) => s.id)));
  }

  // Adım 2 — konu girişi
  const [entryMode, setEntryMode] = useState<"manual" | "csv">("manual");
  const [manualRows, setManualRows] = useState<ManualTopicRow[]>([{ sortOrder: 1, title: "", description: "" }]);
  const [csvRows, setCsvRows] = useState<CsvTopicRow[]>([]);
  const [csvFileError, setCsvFileError] = useState<string | null>(null);

  function addManualRow() {
    if (manualRows.length >= MAX_TOPICS) return;
    setManualRows((prev) => [...prev, { sortOrder: prev.length + 1, title: "", description: "" }]);
  }
  function removeManualRow(idx: number) {
    setManualRows((prev) => prev.filter((_, i) => i !== idx));
  }
  function moveManualRow(idx: number, dir: -1 | 1) {
    setManualRows((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }
  function updateManualRow(idx: number, patch: Partial<ManualTopicRow>) {
    setManualRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  async function onCsvFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setCsvFileError(null);
    setCsvRows([]);
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) {
      setCsvFileError("Dosya boş.");
      return;
    }
    const { header, records } = rowsToRecords(rows);
    const expected = ["sortOrder", "title", "description"];
    if (header.join(",") !== expected.join(",")) {
      setCsvFileError(`Başlık satırı tam olarak "${expected.join(",")}" olmalı.`);
      return;
    }
    if (records.length > MAX_TOPICS) {
      setCsvFileError(`En fazla ${MAX_TOPICS} konu satırı yüklenebilir (dosyada ${records.length} satır var).`);
      return;
    }
    const seenOrders = new Set<string>();
    const parsed: CsvTopicRow[] = records.map((rec, i) => {
      const sortOrder = sanitizeCell(rec.sortOrder ?? "");
      const title = sanitizeCell(rec.title ?? "");
      const description = sanitizeCell(rec.description ?? "");
      const errors: string[] = [];
      if (!title) errors.push("Başlık boş olamaz.");
      if (title.length > TITLE_MAX) errors.push(`Başlık en fazla ${TITLE_MAX} karakter olabilir.`);
      if (description.length > DESCRIPTION_MAX) errors.push(`Açıklama en fazla ${DESCRIPTION_MAX} karakter olabilir.`);
      if (sortOrder && !/^\d+$/.test(sortOrder)) errors.push("Sıra sayısal olmalı.");
      if (sortOrder) {
        if (seenOrders.has(sortOrder)) errors.push("Sıra bu dosyada tekrar ediyor.");
        seenOrders.add(sortOrder);
      }
      return { rowNumber: i + 2, sortOrder, title, description, errors };
    });
    setCsvRows(parsed);
  }

  const topics: { sortOrder: number; title: string; description?: string }[] = useMemo(() => {
    if (entryMode === "manual") {
      return manualRows
        .filter((r) => r.title.trim())
        .map((r, i) => ({
          sortOrder: r.sortOrder || i,
          title: sanitizeCell(r.title),
          description: r.description.trim() ? sanitizeCell(r.description) : undefined,
        }));
    }
    return csvRows
      .filter((r) => r.errors.length === 0 && r.title)
      .map((r, i) => ({
        sortOrder: r.sortOrder ? Number(r.sortOrder) : i,
        title: r.title,
        description: r.description || undefined,
      }));
  }, [entryMode, manualRows, csvRows]);

  const manualHasEmptyTitle = entryMode === "manual" && manualRows.every((r) => !r.title.trim());
  const csvHasErrors = entryMode === "csv" && csvRows.some((r) => r.errors.length > 0);
  const csvHasNoRows = entryMode === "csv" && csvRows.length === 0;
  const step2Blocked = manualHasEmptyTitle || csvHasErrors || csvHasNoRows || topics.length === 0;

  // Adım 3 — önizle/onayla
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    requestedStudents: number;
    requestedTopics: number;
    created: number;
    skippedInaccessible: number;
    skippedExisting: number;
  } | null>(null);

  const totalRecords = selectedIds.size * topics.length;

  async function submitBulkAssign() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/v1/curriculum/bulk-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentIds: Array.from(selectedIds),
          topics: topics.map(({ sortOrder, title, description }) => ({ sortOrder, title, description })),
        }),
      });
      const json = (await res.json()) as
        | { ok: true; data: typeof result }
        | { ok: false; error: { message: string } };
      if (!json.ok) {
        setSubmitError(json.error.message || "Toplu atama başarısız.");
        return;
      }
      setResult(json.data);
    } catch {
      setSubmitError("Bağlantı hatası. Tekrar deneyin.");
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <Card className="!p-4">
        <p className="mb-2 text-sm font-semibold text-[var(--color-text)]">Toplu atama tamamlandı</p>
        <ul className="space-y-1 text-sm text-[var(--color-text)]">
          <li>Seçilen öğrenci: {result.requestedStudents}</li>
          <li>Konu sayısı: {result.requestedTopics}</li>
          <li className="font-medium text-emerald-700">Oluşturulan kayıt: {result.created}</li>
          <li>Zaten var olduğu için atlanan: {result.skippedExisting}</li>
          <li>Erişilemeyen/bulunamayan öğrenci: {result.skippedInaccessible}</li>
        </ul>
        <Button
          className="mt-3"
          variant="secondary"
          onClick={() => {
            setResult(null);
            setStep(1);
            setSelectedIds(new Set());
            setConfirmChecked(false);
          }}
        >
          Yeni toplu atama başlat
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-muted)]">
        <span className={step === 1 ? "text-[var(--color-primary)]" : undefined}>1. Öğrenci seç</span>
        <span>→</span>
        <span className={step === 2 ? "text-[var(--color-primary)]" : undefined}>2. Müfredat gir</span>
        <span>→</span>
        <span className={step === 3 ? "text-[var(--color-primary)]" : undefined}>3. Önizle ve onayla</span>
      </div>

      {step === 1 ? (
        <Card className="!p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {showTeacherFilter ? (
              <div>
                <Label>Öğretmen</Label>
                <Select value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)}>
                  <option value="">Tümü</option>
                  {teachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            <div>
              <Label>Enstrüman</Label>
              <Select value={instrumentFilter} onChange={(e) => setInstrumentFilter(e.target.value)}>
                <option value="">Tümü</option>
                {instrumentOptions.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Seviye</Label>
              <Select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
                <option value="">Tümü</option>
                {levelOptions.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Şube</Label>
              <Select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
                <option value="">Tümü</option>
                {branchOptions.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-1.5 text-sm text-[var(--color-text)]">
                <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
                Yalnızca aktif öğrenciler
              </label>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-xs text-[var(--color-text-muted)]">
              {filteredStudents.length} öğrenci bu filtrelerle eşleşiyor · {selectedIds.size} öğrenci seçildi
              {selectedIds.size >= MAX_STUDENTS ? ` (en fazla ${MAX_STUDENTS})` : ""}
            </p>
            <Button type="button" variant="secondary" onClick={selectAllFiltered}>
              Bu filtredeki tüm öğrencileri seç
            </Button>
          </div>

          {filteredStudents.length === 0 ? (
            <EmptyState title="Filtreyle eşleşen öğrenci yok" />
          ) : (
            <div className="mt-2 max-h-80 space-y-1 overflow-y-auto">
              {filteredStudents.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(s.id)}
                      onChange={() => toggleStudent(s.id)}
                    />
                    {s.name}
                  </span>
                  <span className="text-[11px] text-[var(--color-text-muted)]">
                    {s.enrollments && s.enrollments.length > 1
                      ? s.enrollments.map((e) => `${e.instrument}${e.level ? ` (${e.level})` : ""}`).join(", ")
                      : `${s.instruments.join(", ")} ${s.level ? `· ${s.level}` : ""}`}
                  </span>
                </label>
              ))}
            </div>
          )}

          <Button className="mt-3" disabled={selectedIds.size === 0} onClick={() => setStep(2)}>
            Devam et — {selectedIds.size} öğrenci seçildi
          </Button>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card className="!p-4">
          <div className="mb-3 flex gap-2">
            <Button
              type="button"
              variant={entryMode === "manual" ? "primary" : "secondary"}
              onClick={() => setEntryMode("manual")}
            >
              Manuel giriş
            </Button>
            <Button
              type="button"
              variant={entryMode === "csv" ? "primary" : "secondary"}
              onClick={() => setEntryMode("csv")}
            >
              CSV yükle
            </Button>
          </div>

          {entryMode === "manual" ? (
            <div className="space-y-2">
              {manualRows.map((row, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <span className="mt-2 w-6 text-right text-xs text-[var(--color-text-muted)]">{idx + 1}</span>
                  <div className="flex-1 space-y-1">
                    <Input
                      placeholder="Konu başlığı — ör. Bağlama giriş"
                      value={row.title}
                      onChange={(e) => updateManualRow(idx, { title: e.target.value })}
                    />
                    <Input
                      placeholder="Açıklama / alt hedef (isteğe bağlı)"
                      value={row.description}
                      onChange={(e) => updateManualRow(idx, { description: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      aria-label="Yukarı taşı"
                      onClick={() => moveManualRow(idx, -1)}
                      className="text-xs text-[var(--color-text-muted)]"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label="Aşağı taşı"
                      onClick={() => moveManualRow(idx, 1)}
                      className="text-xs text-[var(--color-text-muted)]"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label="Satırı sil"
                      onClick={() => removeManualRow(idx)}
                      className="text-xs text-rose-600"
                    >
                      Sil
                    </button>
                  </div>
                </div>
              ))}
              <Button type="button" variant="secondary" onClick={addManualRow} disabled={manualRows.length >= MAX_TOPICS}>
                + Konu satırı ekle
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="secondary" onClick={downloadCsvTemplate}>
                  Şablonu indir
                </Button>
                <input type="file" accept=".csv,text/csv" onChange={(e) => void onCsvFileChange(e)} />
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)]">
                Yalnızca .csv desteklenir (kolonlar tam olarak: sortOrder,title,description). Excel/.xlsx desteği
                henüz eklenmedi — bkz. teslim raporu.
              </p>
              {csvFileError ? <p className="text-xs font-medium text-rose-600">{csvFileError}</p> : null}
              {csvRows.length > 0 ? (
                <div className="max-h-72 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--color-surface-muted)]">
                      <tr>
                        <th className="px-2 py-1">Satır</th>
                        <th className="px-2 py-1">Sıra</th>
                        <th className="px-2 py-1">Başlık</th>
                        <th className="px-2 py-1">Açıklama</th>
                        <th className="px-2 py-1">Durum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvRows.map((r) => (
                        <tr key={r.rowNumber} className="border-t border-[var(--color-border)]">
                          <td className="px-2 py-1">{r.rowNumber}</td>
                          <td className="px-2 py-1">{r.sortOrder}</td>
                          <td className="px-2 py-1">{r.title}</td>
                          <td className="px-2 py-1">{r.description}</td>
                          <td className="px-2 py-1">
                            {r.errors.length === 0 ? (
                              <Badge status="mastered">Geçerli</Badge>
                            ) : (
                              <span className="text-rose-600">{r.errors.join(" ")}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setStep(1)}>
              Geri
            </Button>
            <Button type="button" disabled={step2Blocked} onClick={() => setStep(3)}>
              Devam et — {topics.length} konu
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card className="!p-4">
          <p className="text-sm text-[var(--color-text)]">
            <strong>{selectedIds.size}</strong> öğrenci × <strong>{topics.length}</strong> konu ={" "}
            <strong>{totalRecords}</strong> müfredat kaydı oluşturulacak.
          </p>
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            Bir öğrencide aynı başlıkta konu zaten varsa o satır atlanır, yeni kayıt oluşturulmaz. Erişiminiz
            olmayan/artık bulunmayan öğrenciler de atlanır.
          </p>

          <label className="mt-3 flex items-center gap-2 text-sm text-[var(--color-text)]">
            <input type="checkbox" checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} />
            Toplu atamayı onaylıyorum.
          </label>

          {submitError ? <p className="mt-2 text-xs font-medium text-rose-600">{submitError}</p> : null}

          <div className="mt-3 flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setStep(2)}>
              Geri
            </Button>
            <Button type="button" disabled={!confirmChecked || submitting} onClick={() => void submitBulkAssign()}>
              {submitting ? "Gönderiliyor…" : "Toplu atamayı tamamla"}
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
