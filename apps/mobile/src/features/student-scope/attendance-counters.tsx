import { View } from "react-native";
import { Card, AppText } from "../../components/ui";
import { useLocale } from "../../i18n/locale-context";
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
  const { t: tr } = useLocale();
  const joined = counts.attended + counts.processed;
  // "Mazeretli" (excused) 2026-10-30 owner kararıyla statütten çıkar: web
  // panelde bu sayaç YOK. Legacy bayrağın sayısı gösterilmez; sunucu
  // alanı olduğu gibi kalır.
  const main = [
    { key: "joined", label: tr("att.cJoined"), value: joined, status: "attended,processed", color: t.colors.success },
    { key: "absent", label: tr("att.cAbsent"), value: counts.absent, status: "absent", color: t.colors.danger },
  ];
  const extra = [
    { key: "makeup", label: tr("att.cMakeup"), value: counts.makeup, status: "makeup" },
    { key: "pending", label: tr("att.cPending"), value: counts.pending, status: "pending" },
    { key: "cancelled", label: tr("att.cCancelled"), value: counts.cancelled, status: "cancelled" },
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
            <AppText style={[t.typography.screenTitle, { color: c.color }]}>{c.value}</AppText>
            <AppText style={[t.typography.caption, { color: t.colors.textMuted }]}>{c.label}</AppText>
          </Card>
        ))}
      </View>
      {extra.length > 0 ? (
        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          {extra.map((c) => (
            <Card key={c.key} style={{ flex: 1 }} onPress={() => onOpen(c.status)}>
              <AppText style={[t.typography.screenTitle, { color: t.colors.text }]}>{c.value}</AppText>
              <AppText style={[t.typography.caption, { color: t.colors.textMuted }]}>{c.label}</AppText>
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
