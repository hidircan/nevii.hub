"use client";

import { useState } from "react";

type Overview = {
  subscriptions: {
    tenantId: string;
    planKey: string;
    status: string;
    billingInterval: string;
    amountMinor: number;
    sandbox: boolean;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    paidThrough: string | null;
    canceledAt: string | null;
    cancelAtPeriodEnd: boolean;
    provider: string;
    providerSubscriptionRef: string | null;
    lastWebhookAt: string | null;
    lastReconciledAt: string | null;
    enforcement: boolean;
    exception: unknown;
    updatedAt: string;
  }[];
  lastWebhooks: { id: string; provider: string; eventId: string; eventType: string; tenantId: string | null; status: string; error: string | null; createdAt: string }[];
  failedWebhooks: { id: string; eventId: string; eventType: string; error: string | null; createdAt: string }[];
  trialRequests: { id: string; institutionName: string; ownerName: string; ownerEmail: string; ownerPhone: string | null; status: string; tenantId: string | null; createdAt: string }[];
};

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("tr-TR") : "—");
const fmtMinor = (minor: number) => `${(minor / 100).toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ₺`;

/** NeviiOS abonelik yönetimi: enforcement, istisna, deneme kararı, mutabakat, kampanya. */
export function BillingManager({ data }: { data: Overview }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [exc, setExc] = useState({ tenantId: "", until: "", reason: "" });
  const [cmp, setCmp] = useState({ name: "", tenantId: "", discountType: "percent", percent: "20", amountMinor: "", intervalScope: "both", validTo: "", maxRenewals: "12", postCampaignNote: "" });

  async function post(path: string, body: unknown) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json()) as { ok: boolean; data?: unknown; error?: { message?: string } };
      setBusy(false);
      if (!json.ok) {
        setNotice({ kind: "error", text: json.error?.message ?? "İşlem başarısız." });
        return null;
      }
      setNotice({ kind: "ok", text: "İşlem tamamlandı." });
      return json.data;
    } catch {
      setBusy(false);
      setNotice({ kind: "error", text: "Bağlantı hatası." });
      return null;
    }
  }

  const refresh = () => window.location.reload();
  const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-amber-600 focus:outline-none";
  const btn = "rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60";
  const btnGhost = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60";

  return (
    <div className="space-y-6">
      {notice ? (
        <p role={notice.kind === "error" ? "alert" : "status"} className={`rounded-xl px-4 py-2.5 text-sm ring-1 ${notice.kind === "error" ? "bg-red-50 text-red-800 ring-red-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200"}`}>
          {notice.text}
        </p>
      ) : null}

      <section className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Abonelikler ({data.subscriptions.length})</h2>
          <button disabled={busy} className={btnGhost} onClick={async () => { const d = await post("/api/v1/platform/billing/overview", { action: "reconcile", limit: 25 }); if (d) refresh(); }}>
            Mutabakat çalıştır
          </button>
        </div>
        {data.subscriptions.length === 0 ? (
          <p className="text-sm text-slate-600">Kayıtlı abonelik yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-2 font-medium">Kurum</th>
                  <th className="py-2 pr-2 font-medium">Plan</th>
                  <th className="py-2 pr-2 font-medium">Durum</th>
                  <th className="py-2 pr-2 font-medium">Tutar</th>
                  <th className="py-2 pr-2 font-medium">Paid-through</th>
                  <th className="py-2 pr-2 font-medium">Enforcement</th>
                  <th className="py-2 font-medium">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {data.subscriptions.map((s) => (
                  <tr key={s.tenantId} className="border-b border-slate-100">
                    <td className="py-2 pr-2 font-mono">{s.tenantId.slice(0, 12)}…</td>
                    <td className="py-2 pr-2">{s.planKey} ({s.billingInterval === "yearly" ? "yıllık" : "aylık"})</td>
                    <td className="py-2 pr-2">{s.status}</td>
                    <td className="py-2 pr-2">{fmtMinor(s.amountMinor)}{s.sandbox ? " (SBX)" : ""}</td>
                    <td className="py-2 pr-2">{fmtDate(s.paidThrough)}</td>
                    <td className="py-2 pr-2">{s.enforcement ? "AÇIK" : "kapalı"}</td>
                    <td className="py-2">
                      <button
                        disabled={busy}
                        className={btnGhost}
                        onClick={async () => {
                          const d = await post("/api/v1/platform/billing/overview", { action: "enforcement", tenantId: s.tenantId, enabled: !s.enforcement });
                          if (d) refresh();
                        }}
                      >
                        {s.enforcement ? "Kapat" : "Aç"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="mb-3 text-base font-semibold">Manuel süre/istisna</h2>
        <div className="grid gap-2 sm:grid-cols-4">
          <input placeholder="tenantId" aria-label="tenantId" value={exc.tenantId} onChange={(e) => setExc({ ...exc, tenantId: e.target.value })} className={input} />
          <input type="datetime-local" aria-label="Bitiş" value={exc.until} onChange={(e) => setExc({ ...exc, until: e.target.value })} className={input} />
          <input placeholder="Gerekçe (en az 10 karakter)" aria-label="Gerekçe" value={exc.reason} onChange={(e) => setExc({ ...exc, reason: e.target.value })} className={`${input} sm:col-span-2`} />
        </div>
        <button
          disabled={busy || !exc.tenantId || !exc.until || exc.reason.trim().length < 10}
          className={`${btn} mt-2`}
          onClick={async () => {
            const d = await post("/api/v1/platform/billing/overview", { action: "exception", tenantId: exc.tenantId, until: new Date(exc.until).toISOString(), reason: exc.reason.trim() });
            if (d) refresh();
          }}
        >
          İstisna ver
        </button>
        <p className="mt-2 text-xs text-slate-500">İstisna ödenmiş kaydı taklit etmez; gerekçe + bitiş + audit ile kayıtlıdır.</p>
      </section>

      <section className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="mb-3 text-base font-semibold">Deneme başvuruları ({data.trialRequests.length})</h2>
        {data.trialRequests.length === 0 ? (
          <p className="text-sm text-slate-600">Bekleyen başvuru yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-2 font-medium">Kurum</th>
                  <th className="py-2 pr-2 font-medium">Sahip</th>
                  <th className="py-2 pr-2 font-medium">E-posta</th>
                  <th className="py-2 pr-2 font-medium">Durum</th>
                  <th className="py-2 font-medium">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {data.trialRequests.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-2 pr-2">{r.institutionName}</td>
                    <td className="py-2 pr-2">{r.ownerName}</td>
                    <td className="py-2 pr-2">{r.ownerEmail}</td>
                    <td className="py-2 pr-2">{r.status}</td>
                    <td className="py-2">
                      {r.status === "pending" ? (
                        <span className="flex gap-1">
                          <button disabled={busy} className={btn} onClick={async () => { const d = await post("/api/v1/platform/billing/overview", { action: "trial_decide", requestId: r.id, approve: true }); if (d) refresh(); }}>Onayla</button>
                          <button disabled={busy} className={btnGhost} onClick={async () => { const d = await post("/api/v1/platform/billing/overview", { action: "trial_decide", requestId: r.id, approve: false }); if (d) refresh(); }}>Reddet</button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-slate-500">Onay sonrası güvenli kurum daveti gönderilir; tenant açılınca deneme başlatılır.</p>
      </section>

      <section className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="mb-3 text-base font-semibold">Pilot kampanya oluştur</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          <input placeholder="Ad" aria-label="Kampanya adı" value={cmp.name} onChange={(e) => setCmp({ ...cmp, name: e.target.value })} className={input} />
          <input placeholder="Pilot tenantId (zorunlu)" aria-label="Pilot tenantId" value={cmp.tenantId} onChange={(e) => setCmp({ ...cmp, tenantId: e.target.value })} className={input} />
          <select aria-label="İndirim türü" value={cmp.discountType} onChange={(e) => setCmp({ ...cmp, discountType: e.target.value })} className={input}>
            <option value="percent">Yüzde</option>
            <option value="fixed_minor">Sabit (kuruş)</option>
          </select>
          {cmp.discountType === "percent" ? (
            <input type="number" min={1} max={100} placeholder="Yüzde" aria-label="Yüzde" value={cmp.percent} onChange={(e) => setCmp({ ...cmp, percent: e.target.value })} className={input} />
          ) : (
            <input type="number" min={0} placeholder="Tutar (kuruş)" aria-label="Sabit tutar" value={cmp.amountMinor} onChange={(e) => setCmp({ ...cmp, amountMinor: e.target.value })} className={input} />
          )}
          <select aria-label="Periyot kapsamı" value={cmp.intervalScope} onChange={(e) => setCmp({ ...cmp, intervalScope: e.target.value })} className={input}>
            <option value="both">Aylık + Yıllık</option>
            <option value="monthly">Yalnız aylık</option>
            <option value="yearly">Yalnız yıllık</option>
          </select>
          <input type="date" aria-label="Bitiş" value={cmp.validTo} onChange={(e) => setCmp({ ...cmp, validTo: e.target.value })} className={input} />
          <input type="number" min={0} placeholder="Azami yenileme" aria-label="Azami yenileme" value={cmp.maxRenewals} onChange={(e) => setCmp({ ...cmp, maxRenewals: e.target.value })} className={input} />
          <input placeholder="Sonrası fiyat notu (zorunlu)" aria-label="Sonrası fiyat" value={cmp.postCampaignNote} onChange={(e) => setCmp({ ...cmp, postCampaignNote: e.target.value })} className={`${input} sm:col-span-2`} />
        </div>
        <button
          disabled={busy || !cmp.name || !cmp.tenantId || !cmp.postCampaignNote}
          className={`${btn} mt-2`}
          onClick={async () => {
            const d = await post("/api/v1/platform/billing/campaigns", {
              action: "create",
              name: cmp.name,
              tenantId: cmp.tenantId,
              discountType: cmp.discountType,
              percent: cmp.discountType === "percent" ? Number(cmp.percent) : null,
              amountMinor: cmp.discountType === "fixed_minor" ? Number(cmp.amountMinor) : null,
              intervalScope: cmp.intervalScope,
              validTo: cmp.validTo ? new Date(cmp.validTo).toISOString() : null,
              maxRenewals: cmp.maxRenewals ? Number(cmp.maxRenewals) : null,
              postCampaignNote: cmp.postCampaignNote,
            });
            if (d) refresh();
          }}
        >
          Kampanya oluştur
        </button>
      </section>

      <section className="rounded-xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="mb-3 text-base font-semibold">Başarısız webhook işleri ({data.failedWebhooks.length})</h2>
        {data.failedWebhooks.length === 0 ? (
          <p className="text-sm text-slate-600">Başarısız iş yok.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {data.failedWebhooks.map((w) => (
              <li key={w.id} className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                <span className="font-mono">{w.eventId}</span> — {w.eventType} — {w.error ?? "hata yok"} ({new Date(w.createdAt).toLocaleString("tr-TR")})
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
