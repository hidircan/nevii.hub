"use client";

/**
 * P0 (2026-08-29) — `actionCreateTaskForm` artık `useActionState` uyumlu
 * (bkz. actions.ts yorumu — `actionAddStudent` ile AYNI throw-based çökme
 * deseni taşıyordu, ama düzeltmeyi HİÇ ALMAMIŞTI). Bu form `QuickTaskLink`
 * aracılığıyla uygulama genelinde onlarca yerden erişilebilir olduğundan
 * yüksek etki alanı taşıyordu.
 */

import { useActionState, useEffect, useRef } from "react";
import { actionCreateTaskForm, type CreateTaskFormState } from "@/lib/actions";
import { Button, Input, Label, Select } from "@/components/ui";
import { TASK_CATEGORIES, TASK_PRIORITIES, TASK_PRIORITY_LABEL } from "@/lib/types";

export function NewTaskForm({
  hasContext,
  prefill,
  staff,
  branches,
}: {
  hasContext: boolean;
  prefill: {
    studentId: string;
    teacherId: string;
    lessonId: string;
    paymentId: string;
    documentId: string;
    relatedEntityType: string;
    relatedEntityId: string;
    relatedEntityLabel: string;
    title: string;
    branchId: string;
  };
  staff: { id: string; label: string; role: string }[];
  branches: { id: string; name: string }[];
}) {
  const [state, formAction, isPending] = useActionState<CreateTaskFormState, FormData>(actionCreateTaskForm, null);
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const hasError = !!state?.message;

  useEffect(() => {
    if (hasError) summaryRef.current?.focus();
  }, [hasError, state]);

  return (
    <form action={formAction} className="space-y-3" noValidate>
      {hasError ? (
        <p
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800 outline-none dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
        >
          {state!.message}
        </p>
      ) : null}
      {hasContext ? (
        <p className="rounded-md bg-[var(--color-bg)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
          Bu görev otomatik olarak bağlı kayda bağlanacak.
        </p>
      ) : null}
      <input type="hidden" name="studentId" value={prefill.studentId} />
      <input type="hidden" name="teacherId" value={prefill.teacherId} />
      <input type="hidden" name="lessonId" value={prefill.lessonId} />
      <input type="hidden" name="paymentId" value={prefill.paymentId} />
      <input type="hidden" name="documentId" value={prefill.documentId} />
      <input type="hidden" name="relatedEntityType" value={prefill.relatedEntityType} />
      <input type="hidden" name="relatedEntityId" value={prefill.relatedEntityId} />
      <input type="hidden" name="relatedEntityLabel" value={prefill.relatedEntityLabel} />
      <div>
        <Label>Başlık</Label>
        <Input name="title" required defaultValue={prefill.title} placeholder="Örn. Kayıt formunu güncelle" />
      </div>
      <div>
        <Label>Açıklama (opsiyonel)</Label>
        <Input name="description" placeholder="Kısa açıklama" />
      </div>
      <div>
        <Label>Kategori</Label>
        <Select name="category" defaultValue="Kayıt">
          {TASK_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Öncelik</Label>
        <Select name="priority" defaultValue="MEDIUM">
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {TASK_PRIORITY_LABEL[p]}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Sorumlu (opsiyonel)</Label>
        <Select name="assigneeId" defaultValue="">
          <option value="">Atanmadı</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label} {s.role !== "TEACHER" ? "(yönetici)" : ""}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Şube (opsiyonel)</Label>
        <Select name="branchId" defaultValue={prefill.branchId}>
          <option value="">Seçilmedi</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Başlangıç (opsiyonel)</Label>
          <Input name="startDate" type="date" />
        </div>
        <div>
          <Label>Son tarih (opsiyonel)</Label>
          <Input name="dueDate" type="date" />
        </div>
      </div>
      <div>
        <Label>Etiketler (virgülle ayır, opsiyonel)</Label>
        <Input name="tags" placeholder="ör. acil, form" />
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Oluşturuluyor…" : "Görev oluştur"}
      </Button>
    </form>
  );
}
