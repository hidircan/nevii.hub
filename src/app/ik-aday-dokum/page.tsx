import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRecruitmentPage } from "@/lib/recruitment/page-context";
import { exportApplicationsTool } from "@/lib/recruitment/tools";
import { parseApplicationFilter, type ApplicationFilter } from "@/lib/recruitment/filters";
import { runWithTenantAsync } from "@/lib/tenant-context";
import {
  applicationNumber,
  CATEGORY_LABELS,
  EDUCATION_LABELS,
  SOURCE_LABELS,
  STAGE_LABELS,
  fullName,
} from "@/lib/recruitment/constants";
import { DocumentPrintActions } from "@/components/document-print-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Aday dökümü" };

function describeFilter(f: ApplicationFilter): string {
  const parts: string[] = [];
  if (f.category) parts.push(CATEGORY_LABELS[f.category]);
  if (f.stages?.length) parts.push(`Aşama: ${f.stages.map((s) => STAGE_LABELS[s]).join(", ")}`);
  if (f.instruments?.length) parts.push(`Enstrüman: ${f.instruments.join(", ")}`);
  if (f.minExperience !== undefined) parts.push(`Deneyim ≥ ${f.minExperience} yıl`);
  if (f.minTeaching !== undefined) parts.push(`Öğretmenlik ≥ ${f.minTeaching} yıl`);
  if (f.education) parts.push(`Eğitim ≥ ${EDUCATION_LABELS[f.education]}`);
  if (f.sources?.length) parts.push(`Kaynak: ${f.sources.map((s) => SOURCE_LABELS[s]).join(", ")}`);
  if (f.city) parts.push(`Şehir: ${f.city}`);
  if (f.minRating !== undefined) parts.push(`Puan ≥ ${f.minRating}`);
  if (f.from || f.to) parts.push(`Tarih: ${f.from ?? "…"} – ${f.to ?? "…"}`);
  if (f.q) parts.push(`Arama: "${f.q}"`);
  return parts.length ? parts.join(" · ") : "Tüm aday havuzu";
}

const day = (iso: string) => new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

