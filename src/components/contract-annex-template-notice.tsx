"use client";

/**
 * P0 (2026-09-05) — Sözleşme çıktısı artık TEK belgedir: ana sözleşme →
 * KVKK → fotoğraf/video (bkz. src/lib/contract-annexes.ts).
 *
 * REVİZYON (aynı gün): bu bileşen ARTIK BİR ENGEL DEĞİL, yalnızca BİLGİ
 * kutusudur. Kurumun kendi `kvkk` / `parent_social_media_consent` şablonu
 * eksik ya da eski bir tek-satırlık "stub" olsa bile sözleşme çıktısı
 * KURUMSAL KAYNAK METNİYLE tam üretilir (`resolveAnnexBody`) — normal
 * yeni-öğrenci akışında hiçbir şablon etkinleştirme adımı GEREKMEZ.
 * Buradaki taslak düğmesi yalnızca kurumun kendi şablon kaydını da
 * güncellemek isteyen yönetici için İKİNCİL bir kısayoldur; taslak
 * `active:false` üretilir, etkinleştirme ayrı/yetkili/audit'lenen bir
 * karardır (Evraklar → Şablon Yönetimi).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui";

export type AnnexTemplateDiagnostic = { kind: string; title: string; status: "ok" | "missing" | "stub" };

const STATUS_TEXT: Record<"missing" | "stub", string> = {
  missing: "kurumun kendi aktif şablonu yok — çıktıda kurumsal kaynak metni kullanılıyor",
  stub: "kurumun aktif şablonu çok kısa (eski bir örnek kayıt) — çıktıda kurumsal kaynak metni kullanılıyor",
};

export function ContractAnnexTemplateNotice({ diagnostics }: { diagnostics: AnnexTemplateDiagnostic[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const problems = diagnostics.filter((d) => d.status !== "ok");
  if (problems.length === 0) return null;

  async function createDraft(kind: string, title: string) {
    setBusy(kind);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/documents/templates/canonical-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const json = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!json.ok) {
        setError(json.error?.message || "Taslak oluşturulamadı.");
        return;
      }
      setMessage(
        `${title} için kurumsal kaynaktan bir TASLAK oluşturuldu. Yürürlüğe girmesi için Evraklar → Şablon Yönetimi bölümünden etkinleştirin.`
      );
      router.refresh();
    } catch {
      setError("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="mb-4 !border-sky-300 !bg-sky-50 !p-4 dark:!border-sky-900 dark:!bg-sky-950/30">
      <h2 className="text-sm font-semibold text-sky-900 dark:text-sky-300">
        Sözleşme ek bölümleri — kaynak bilgisi
      </h2>
      <p className="mt-1 text-xs text-sky-900/80 dark:text-sky-300/80">
        Sözleşme çıktısı; ana sözleşme, KVKK ve fotoğraf/video bölümlerini TEK belge olarak üretir.{" "}
        <strong>Ek bir işlem gerekmez.</strong> Aşağıdaki bölümlerde kurumun kendi şablon kaydı güncel olmadığı
        için metin doğrudan kurumsal kaynaktan alınmaktadır:
      </p>
      <ul className="mt-2 space-y-2">
        {problems.map((d) => (
          <li key={d.kind} className="flex flex-wrap items-center gap-2 text-xs text-sky-900 dark:text-sky-300">
            <span className="font-medium">{d.title}:</span>
            <span>{STATUS_TEXT[d.status as "missing" | "stub"]}</span>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void createDraft(d.kind, d.title)}
              className="rounded-md border border-sky-400 bg-white px-2.5 py-1 text-xs font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-50"
            >
              {busy === d.kind ? "Oluşturuluyor…" : "Kurum şablonunu da güncelle (opsiyonel)"}
            </button>
          </li>
        ))}
      </ul>
      {message ? <p className="mt-2 text-xs font-medium text-emerald-800 dark:text-emerald-400">{message}</p> : null}
      {error ? (
        <p className="mt-2 text-xs font-medium text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
      <Link href="/panel/evraklar" className="mt-2 inline-block text-xs font-medium text-sky-900 underline">
        Evraklar → Şablon Yönetimi&apos;ne git
      </Link>
    </Card>
  );
}
