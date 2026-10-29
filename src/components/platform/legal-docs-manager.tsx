"use client";

import { useState } from "react";

type Revision = {
  version: string;
  bodyText: string;
  source: "neviios" | "neviiads-aktarim";
  legalReview: string;
  legalNote: string | null;
  commercial: string;
  commercialNote: string | null;
  createdBy: string;
  createdAt: string;
};

type DocState = {
  docId: string;
  publishedVersion: string | null;
  publishedBy: string | null;
  publishedAt: string | null;
  revisions: Revision[];
};

export type LegalDocRow = {
  id: string;
  title: string;
  version: string;
  scope: string;
  about: string;
  approved: boolean;
  state: DocState | null;
};

const REVIEW_TR: Record<string, string> = { bekliyor: "Bekliyor", onaylandi: "Onaylandı", reddedildi: "Reddedildi" };
const SOURCE_TR: Record<string, string> = { neviios: "NeviiOS taslağı", "neviiads-aktarim": "NeviiAds'ten aktarıldı" };
const fmtDateTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
};

/** Hukuki belgelerin TEK yönetim ekranı (taslak + değerlendirme + yayın). */
export function LegalDocsManager({ docs }: { docs: LegalDocRow[] }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ docId: string; bodyText: string; source: "neviios" | "neviiads-aktarim" } | null>(null);
  const [preview, setPreview] = useState<Revision | null>(null);

  async function post(body: unknown) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/v1/platform/billing/legal-docs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json()) as { ok: boolean; error?: { message?: string } };
      setBusy(false);
      if (!json.ok) {
        setNotice({ kind: "error", text: json.error?.message ?? "İşlem başarısız." });
        return false;
      }
      setNotice({ kind: "ok", text: "İşlem tamamlandı." });
      return true;
    } catch {
      setBusy(false);
      setNotice({ kind: "error", text: "Bağlantı hatası." });
      return false;
    }
  }

  const refresh = () => window.location.reload();
  const input = "w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none";
  const inputLabel = "mb-1 block text-xs font-medium text-[var(--color-text-muted)]";
  const btn = "rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60";
  const btnGhost = "rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-muted)] disabled:opacity-60";

  return (
    <div className="space-y-4">
      {notice ? (
        <p role={notice.kind === "error" ? "alert" : "status"} className={`rounded-[var(--radius-md)] px-4 py-2.5 text-sm border ${notice.kind === "error" ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-[var(--color-danger)]" : "bg-[var(--color-success-soft)] text-[var(--color-success)] border-[var(--color-success)]"}`}>
          {notice.text}
        </p>
      ) : null}

      {docs.map((d) => {
        const st = d.state;
        const expanded = open === d.id;
        return (
          <section key={d.id} className="rounded-[var(--radius-md)] bg-[var(--color-surface)] p-5 border border-[var(--color-border)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold">
                  {d.title}{" "}
                  <span className="text-xs font-normal text-[var(--color-text-muted)]">
                    ({d.scope === "required" ? "sözleşme" : "bilgilendirme"})
                  </span>
                </h2>
                <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                  {st?.publishedVersion ? (
                    <>Yayında: sürüm {st.publishedVersion} · {d.approved ? "müşteriye sunuluyor" : ""}</>
                  ) : (
                    <>Yayın yok — müşteriye sunulan metin yok (ödeme öncesi taslak notu görünür).</>
                  )}
                  {d.scope === "required" && !d.approved ? " Gerçek satış bu belge yüzünden kapalı." : ""}
                </p>
              </div>
              <div className="flex gap-1">
                <button disabled={busy} className={btnGhost} onClick={() => setOpen(expanded ? null : d.id)}>
                  {expanded ? "Kapat" : "Yönet"}
                </button>
              </div>
            </div>

            {expanded ? (
              <div className="mt-4 space-y-4">
                <p className="text-xs text-[var(--color-text-muted)]">{d.about}</p>
                {st && st.revisions.length > 0 ? (
                  <ul className="space-y-2">
                    {st.revisions.map((r) => (
                      <li key={r.version} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] px-3 py-2 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold text-sm">
                            Sürüm {r.version}
                            {st.publishedVersion === r.version ? " · YAYINDA" : ""}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            <button disabled={busy} className={btnGhost} onClick={() => setPreview(r)}>Önizle</button>
                            {st.publishedVersion === r.version ? (
                              <button
                                disabled={busy}
                                className={btnGhost}
                                onClick={async () => {
                                  if (!window.confirm("Bu sürüm yayından kaldırılsın mı? Müşteriye sunulan metin kalkar.")) return;
                                  if (await post({ action: "publish", docId: d.id, version: null })) refresh();
                                }}
                              >
                                Yayından kaldır
                              </button>
                            ) : (
                              <button
                                disabled={busy}
                                className={btn}
                                title={r.legalReview !== "onaylandi" || r.commercial !== "onaylandi" ? "Yayın için iki onay gerekli." : undefined}
                                onClick={async () => {
                                  if (!window.confirm(`${r.version} yayımlansın mı? Müşteriye sunulan metin bu olur.`)) return;
                                  if (await post({ action: "publish", docId: d.id, version: r.version })) refresh();
                                }}
                              >
                                Yayınla
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="mt-1 text-[var(--color-text-muted)]">
                          {SOURCE_TR[r.source]} · {fmtDateTime(r.createdAt)} · Hukuki inceleme: {REVIEW_TR[r.legalReview] ?? r.legalReview}
                          {r.legalNote ? ` (${r.legalNote})` : ""} · Ticari onay: {REVIEW_TR[r.commercial] ?? r.commercial}
                          {r.commercialNote ? ` (${r.commercialNote})` : ""}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(["legalReview", "commercial"] as const).map((field) => (
                            <label key={field} className="flex items-center gap-1">
                              <span className="text-[var(--color-text-muted)]">{field === "legalReview" ? "Hukuki:" : "Ticari:"}</span>
                              <select
                                aria-label={field === "legalReview" ? "Hukuki inceleme" : "Ticari onay"}
                                disabled={busy}
                                value={field === "legalReview" ? r.legalReview : r.commercial}
                                onChange={async (e) => {
                                  if (await post({ action: "review", docId: d.id, version: r.version, field, value: e.target.value })) refresh();
                                }}
                                className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1 text-xs"
                              >
                                <option value="bekliyor">Bekliyor</option>
                                <option value="onaylandi">Onaylandı</option>
                                <option value="reddedildi">Reddedildi</option>
                              </select>
                            </label>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[var(--color-text-muted)]">Henüz taslak revizyon yok. Aşağıdan oluşturun (metin boş başlar).</p>
                )}

                {draft?.docId === d.id ? (
                  <div className="rounded-lg border border-[var(--color-border)] p-3">
                    <label className={inputLabel} htmlFor={`draft-${d.id}`}>Yeni taslak metni (düz metin)</label>
                    <textarea
                      id={`draft-${d.id}`}
                      rows={8}
                      value={draft.bodyText}
                      onChange={(e) => setDraft({ ...draft, bodyText: e.target.value })}
                      placeholder="Belge metnini yazın veya NeviiAds taslağından yapıştırın…"
                      className={`${input} font-mono text-xs`}
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1 text-xs">
                        <span className="text-[var(--color-text-muted)]">Kaynak:</span>
                        <select
                          aria-label="Taslak kaynağı"
                          value={draft.source}
                          onChange={(e) => setDraft({ ...draft, source: e.target.value as "neviios" | "neviiads-aktarim" })}
                          className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 py-1 text-xs"
                        >
                          <option value="neviios">NeviiOS taslağı</option>
                          <option value="neviiads-aktarim">NeviiAds'ten aktarıldı</option>
                        </select>
                      </label>
                      <button
                        disabled={busy || draft.bodyText.trim().length < 20}
                        className={btn}
                        onClick={async () => {
                          if (await post({ action: "revise", docId: d.id, bodyText: draft.bodyText, source: draft.source })) refresh();
                        }}
                      >
                        Taslağı kaydet
                      </button>
                      <button disabled={busy} className={btnGhost} onClick={() => setDraft(null)}>Vazgeç</button>
                    </div>
                  </div>
                ) : (
                  <button disabled={busy} className={btnGhost} onClick={() => setDraft({ docId: d.id, bodyText: "", source: "neviios" })}>
                    Yeni taslak revizyon
                  </button>
                )}
              </div>
            ) : null}
          </section>
        );
      })}

      {preview ? (
        <div role="dialog" aria-modal="true" aria-labelledby="legal-preview-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-[var(--radius-md)] bg-[var(--color-surface)] p-6 shadow-xl">
            <h3 id="legal-preview-title" className="text-base font-semibold">Önizleme — sürüm {preview.version}</h3>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">{SOURCE_TR[preview.source]} · düz metin önizlemesi</p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{preview.bodyText}</p>
            <button type="button" onClick={() => setPreview(null)} autoFocus className={`${btn} mt-4`}>
              Kapat
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
