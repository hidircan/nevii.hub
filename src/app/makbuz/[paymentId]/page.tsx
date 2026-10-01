import Link from "@/components/link";
import { redirect } from "next/navigation";
import { requireSessionContext, homePathForRole } from "@/lib/auth/session";
import { readData } from "@/lib/store";
import { assertStudentAccess } from "@/lib/services/context";
import { buildReceiptViewModel, canViewReceipt, receiptIneligibleReason } from "@/lib/receipt";
import { formatDate, formatMoney } from "@/lib/utils";
import { Badge } from "@/components/ui";
import { ReceiptActions } from "@/components/receipt-actions";
import { printSurfaceCss } from "@/lib/contract-print-theme";
import { resolveSafeReturnTo, returnToLabel } from "@/lib/safe-return-to";

export const dynamic = "force-dynamic";

function NoticeScreen({
  title,
  description,
  backHref,
  backLabel,
}: {
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
}) {
  return (
    <div className="mx-auto max-w-lg px-6 py-20 text-center">
      <p className="text-lg font-semibold text-[var(--color-text)]">{title}</p>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">{description}</p>
      <Link
        href={backHref}
        className="mt-6 inline-block text-sm font-medium text-amber-600 hover:text-amber-700"
      >
        {backLabel}
      </Link>
    </div>
  );
}

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ paymentId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { paymentId } = await params;
  // 9. tur — makbuz birden çok ekrandan açılır (Ödemeler, öğrenci ödemeleri, Yoklama Takvimi);
  // geri dönüş açıldığı ekrana. Yalnız allowlist'teki panel yolları (open redirect yok).
  const safeReturnTo = resolveSafeReturnTo((await searchParams).returnTo);

  let session;
  try {
    session = await requireSessionContext();
  } catch {
    redirect(`/login?next=/makbuz/${paymentId}`);
  }
  // Karma Öğrenci Portalı — admin/super_admin her zaman görebilir (tenant
  // izolasyonu zaten `readData()`'da). STUDENT rolü (hem self-managed
  // öğrenci hem GUARDIAN veli) YALNIZCA kendi bağlı öğrencisinin makbuzunu
  // görebilir — bu, önceden STUDENT'ı bütünüyle dışlayan bir role gate'ti
  // (veli/öğrenci kendi makbuzunu HİÇ göremiyordu); studentId çözülene kadar
  // burada karar VERİLMEZ, aşağıda ownership doğrulanır.
  const isStaff = session.role === "SCHOOL_ADMIN" || session.role === "SUPER_ADMIN";
  if (!isStaff && session.role !== "STUDENT") {
    redirect(homePathForRole(session.role));
  }

  const data = await readData();
  const payment = data.payments.find((p) => p.id === paymentId);

  if (!payment) {
    return (
      <NoticeScreen
        title="Ödeme kaydı bulunamadı."
        description="Bu ödeme silinmiş olabilir veya kurumunuza ait değil."
        backHref={isStaff ? "/panel/odemeler" : "/ogrenci"}
        backLabel={isStaff ? "Ödemelere dön" : "Öğrenci portalına dön"}
      />
    );
  }

  const student = data.students.find((s) => s.id === payment.studentId);

  if (!isStaff) {
    const access = await assertStudentAccess(session, student, payment.studentId);
    if (!access.ok) {
      return (
        <NoticeScreen
          title="Bu makbuza erişiminiz yok."
          description="Yalnızca kendi bağlı olduğunuz öğrencinin ödeme makbuzunu görüntüleyebilirsiniz."
          backHref="/ogrenci"
          backLabel="Öğrenci portalına dön"
        />
      );
    }
  }

  const defaultBack = isStaff ? (student ? `/panel/odemeler/${student.id}` : "/panel/odemeler") : "/ogrenci#odemeler";
  const backHref = isStaff && safeReturnTo ? safeReturnTo : defaultBack;
  const backLabel = isStaff ? returnToLabel(backHref) : "Geri dön";

  if (!canViewReceipt(payment)) {
    return (
      <NoticeScreen
        title="Makbuz henüz oluşturulamıyor."
        description={receiptIneligibleReason(payment) ?? "Bu ödeme için makbuz görüntülenemiyor."}
        backHref={backHref}
        backLabel="Geri dön"
      />
    );
  }

  if (!student) {
    return (
      <NoticeScreen
        title="Makbuz oluşturulamadı."
        description="Bu ödemeye bağlı öğrenci kaydı bulunamadı."
        backHref="/panel/odemeler"
        backLabel="Ödemelere dön"
      />
    );
  }

  const branch = data.settings.branches.find((b) => b.id === student.branchId);
  const model = buildReceiptViewModel(payment, student, data.settings, branch);
  const issuedAtIso = new Date().toISOString();

  return (
    <div className="print-light-palette min-h-screen bg-[#f4f2f8] px-4 py-8 print:bg-white print:p-0 sm:px-6">
      <style>{`@media print { @page { size: A4; margin: 14mm; } }${printSurfaceCss("doc-print-surface")}`}</style>
      <div className="mx-auto max-w-2xl">
        <ReceiptActions backHref={backHref} backLabel={backLabel} />

        <div className="doc-print-surface rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-10">
          <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] pb-6">
            <p className="text-lg font-semibold text-[var(--color-text)]">Ödeme Makbuzu</p>
            <div className="shrink-0 text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Referans</p>
              <p className="mt-1 font-mono text-sm font-semibold text-[var(--color-text-muted)]">{model.reference}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Düzenlenme tarihi</p>
              <p className="mt-1 text-[var(--color-text)]">{formatDate(issuedAtIso, "d MMMM yyyy")}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Ödeme tarihi</p>
              <p className="mt-1 text-[var(--color-text)]">{formatDate(model.paymentDateIso, "d MMMM yyyy")}</p>
            </div>
          </div>

          <div className="mt-6 border-t border-[var(--color-border)] pt-6 text-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Öğrenci</p>
            <p className="mt-1 truncate text-base font-semibold text-[var(--color-text)]">{model.studentName}</p>
            {model.parentLine ? (
              <p className="mt-0.5 truncate text-[var(--color-text-muted)]">Veli: {model.parentLine}</p>
            ) : null}
          </div>

          <div className="mt-6 border-t border-[var(--color-border)] pt-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Açıklama</p>
                <p className="mt-1 truncate text-[var(--color-text)]">{model.description}</p>
                {model.method ? (
                  <p className="mt-1 text-xs text-[var(--color-text-muted)]">Yöntem: {model.method}</p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                  Tahsil edilen tutar
                </p>
                <p className="mt-1 text-2xl font-bold text-emerald-700">{formatMoney(model.amount)}</p>
                <div className="mt-1 flex justify-end">
                  <Badge status="paid" />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-12 flex border-t border-[var(--color-border)] pt-10 print:break-inside-avoid">
            <div className="min-w-[220px] max-w-xs flex-1">
              <div className="h-16 border-b border-slate-400" />
              <p className="mt-2 text-center text-xs font-medium text-[var(--color-text-muted)]">
                Teslim Eden
              </p>
            </div>
          </div>

          <p className="mt-10 text-center text-[11px] text-[var(--color-text-muted)]">
            Bu makbuz sistem tarafından oluşturulmuştur.
          </p>
        </div>
      </div>
    </div>
  );
}
