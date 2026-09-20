import { Text, View } from "react-native";
import { Card } from "../../components/ui";
import { useTheme } from "../../theme/theme-context";
import type { AttendanceLedgerResponse } from "../../types/api";

type Counts = AttendanceLedgerResponse["counts"];

/**
 * Tıklanabilir devam sayaçları — Gelişim ve veli yoklama özeti paylaşır.
 * "Katıldı" Geldi+İşlendi'yi kapsar (özet endpointiyle AYNI tanım).
 * Sayaç 0 ise kart dokunulmazdır (boş listeye sokulmaz), soluk gösterilir.
 */
export function AttendanceCounters({ counts, onOpen }: { counts: Counts; onOpen: (status: string) => void }) {
  const t = useTheme();
  const joined = counts.attended + counts.processed;
  const main = [
    { key: "joined", label: "Katıldı", value: joined, status: "attended,processed", color: t.colors.success },
    { key: "absent", label: "Gelmedi", value: counts.absent, status: "absent", color: t.colors.danger },
    { key: "excused", label: "İzinli", value: counts.excused, status: "excused", color: t.colors.info },
  ];
  const extra = [
    { key: "makeup", label: "Telafi", value: counts.makeup, status: "makeup" },
    { key: "pending", label: "Sonuçlanmadı", value: counts.pending, status: "pending" },
    { key: "cancelled", label: "İptal", value: counts.cancelled, status: "cancelled" },
  ].filter((c) => c.value > 0);

  return (
    <View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {main.map((c) => (
          <Card
            key={c.key}
            style={{ flex: 1, opacity: c.value > 0 ? 1 : 0.55 }}
            onPress={c.value > 0 ? () => onOpen(c.status) : undefined}
          >
            <Text style={[t.typography.screenTitle, { color: c.color }]}>{c.value}</Text>
            <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{c.label}</Text>
          </Card>
        ))}
      </View>
      {extra.length > 0 ? (
        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          {extra.map((c) => (
            <Card key={c.key} style={{ flex: 1 }} onPress={() => onOpen(c.status)}>
              <Text style={[t.typography.screenTitle, { color: t.colors.text }]}>{c.value}</Text>
              <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{c.label}</Text>
            </Card>
          ))}
          {Array.from({ length: Math.max(0, 3 - extra.length) }).map((_, i) => (
            <View key={`spacer-${i}`} style={{ flex: 1 }} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
