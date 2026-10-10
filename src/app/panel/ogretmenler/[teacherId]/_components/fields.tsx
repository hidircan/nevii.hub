import { Card } from "@/components/ui";

/** Öğretmen detayı sekmelerinin paylaştığı küçük sunum parçaları. */
export function Field({ label, value, custom }: { label: string; value?: string; custom?: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">{label}</dt>
      <dd className="mt-0.5 font-medium text-[var(--color-text)]">{custom ?? value}</dd>
    </div>
  );
}

export function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "danger" | "success" }) {
  return (
    <Card className="!p-3 text-center">
      <p
        className="text-sm font-semibold"
        style={
          tone === "danger"
            ? { color: "var(--color-danger)" }
            : tone === "success"
              ? { color: "var(--color-success)" }
              : { color: "var(--color-text)" }
        }
      >
        {value}
      </p>
      <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">{label}</p>
    </Card>
  );
}
