/**
 * 10. tur iş #6 — Finans Özeti grafikleri. Bağımlılıksız saf SVG:
 * - Gelir/gider (6 ay, gruplu çubuk) ve öğrenci-başına ortalama (ücret +
 *   tahsilat, gruplu çubuk). Yalnız 2 grafik — karar destekleyen minimum.
 * - Erişilebilirlik: `role="img"` + özet `aria-label`, her çubukta `<title>`
 *   ipucu; sayısal alternatif HER grafiğin altındaki tablodadır (bu
 *   bileşen tabloyu çizmez — sayfa çizer).
 * - Sunucu bileşeniyle uyumlu (etkileşim: yerel uçbirim yok, GET formu + title).
 */
import { formatMoney } from "@/lib/utils";

const INCOME = "#059669";
const EXPENSE = "#e11d48";
const FEE = "#d97706";
const COLLECTED = "#0d9488";
const GRID = "var(--color-border)";

function niceMax(values: number[]): number {
  const max = Math.max(0, ...values);
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  const n = max / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * pow;
}

function shortMonth(month: string): string {
  // yyyy-MM → "Eyl 26" gibi kısa etiket.
  const names = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
  const y = month.slice(0, 4);
  const m = Number(month.slice(5, 7));
  return `${names[m - 1] ?? m} ${y.slice(2)}`;
}

type Bar = { label: string; value: number | null; color: string; title: string };

function GroupedBars({
  groups,
  ariaLabel,
  height = 180,
}: {
  groups: { month: string; bars: [Bar, Bar] }[];
  ariaLabel: string;
  height?: number;
}) {
  const W = 560;
  const H = height;
  const padL = 8;
  const padB = 22;
  const padT = 8;
  const max = niceMax(groups.flatMap((g) => g.bars.map((b) => b.value ?? 0)));
  const plotH = H - padT - padB;
  const slot = (W - padL * 2) / Math.max(groups.length, 1);
  const barW = Math.min(34, (slot - 14) / 2);
  const y = (v: number) => padT + plotH - (v / max) * plotH;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      role="img"
      aria-label={ariaLabel}
      style={{ maxHeight: H }}
    >
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={padL} x2={W - padL} y1={padT + plotH * (1 - f)} y2={padT + plotH * (1 - f)} stroke={GRID} strokeWidth={1} />
          <text x={W - padL} y={padT + plotH * (1 - f) - 3} textAnchor="end" fontSize={9} fill="var(--color-text-muted)">
            {formatMoney(max * f)}
          </text>
        </g>
      ))}
      {groups.map((g, i) => {
        const cx = padL + slot * i + slot / 2;
        return (
          <g key={g.month}>
            {g.bars.map((b, bi) => {
              const v = b.value ?? 0;
              const x = cx + (bi === 0 ? -barW - 1.5 : 1.5);
              const h = Math.max(v > 0 ? 2 : 0, (v / max) * plotH);
              return (
                <rect key={bi} x={x} y={y(v)} width={barW} height={h} rx={2} fill={b.color} opacity={b.value === null ? 0.25 : 1}>
                  <title>{b.title}</title>
                </rect>
              );
            })}
            <text x={cx} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--color-text-muted)">
              {shortMonth(g.month)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function IncomeExpenseChart({ trend }: { trend: { month: string; income: number; expense: number }[] }) {
  const totalIncome = trend.reduce((s, t) => s + t.income, 0);
  const totalExpense = trend.reduce((s, t) => s + t.expense, 0);
  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: INCOME }} /> Gelir (tahsilat)
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: EXPENSE }} /> Gider (ödenen)
        </span>
      </div>
      <GroupedBars
        ariaLabel={`Son 6 ay gelir-gider grafiği. Toplam gelir ${formatMoney(totalIncome)}, toplam gider ${formatMoney(totalExpense)}.`}
        groups={trend.map((t) => ({
          month: t.month,
          bars: [
            { label: "Gelir", value: t.income, color: INCOME, title: `${t.month} gelir: ${formatMoney(t.income)}` },
            { label: "Gider", value: t.expense, color: EXPENSE, title: `${t.month} gider: ${formatMoney(t.expense)}` },
          ],
        }))}
      />
    </div>
  );
}

export function AverageFeeChart({
  points,
}: {
  points: { month: string; average: number | null; collectedAverage: number | null; studentCount: number }[];
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: FEE }} /> Öğrenci başına ücret
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLLECTED }} /> Öğrenci başına tahsilat
        </span>
      </div>
      <GroupedBars
        ariaLabel="Son 6 ay öğrenci başına ortalama ücret ve tahsilat grafiği."
        groups={points.map((p) => ({
          month: p.month,
          bars: [
            {
              label: "Ücret",
              value: p.average,
              color: FEE,
              title: `${p.month}: öğrenci başına ${p.average === null ? "—" : formatMoney(p.average)} (${p.studentCount} öğrenci)`,
            },
            {
              label: "Tahsilat",
              value: p.collectedAverage,
              color: COLLECTED,
              title: `${p.month}: öğrenci başına tahsilat ${p.collectedAverage === null ? "—" : formatMoney(p.collectedAverage)}`,
            },
          ],
        }))}
      />
    </div>
  );
}
