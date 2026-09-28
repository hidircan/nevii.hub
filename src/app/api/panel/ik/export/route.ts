/** Yönetici: filtrelenmiş aday havuzunu CSV (Excel uyumlu, UTF-8 BOM, ; ayraç) olarak indirir. */
import { getSessionContext } from "@/lib/auth/session";
import { resolveWriteScope } from "@/lib/institution/write-scope";
import { runWithTenantAsync } from "@/lib/tenant-context";
import { exportApplicationsTool } from "@/lib/recruitment/tools";
import { parseApplicationFilter } from "@/lib/recruitment/filters";
import { applicationNumber, CATEGORY_LABELS, EDUCATION_LABELS, SOURCE_LABELS, STAGE_LABELS } from "@/lib/recruitment/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  // CSV/formül enjeksiyonu koruması (Excel =, +, -, @ ile başlayan hücreleri formül sanar).
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  const session = await getSessionContext().catch(() => null);
  if (!session) return new Response("Oturum gerekli.", { status: 401 });
  const scope = await resolveWriteScope(session);
  if (scope.mode !== "single") return new Response("Önce tek bir kurum seçin.", { status: 400 });
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams.entries());
  const filter = parseApplicationFilter(sp);
  const ids = sp.ids ? sp.ids.split(",").filter(Boolean).slice(0, 5000) : undefined;
  const ctx = { ...session, tenantId: scope.tenantId };
  const res = await runWithTenantAsync(scope.tenantId, () => exportApplicationsTool(ctx, filter, ids));
  if (!res.ok) return new Response(res.error.message, { status: res.error.code === "FORBIDDEN" ? 403 : 400 });
  const header = [
    "Başvuru no", "Ad", "Soyad", "E-posta", "Telefon", "Şehir", "Tür", "Pozisyon", "Aşama", "Enstrümanlar",
    "Deneyim (yıl)", "Öğretmenlik (yıl)", "Eğitim", "Okul", "Bölüm", "Mezuniyet", "Diller", "Müsaitlik",
    "Kaynak", "Puan", "Etiketler", "Portfolyo", "LinkedIn", "Başvuru tarihi",
  ];
  const lines = res.data.rows.map((a) =>
    [
      applicationNumber(a.seq), a.firstName, a.lastName, a.email, a.phone, a.city, CATEGORY_LABELS[a.category], a.jobTitle,
      STAGE_LABELS[a.stage], a.instruments.join(", "), a.experienceYears ?? "", a.teachingYears ?? "",
      a.educationLevel ? EDUCATION_LABELS[a.educationLevel] : "", a.profile.school ?? "", a.profile.department ?? "",
      a.profile.graduationYear ?? "", (a.profile.languages ?? []).join(", "), a.profile.availability ?? "",
      SOURCE_LABELS[a.source], a.ratingAvg ?? "", a.tags.join(", "), a.profile.portfolioUrl ?? "", a.profile.linkedinUrl ?? "",
      new Date(a.createdAt).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" }),
    ].map(cell).join(";")
  );
  const csv = "﻿" + [header.map(cell).join(";"), ...lines].join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="aday-havuzu-${stamp}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
