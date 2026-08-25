"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Select } from "@/components/ui";

const INSTRUMENTS = ["Piyano", "Yan Flüt", "Gitar", "Bateri", "Keman", "Şan"];

export function TrialLessonCreateForm({
  teachers,
  branches,
}: {
  teachers: { id: string; name: string }[];
  branches: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [instrument, setInstrument] = useState(INSTRUMENTS[0]);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [teacherId, setTeacherId] = useState(teachers[0]?.id ?? "");
  const [startAt, setStartAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("40");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/trials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          instrument,
          branchId,
          teacherId,
          startAt: new Date(startAt).toISOString(),
          durationMinutes: Number(durationMinutes),
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!json.ok) {
        setError(json.error?.message || "Planlanamadı");
        setBusy(false);
        return;
      }
      setName("");
      setPhone("");
      router.refresh();
    } catch {
      setError("Bağlantı hatası");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(ev) => void onSubmit(ev)} className="grid gap-2 sm:grid-cols-2">
      <div>
        <Label>Ad</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <Label>Telefon</Label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </div>
      <div>
        <Label>Branş</Label>
        <Select value={instrument} onChange={(e) => setInstrument(e.target.value)}>
          {INSTRUMENTS.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </Select>
      </div>
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
        <Label>Öğretmen</Label>
        <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Tarih / saat</Label>
        <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required />
      </div>
      <div>
        <Label>Süre (dk)</Label>
        {/*
          Deneme dersi normal derslerin sabit 30/40/50 dk seçenekleriyle
          SINIRLI DEĞİL — okul, tanıtım dersini istediği süreyle
          planlayabilir (bkz. createTrialLessonSchema, yalnızca 1-240 dk
          aralığıyla sınırlı).
        */}
        <Input
          type="number"
          min={1}
          max={240}
          step={1}
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(e.target.value)}
          required
        />
      </div>
      {error ? (
        <p className="sm:col-span-2 text-xs font-medium text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Kaydediliyor…" : "Deneme planla"}
        </Button>
      </div>
    </form>
  );
}
