"use client";

/** Faz 3B — öğretmenin bekleyen dört haftalık değerlendirmeleri + gönderim formu. */

import { useState } from "react";
import { Button, Card, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { PeriodicAssessmentMobileForm } from "@/components/reports/periodic-assessment-mobile-form";

export type PendingPeriodicItem = {
  studentId: string;
  studentName: string;
  teacherId: string;
  periodStart: string;
  periodEnd: string;
};

function PendingItemForm({ item }: { item: PendingPeriodicItem }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="!p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-[var(--color-text)]">{item.studentName}</p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {formatDate(item.periodStart)} – {formatDate(item.periodEnd)}
          </p>
        </div>
        <Button variant={open ? "ghost" : "secondary"} onClick={() => setOpen((v) => !v)}>
          {open ? "Kapat" : "Değerlendirmeyi doldur"}
        </Button>
      </div>
      {open ? (
        <div className="mt-3">
          {/* 2026-10-14 — /gelisim ile aynı ortak form (taslak + sade mobil tasarım). */}
          <PeriodicAssessmentMobileForm
            studentId={item.studentId}
            draftOwner={item.teacherId}
            period={{ periodStart: item.periodStart, periodEnd: item.periodEnd }}
          />
        </div>
      ) : null}
    </Card>
  );
}

export function PeriodicAssessmentPendingList({ items }: { items: PendingPeriodicItem[] }) {
  if (items.length === 0) {
    return <EmptyState title="Bekleyen değerlendirme yok" description="Tüm dört haftalık değerlendirmeler güncel." />;
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <PendingItemForm key={`${item.studentId}:${item.periodStart}`} item={item} />
      ))}
    </div>
  );
}
