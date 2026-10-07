"use client";

import { useState } from "react";
import { Card, Input, Select } from "@/components/ui";

const labelCls = "mb-1 block text-xs font-medium text-[var(--color-text-muted)]";

export type ClubOption = {
  id: string;
  name: string;
  instrument: string;
  monthlyFee: number;
  maxMembers: number;
  activeMembers: number;
};

const tl = (n: number) => `${n.toLocaleString("tr-TR")} ₺`;

/**
 * 2026-10-05 — Yeni öğrenci kaydı: kulüp seçimi + kulüp ücreti tahsilatı (kurs ilk ödemesinden AYRI kutular).
 * Alan adları sunucudaki `parseClubRegistration` ile birebir: clubIds, clubFee_<id>, clubPaymentMethod, clubPaymentDate.
 * Kulüp sözleşmeye girmez; seçilen her kulübün bu ayki ücreti öğrencinin borcuna yazılır, burada girilen tutar tahsil edilir.
 */
export function ClubRegistrationCard({
  clubs,
  clubOnly,
  fieldErrors,
  lockedClubId,
}: {
  clubs: ClubOption[];
  clubOnly: boolean;
  fieldErrors: Record<string, string | undefined>;
  /**
   * 2026-10-07 — grup dersi başvurusundan kayıt: kulüp başvurudaki kulübe kilitlidir ve bu ekranda üyelik/ücret
   * YAZILMAZ (sunucu da yazmaz); kayıttan sonra başvuru ekranındaki "Kulübe ekle" önizleme + onayla tamamlanır.
   */
  lockedClubId?: string;
}) {
  const [selected, setSelected] = useState<string[]>(lockedClubId ? [lockedClubId] : []);
  const [fees, setFees] = useState<Record<string, string>>({});
  const chosen = clubs.filter((c) => selected.includes(c.id));
  const total = chosen.reduce((s, c) => s + (Number((fees[c.id] ?? String(c.monthlyFee)).replace(/[^\d]/g, "")) || 0), 0);
  const err = (k: string) => fieldErrors[k];

  if (lockedClubId) {
    const locked = clubs.find((c) => c.id === lockedClubId);
    return (
      <Card>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">Başvurulan kulüp</h2>
        <input type="hidden" name="clubIds" value={lockedClubId} />
        <p className="text-sm">
          {locked ? (
            <>
              <span className="font-medium">{locked.name}</span> <span className="text-xs text-[var(--color-text-muted)]">({locked.instrument} · {locked.activeMembers}/{locked.maxMembers} üye)</span>
            </>
          ) : (
            "Başvurunun kulübü aktif değil."
          )}
        </p>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          Bu ekranda yalnız öğrenci kaydı oluşur — kulüp üyeliği, kulüp ücreti, tahsilat veya sözleşme yazılmaz. Kayıttan sonra başvuru
          ekranına dönersiniz; “Kulübe ekle” önizlemesiyle (kapasite ve dahil solfej dahil) onaylayarak tamamlarsınız.
        </p>
        {err("clubs") ? <p role="alert" className="mt-2 text-xs font-medium text-rose-600">{err("clubs")}</p> : null}
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-[var(--color-primary)]">
        {clubOnly ? "Kulüp ve kulüp ücreti" : "Kulüp (ek) ve kulüp ücreti"}
      </h2>
      <p className="mb-3 text-xs text-[var(--color-text-muted)]">
        Kulüp sözleşmeye girmez. Seçilen her kulübün bu ayki ücreti öğrencinin hesabına ayrı satır olarak yazılır; aşağıya
        şimdi tahsil edilen tutarı girin (tahsil edilmediyse 0 — borç açık kalır). Sonraki aylar her ay otomatik borçlanır.
      </p>
      {clubs.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">Aktif kulüp yok. Önce Kulüpler ekranından kulüp oluşturun.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
          {clubs.map((c) => {
            const full = c.activeMembers >= c.maxMembers;
            const on = selected.includes(c.id);
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <label className={`flex min-w-0 flex-1 items-center gap-2 text-sm ${full && !on ? "opacity-50" : ""}`}>
                  <input
                    type="checkbox"
                    name="clubIds"
                    value={c.id}
                    checked={on}
                    disabled={full && !on}
                    onChange={(e) => setSelected((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))}
                  />
                  <span className="min-w-0">
                    <span className="font-medium text-[var(--color-text)]">{c.name}</span>
                    <span className="block text-xs text-[var(--color-text-muted)]">
                      {c.instrument} · {tl(c.monthlyFee)}/ay · {c.activeMembers}/{c.maxMembers} üye{full ? " · kontenjan dolu" : ""}
                    </span>
                  </span>
                </label>
                {on ? (
                  <div className="w-40">
                    <label htmlFor={`clubFee_${c.id}`} className={labelCls}>Tahsil edilen</label>
                    <Input
                      id={`clubFee_${c.id}`}
                      name={`clubFee_${c.id}`}
                      inputMode="numeric"
                      value={fees[c.id] ?? String(c.monthlyFee)}
                      onChange={(e) => setFees((p) => ({ ...p, [c.id]: e.target.value }))}
                      aria-describedby={`clubFeeHint_${c.id}`}
                    />
                    <span id={`clubFeeHint_${c.id}`} className="text-[11px] text-[var(--color-text-muted)]">
                      en fazla {tl(c.monthlyFee)}
                    </span>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {err("clubs") ? <p role="alert" className="mt-2 text-xs font-medium text-rose-600">{err("clubs")}</p> : null}
      {chosen.length > 0 ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="clubPaymentMethod" className={labelCls}>Kulüp ücreti ödeme türü</label>
            <Select id="clubPaymentMethod" name="clubPaymentMethod" defaultValue="" aria-invalid={!!err("clubPaymentMethod")}>
              <option value="">Seçin…</option>
              <option value="cash">Nakit</option>
              <option value="transfer">Havale</option>
              <option value="credit_card">Kredi Kartı</option>
            </Select>
            {err("clubPaymentMethod") ? <p role="alert" className="mt-1 text-xs text-rose-600">{err("clubPaymentMethod")}</p> : null}
          </div>
          <div>
            <label htmlFor="clubPaymentDate" className={labelCls}>Tahsilat tarihi</label>
            <Input id="clubPaymentDate" name="clubPaymentDate" type="date" aria-invalid={!!err("clubPaymentDate")} />
            {err("clubPaymentDate") ? <p role="alert" className="mt-1 text-xs text-rose-600">{err("clubPaymentDate")}</p> : null}
          </div>
          <div className="rounded-lg bg-[var(--color-surface-muted)] px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Kulüp tahsilatı toplamı</p>
            <p className="text-lg font-semibold tabular-nums text-[var(--color-text)]">{tl(total)}</p>
            {!clubOnly ? <p className="text-[11px] text-[var(--color-text-muted)]">Kurs ilk ödemesinden ayrı kaydedilir.</p> : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
