"use client";

import { useState, useTransition } from "react";
import { actionUpdatePerformanceWeights } from "@/lib/actions";
import { Button, Card } from "@/components/ui";
import { DEFAULT_PERFORMANCE_WEIGHTS, type PerformanceMetricDefinition } from "@/lib/performance-weights";

type Weights = Record<string, number>;

function total(weights: Weights): number {
  return Object.values(weights).reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);
}

function WeightTable({
  title,
  metrics,
  weights,
  onChange,
  disabled,
}: {
  title: string;
  metrics: PerformanceMetricDefinition[];
  weights: Weights;
  onChange: (key: string, value: number) => void;
  disabled: boolean;
}) {
  const sum = total(weights);
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">{title}</h2>
        <span className={`text-xs font-semibold tabular-nums ${sum === 100 ? "text-emerald-700" : "text-rose-700"}`}>
          Toplam: {sum} / 100
        </span>
      </div>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
          <tr>
            <th className="py-2">Metrik</th>
            <th className="w-28 py-2 text-right">Ağırlık</th>
            <th className="w-20 py-2 text-right">Durum</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => {
            const value = weights[m.key] ?? 0;
            return (
              <tr key={m.key} className="border-b border-[var(--color-border)] last:border-0">
                <td className="py-2 text-[var(--color-text)]">{m.label}</td>
                <td className="py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    aria-label={`${m.label} ağırlığı`}
                    value={value}
                    disabled={disabled}
                    onChange={(e) => onChange(m.key, e.target.value === "" ? 0 : Number(e.target.value))}
                    className="w-20 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-right text-sm tabular-nums"
                  />
                </td>
                <td className="py-2 text-right text-xs text-[var(--color-text-muted)]">{value > 0 ? "Aktif" : "Pasif"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

export function PerformanceWeightsEditor({
  teacherMetrics,
  staffMetrics,
  initialTeacher,
  initialStaff,
  canWrite,
}: {
  teacherMetrics: PerformanceMetricDefinition[];
  staffMetrics: PerformanceMetricDefinition[];
  initialTeacher: Weights;
  initialStaff: Weights;
  canWrite: boolean;
}) {
  const [teacher, setTeacher] = useState<Weights>(initialTeacher);
  const [staff, setStaff] = useState<Weights>(initialStaff);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setMessage(null);
    if (total(teacher) !== 100 || total(staff) !== 100) {
      setMessage({ ok: false, text: "Her iki tablonun toplamı da 100 olmalı. Kaydetmeden önce ağırlıkları düzeltin." });
      return;
    }
    startTransition(async () => {
      const result = await actionUpdatePerformanceWeights({ teacher, staff });
      setMessage(result.ok ? { ok: true, text: "Ağırlıklar kaydedildi. Performans puanları yeni ağırlıklarla hesaplanır." } : { ok: false, text: result.message });
    });
  }

  function resetDefaults() {
    setTeacher({ ...DEFAULT_PERFORMANCE_WEIGHTS.teacher });
    setStaff({ ...DEFAULT_PERFORMANCE_WEIGHTS.staff });
    setMessage(null);
  }

  const disabled = !canWrite || pending;

  return (
    <div className="space-y-4">
      {!canWrite ? (
        <p className="text-sm text-[var(--color-text-muted)]">Ağırlıkları değiştirmek için üstten tek bir kurum seçin.</p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <WeightTable title="Öğretmen performansı" metrics={teacherMetrics} weights={teacher} disabled={disabled} onChange={(k, v) => setTeacher({ ...teacher, [k]: v })} />
        <WeightTable title="Personel performansı" metrics={staffMetrics} weights={staff} disabled={disabled} onChange={(k, v) => setStaff({ ...staff, [k]: v })} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={save} disabled={disabled}>
          {pending ? "Kaydediliyor…" : "Ağırlıkları kaydet"}
        </Button>
        <Button type="button" variant="secondary" onClick={resetDefaults} disabled={disabled}>
          Ürün varsayılanına dön
        </Button>
        {message ? <p className={`text-sm ${message.ok ? "text-emerald-600" : "text-rose-600"}`}>{message.text}</p> : null}
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">
        Puan, verisi olan ve ağırlığı 0’dan büyük metriklerin ağırlıklı ortalamasıdır. Bir metriğin o dönem verisi yoksa
        kalan metrikler kendi aralarında yeniden oranlanır.
      </p>
    </div>
  );
}
