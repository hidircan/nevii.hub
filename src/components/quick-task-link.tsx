import Link from "next/link";
import { ListChecks } from "lucide-react";
import type { RelatedEntityType } from "@/lib/types";

/**
 * Package E — bağlamdan hızlı görev oluşturma. İkinci bir görev sistemi
 * KURMAZ: mevcut `/panel/is-takip/liste` sayfası zaten `newTask*` query param'ları
 * ile öğrenci/öğretmen/ders/ödeme/evrak/şube bağlamını okuyup formu
 * önceden dolduruyor ve kaydedince `task-detail-panel.tsx` "X'e git →"
 * linkleriyle kaynağa geri dönüyor — bu bileşen yalnızca o akışa giden
 * linki üretir (RBAC/tenant kesin olarak createTaskTool + validateTaskLinks'te
 * uygulanır, burada tekrar edilmez).
 *
 * İş Takip Merkezi genişletmesi: eski, alana-özel `context` prop'una ek
 * olarak (evrak/öğrenci/öğretmen/ödeme/ders/şube ekranlarının kullandığı)
 * generic `relatedEntityType`/`relatedEntityId`/`relatedEntityLabel`/`title`
 * prop'larını da destekler — hangisi verilirse ona göre ilgili `newTask*`
 * query parametreleri üretilir. İkisi birden verilmez.
 */
type LegacyContext = {
  studentId?: string;
  teacherId?: string;
  branchId?: string;
  lessonId?: string;
  paymentId?: string;
  documentId?: string;
};

type QuickTaskLinkProps = {
  label?: string;
  /** Görev kaydedildikten sonra "← Geri dön" ile döneceği yol (bkz. resolveSafeReturnTo). */
  returnTo?: string;
  className?: string;
} & (
  | {
      context: LegacyContext;
      relatedEntityType?: never;
      relatedEntityId?: never;
      relatedEntityLabel?: never;
      title?: never;
    }
  | {
      context?: never;
      relatedEntityType: RelatedEntityType;
      relatedEntityId: string;
      relatedEntityLabel: string;
      /** Düzenlenebilir taslak başlık, örn. "Ödeme takibi — Ada Yılmaz". */
      title?: string;
    }
);

export function QuickTaskLink({
  context,
  relatedEntityType,
  relatedEntityId,
  relatedEntityLabel,
  title,
  label = "Görev oluştur",
  returnTo,
  className,
}: QuickTaskLinkProps) {
  const params = new URLSearchParams();
  if (context) {
    if (context.studentId) params.set("newTaskStudentId", context.studentId);
    if (context.teacherId) params.set("newTaskTeacherId", context.teacherId);
    if (context.branchId) params.set("newTaskBranchId", context.branchId);
    if (context.lessonId) params.set("newTaskLessonId", context.lessonId);
    if (context.paymentId) params.set("newTaskPaymentId", context.paymentId);
    if (context.documentId) params.set("newTaskDocumentId", context.documentId);
  } else {
    params.set("newTaskRelatedType", relatedEntityType);
    params.set("newTaskRelatedId", relatedEntityId);
    params.set("newTaskRelatedLabel", relatedEntityLabel);
    if (title) params.set("newTaskTitle", title);
  }
  if (returnTo) params.set("returnTo", returnTo);

  return (
    <Link
      href={`/panel/is-takip/liste?${params.toString()}`}
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text)] hover:border-[var(--color-primary)]"
      }
    >
      <ListChecks className="h-3.5 w-3.5" aria-hidden />
      {label}
    </Link>
  );
}
