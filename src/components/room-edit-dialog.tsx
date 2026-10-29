"use client";

/**
 * 9. tur (owner isteği) — oluşturulmuş odanın ad, şube, kapasite ve enstrümanlarının
 * düzenlenmesi. Kurallar sunucuda (`updateRoomTool` → room-revision.ts): ileri tarihli
 * planlı dersi olan odanın şubesi değişmez, o derslerin enstrümanı çıkarılamaz,
 * aynı şubede aynı ad olamaz. Geçmiş dersler odaya kimlikle bağlı, etkilenmez.
 */

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { actionUpdateRoom } from "@/lib/actions";
import { Button, Input, Label, Select } from "@/components/ui";
import type { Room } from "@/lib/types";

export function RoomEditDialog({
  room,
  branches,
  instrumentOptions,
}: {
  room: Pick<Room, "id" | "name" | "capacity" | "branchId" | "instruments">;
  branches: { id: string; name: string }[];
  /** Kurumun AKTİF enstrüman kataloğu (activeInstrumentOptions). */
  instrumentOptions: string[];
}) {
  const router = useRouter();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(room.name);
  const [branchId, setBranchId] = useState<string>(room.branchId);
  const [capacity, setCapacity] = useState(String(room.capacity));
  const [instruments, setInstruments] = useState<string[]>(room.instruments);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Yeni seçim aktif katalogdan; odada zaten olan (sonradan pasife alınmış) enstrüman listede kalır —
  // düzenleme onu sessizce silmez.
  const options = Array.from(new Set([...instrumentOptions, ...room.instruments]));

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, pending]);

  function openDialog() {
    setName(room.name);
    setBranchId(room.branchId);
    setCapacity(String(room.capacity));
    setInstruments(room.instruments);
    setError(null);
    setOpen(true);
  }

  function submit() {
    const cap = Number(capacity);
    if (!name.trim()) return setError("Oda adı boş olamaz.");
    if (!Number.isInteger(cap) || cap < 1) return setError("Kapasite 1 veya daha büyük bir tam sayı olmalı.");
    if (instruments.length === 0) return setError("Odada en az bir enstrüman seçili olmalı.");
    setError(null);
    startTransition(async () => {
      const res = await actionUpdateRoom({ roomId: room.id, name: name.trim(), branchId, capacity: cap, instruments });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-focus-ring)]"
        aria-label={`${room.name} odasını düzenle`}
      >
        <Pencil className="h-3 w-3" aria-hidden /> Düzenle
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-md rounded-t-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-md)] sm:rounded-[var(--radius-lg)]"
          >
            <h3 id={titleId} className="text-sm font-semibold text-[var(--color-text)]">
              Odayı düzenle — {room.name}
            </h3>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Geçmiş dersler bu odaya bağlı kalır ve yeni adı gösterir.
            </p>
            <div className="mt-3 space-y-3">
              <div>
                <Label>Ad</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Şube</Label>
                  <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Kapasite</Label>
                  <Input type="number" min={1} inputMode="numeric" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
                </div>
              </div>
              <fieldset>
                <legend className="mb-1 text-sm font-medium text-[var(--color-text)]">Desteklenen enstrümanlar</legend>
                <div className="grid grid-cols-2 gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] p-2.5">
                  {options.map((instrument) => (
                    <label key={instrument} className="flex items-center gap-2 text-sm text-[var(--color-text)]">
                      <input
                        type="checkbox"
                        checked={instruments.includes(instrument)}
                        onChange={(e) =>
                          setInstruments((prev) =>
                            e.target.checked ? [...prev, instrument] : prev.filter((i) => i !== instrument)
                          )
                        }
                      />
                      {instrument}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            {error ? (
              <p className="mt-3 text-xs font-medium text-[var(--color-danger)]" role="alert">
                {error}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
                Vazgeç
              </Button>
              <Button type="button" disabled={pending} onClick={submit}>
                {pending ? "Kaydediliyor…" : "Kaydet"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
