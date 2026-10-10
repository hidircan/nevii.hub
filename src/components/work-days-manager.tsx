"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, CalendarX, Trash2 } from "lucide-react";
import { Button, Card, Input, Label } from "@/components/ui";
import { friendlyApiErrorMessage } from "@/lib/api/friendly-error";
import { formatDateTr } from "@/lib/timezone";
import { resolveWorkDay, type DayOverride, type TermWeeklyClosedDaysOverride } from "@/lib/work-days";
import type { StudentTermType } from "@/lib/types";

export type WorkDayOverrideRow = {
  id: string;
  date: string;
  name: string;
  isOpen: boolean;
};

/**
 * Çalışma Günleri — istisna yönetimi (zorla aç / zorla kapat).
 *
 * Bu ekranın tek işi, `src/lib/work-days.ts`'teki çözümleyicinin EN YÜKSEK
 * öncelikli girdisini (yönetici istisnası) yönetmek. Önizleme de aynı saf
 * fonksiyonu çağırır — yani kullanıcı kaydetmeden önce sonucu tam olarak
 * ders planlama doğrulamasının göreceği şekilde görür.
 */
export function WorkDaysManager({
  overrides,
  termWeeklyClosedDays,
}: {
  overrides: WorkDayOverrideRow[];
  termWeeklyClosedDays?: TermWeeklyClosedDaysOverride;
}) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [term, setTerm] = useState<StudentTermType>("guz");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const otherOverrides: DayOverride[] = useMemo(
    () => overrides.filter((o) => o.date !== date),
    [overrides, date]
  );

  /** Seçilen tarihin İSTİSNA OLMADAN doğal durumu — "neyi değiştiriyorum?" sorusunun cevabı. */
  const naturalStatus = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    return resolveWorkDay(new Date(`${date}T09:00:00Z`), term, otherOverrides, termWeeklyClosedDays);
  }, [date, term, otherOverrides, termWeeklyClosedDays]);

  const existing = overrides.find((o) => o.date === date);

  async function send(method: "POST" | "DELETE", body: unknown, label: string) {
    setBusy(label);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/v1/attendance-calendar/day-override", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
        setError(friendlyApiErrorMessage(payload?.error, payload?.error?.message ?? "İşlem tamamlanamadı."));
        return;
      }
      setSuccess(label);
      setName("");
      router.refresh();
    } catch {
      setError("Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.");
    } finally {
      setBusy(null);
    }
  }

  function apply(isOpen: boolean) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError("Önce bir tarih seçin.");
      return;
    }
    void send(
      "POST",
      { date, name: name.trim(), isOpen, kind: "custom" },
      isOpen
        ? `${formatDateTr(`${date}T09:00:00Z`)} zorla AÇIK olarak işaretlendi — bu güne ders planlanabilir.`
        : `${formatDateTr(`${date}T09:00:00Z`)} zorla KAPALI olarak işaretlendi — bu güne ders planlanamaz.`
    );
  }

  const openOverrides = overrides.filter((o) => o.isOpen);
  const closedOverrides = overrides.filter((o) => !o.isOpen);

  return (
    <Card>
      <h2 className="font-semibold text-[var(--color-text)]">Gün istisnaları — zorla aç / zorla kapat</h2>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        İstisna, diğer tüm kuralları ezer: <strong>zorla açık</strong> bir güne resmî tatil olsa bile ders
        planlanabilir, <strong>zorla kapalı</strong> bir güne normalde açık olsa bile planlanamaz. Ders
        Programı, seri planlama, ödeme önizlemesi ve Yoklama Takvimi aynı kuralı kullanır.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)_minmax(0,150px)]">
        <div>
          <Label>Tarih</Label>
          <Input id="wd-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <Label>Açıklama (isteğe bağlı)</Label>
          <Input
            id="wd-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ör. Bayram telafi günü / Kurum içi eğitim"
          />
        </div>
        <div>
          <Label>Dönem</Label>
          <select
            id="wd-term"
            value={term}
            onChange={(e) => setTerm(e.target.value === "yaz" ? "yaz" : "guz")}
            className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)]"
          >
            <option value="guz">Güz</option>
            <option value="yaz">Yaz</option>
          </select>
        </div>
      </div>

      {naturalStatus ? (
        <p className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
          <strong className="text-[var(--color-text)]">İstisnasız hali:</strong> {naturalStatus.explanation}{" "}
          {naturalStatus.schedulable ? "Bu güne şu an ders planlanabilir." : "Bu güne şu an ders planlanamaz."}
          {existing ? (
            <>
              {" "}
              <strong className="text-[var(--color-text)]">Mevcut istisna:</strong>{" "}
              {existing.isOpen ? "zorla açık" : "zorla kapalı"}
              {existing.name ? ` (${existing.name})` : ""}.
            </>
          ) : null}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" onClick={() => apply(true)} disabled={busy !== null}>
          <CalendarCheck className="mr-1.5 h-4 w-4" /> Zorla aç
        </Button>
        <Button type="button" variant="secondary" onClick={() => apply(false)} disabled={busy !== null}>
          <CalendarX className="mr-1.5 h-4 w-4" /> Zorla kapat
        </Button>
        {existing ? (
          <Button
            type="button"
            variant="secondary"
            disabled={busy !== null}
            onClick={() =>
              void send(
                "DELETE",
                { date },
                `${formatDateTr(`${date}T09:00:00Z`)} istisnası kaldırıldı; gün normal kuralına döndü.`
              )
            }
          >
            <Trash2 className="mr-1.5 h-4 w-4" /> İstisnayı kaldır
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 text-sm font-medium" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mt-3 text-sm font-medium" style={{ color: "var(--color-success)" }}>
          {success}
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <OverrideList
          title="Zorla açık günler"
          emptyText="Zorla açılmış gün yok."
          tone="success"
          rows={openOverrides}
          onRemove={(row) =>
            void send("DELETE", { date: row.date }, `${formatDateTr(`${row.date}T09:00:00Z`)} istisnası kaldırıldı.`)
          }
          busy={busy !== null}
        />
        <OverrideList
          title="Zorla kapalı günler"
          emptyText="Zorla kapatılmış gün yok."
          tone="danger"
          rows={closedOverrides}
          onRemove={(row) =>
            void send("DELETE", { date: row.date }, `${formatDateTr(`${row.date}T09:00:00Z`)} istisnası kaldırıldı.`)
          }
          busy={busy !== null}
        />
      </div>
    </Card>
  );
}

function OverrideList({
  title,
  emptyText,
  tone,
  rows,
  onRemove,
  busy,
}: {
  title: string;
  emptyText: string;
  tone: "success" | "danger";
  rows: WorkDayOverrideRow[];
  onRemove: (row: WorkDayOverrideRow) => void;
  busy: boolean;
}) {
  const color = tone === "success" ? "var(--color-success)" : "var(--color-danger)";
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color }}>
        {title} ({rows.length})
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
          {rows
            .slice()
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium text-[var(--color-text)]">
                    {formatDateTr(`${row.date}T09:00:00Z`)}
                  </span>
                  {row.name ? <span className="text-[var(--color-text-muted)]"> · {row.name}</span> : null}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRemove(row)}
                  className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] hover:text-[var(--color-text)] disabled:opacity-50"
                  aria-label={`${formatDateTr(`${row.date}T09:00:00Z`)} istisnasını kaldır`}
                >
                  Kaldır
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