export default async function CandidatePrintPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { ctx, allMode } = await requireRecruitmentPage("/ik-aday-dokum");
  if (allMode) redirect("/panel/ik");
  const filter = parseApplicationFilter(sp);
  const idsRaw = typeof sp.ids === "string" ? sp.ids : "";
  const ids = idsRaw ? idsRaw.split(",").filter(Boolean).slice(0, 1000) : undefined;
  const detail = sp.detay === "1";
  const res = await runWithTenantAsync(ctx.tenantId, () => exportApplicationsTool(ctx, filter, ids));
  if (!res.ok) redirect("/panel/ik/adaylar");
  const { rows, institutionName } = res.data;
  const now = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "long", timeStyle: "short" }).format(new Date());

  return (
    <div className="print-light-palette min-h-screen bg-[#f4f2f8] px-4 py-8 text-[#1f1a17] print:bg-white print:p-0 sm:px-6">
      <div className="mx-auto max-w-[1100px]">
        <DocumentPrintActions backHref="/panel/ik/adaylar" backLabel="Aday havuzuna dön" />
        <div className="rounded-xl bg-white p-8 shadow-sm print:rounded-none print:p-0 print:shadow-none">
          <header className="mb-6 flex items-end justify-between border-b-2 border-[#1f1a17] pb-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-[#6b6255]">{institutionName} · İnsan Kaynakları</p>
              <h1 className="text-2xl font-bold">{detail ? "Aday profili" : "Aday dökümü"}</h1>
              <p className="mt-1 text-xs text-[#6b6255]">{ids ? `${rows.length} seçili aday` : describeFilter(filter)}</p>
            </div>
            <div className="text-right text-xs text-[#6b6255]">
              <p>{rows.length} aday</p>
              <p>{now}</p>
            </div>
          </header>

          {rows.length === 0 ? <p className="text-sm">Bu filtreye uyan aday yok.</p> : null}

          {detail ? (
            <div className="space-y-8">
              {rows.map((a) => (
                <article key={a.id} className="break-inside-avoid border-b border-[#e7e2d8] pb-6 last:border-0 print:break-after-page">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-xl font-semibold">{fullName(a)}</h2>
                      <p className="text-xs text-[#6b6255]">{applicationNumber(a.seq)} · {a.jobTitle} · {CATEGORY_LABELS[a.category]} · Başvuru {day(a.createdAt)}</p>
                    </div>
                    <p className="text-sm font-medium">{STAGE_LABELS[a.stage]}{a.ratingAvg !== null ? ` · ${a.ratingAvg.toFixed(1)}/5` : ""}</p>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
                    {[
                      ["E-posta", a.email],
                      ["Telefon", a.phone],
                      ["Şehir", a.city],
                      ["Doğum yılı", a.profile.birthYear],
                      ["Enstrüman", a.instruments.join(", ")],
                      ["Deneyim", a.experienceYears !== null ? `${a.experienceYears} yıl` : ""],
                      ["Öğretmenlik", a.teachingYears !== null ? `${a.teachingYears} yıl` : ""],
                      ["Eğitim", a.educationLevel ? EDUCATION_LABELS[a.educationLevel] : ""],
                      ["Okul", a.profile.school],
                      ["Bölüm", a.profile.department],
                      ["Mezuniyet", a.profile.graduationYear],
                      ["Diller", a.profile.languages?.join(", ")],
                      ["Güncel pozisyon", a.profile.currentPosition],
                      ["Müsaitlik", a.profile.availability],
                      ["Başlama", a.profile.availableFrom],
                      ["Kaynak", SOURCE_LABELS[a.source]],
                      ["Portfolyo", a.profile.portfolioUrl],
                      ["Etiketler", a.tags.map((t) => `#${t}`).join(" ")],
                    ].map(([k, v]) => (
                      <div key={String(k)} className="grid grid-cols-[110px_1fr] gap-2">
                        <dt className="text-[#6b6255]">{k}</dt>
                        <dd className="break-words">{v ? String(v) : "—"}</dd>
                      </div>
                    ))}
                  </dl>
                  {a.profile.coverLetter ? (
                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#6b6255]">Ön yazı</p>
                      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{a.profile.coverLetter}</p>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <table className="w-full border-collapse text-[11.5px]">
              <thead>
                <tr className="border-b border-[#1f1a17] text-left">
                  <th className="py-1.5 pr-2">No</th>
                  <th className="py-1.5 pr-2">Aday</th>
                  <th className="py-1.5 pr-2">İletişim</th>
                  <th className="py-1.5 pr-2">Pozisyon</th>
                  <th className="py-1.5 pr-2">Enstrüman</th>
                  <th className="py-1.5 pr-2">Deneyim</th>
                  <th className="py-1.5 pr-2">Eğitim</th>
                  <th className="py-1.5 pr-2">Aşama</th>
                  <th className="py-1.5 pr-2">Puan</th>
                  <th className="py-1.5">Tarih</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="break-inside-avoid border-b border-[#e7e2d8] align-top">
                    <td className="py-1.5 pr-2 tabular-nums">{applicationNumber(a.seq)}</td>
                    <td className="py-1.5 pr-2 font-medium">{fullName(a)}{a.city ? <span className="block font-normal text-[#6b6255]">{a.city}</span> : null}</td>
                    <td className="py-1.5 pr-2">{a.email}<span className="block">{a.phone}</span></td>
                    <td className="py-1.5 pr-2">{a.jobTitle}<span className="block text-[#6b6255]">{CATEGORY_LABELS[a.category]}</span></td>
                    <td className="py-1.5 pr-2">{a.instruments.join(", ") || "—"}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{a.experienceYears ?? "—"}{a.teachingYears !== null ? ` / ${a.teachingYears}` : ""}</td>
                    <td className="py-1.5 pr-2">{a.educationLevel ? EDUCATION_LABELS[a.educationLevel] : "—"}</td>
                    <td className="py-1.5 pr-2">{STAGE_LABELS[a.stage]}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{a.ratingAvg !== null ? a.ratingAvg.toFixed(1) : "—"}</td>
                    <td className="py-1.5 tabular-nums">{day(a.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-6 text-[10px] text-[#6b6255]">Deneyim sütunu: toplam / öğretmenlik (yıl). Bu belge kişisel veri içerir — KVKK kapsamında yalnız işe alım amacıyla kullanın ve saklayın.</p>
        </div>
        <p className="mt-3 text-center text-xs text-[#6b6255] print:hidden">PDF için: Yazdır → Hedef: &quot;PDF olarak kaydet&quot;.</p>
      </div>
    </div>
  );
}
