import { useState } from "react";
import { View } from "react-native";
import { AppHeader, Card, EmptyState, ErrorState, FilterChip, LoadingSkeleton, Screen, AppText } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { useLocale } from "../../../src/i18n/locale-context";
import { useTheme } from "../../../src/theme/theme-context";
import type { BranchesResponse, InstrumentsResponse, RoomsResponse } from "../../../src/types/api";

type Segment = "branches" | "rooms" | "instruments";

export default function Katalog() {
  const t = useTheme();
  const { t: tr } = useLocale();
  const [segment, setSegment] = useState<Segment>("branches");
  const branches = useApiGet<BranchesResponse>("/api/v1/branches");
  const rooms = useApiGet<RoomsResponse>("/api/v1/rooms");
  const instruments = useApiGet<InstrumentsResponse>("/api/v1/instruments");

  return (
    <Screen>
      <AppHeader title={tr("adm.catTitle")} showBack showNotifications={false} />

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <FilterChip label={tr("adm.catBranches")} selected={segment === "branches"} onPress={() => setSegment("branches")} />
        <FilterChip label={tr("adm.catRooms")} selected={segment === "rooms"} onPress={() => setSegment("rooms")} />
        <FilterChip label={tr("adm.catInstruments")} selected={segment === "instruments"} onPress={() => setSegment("instruments")} />
      </View>

      {segment === "branches" ? (
        branches.status === "loading" ? (
          <LoadingSkeleton rows={3} />
        ) : branches.status === "error" ? (
          <ErrorState message={branches.message} onRetry={branches.refresh} />
        ) : branches.data.branches.length === 0 ? (
          <EmptyState icon="business-outline" title={tr("adm.catNoBranch")} />
        ) : (
          <View style={{ gap: 10 }}>
            {branches.data.branches.map((b) => (
              <Card key={b.id}>
                <AppText style={[t.typography.cardTitle, { color: t.colors.text }]}>{b.name}</AppText>
                <AppText style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]}>
                  {b.address} · {b.city} · {b.phone}
                </AppText>
              </Card>
            ))}
          </View>
        )
      ) : null}

      {segment === "rooms" ? (
        rooms.status === "loading" ? (
          <LoadingSkeleton rows={3} />
        ) : rooms.status === "error" ? (
          <ErrorState message={rooms.message} onRetry={rooms.refresh} />
        ) : rooms.data.rooms.length === 0 ? (
          <EmptyState icon="grid-outline" title={tr("adm.catNoRoom")} />
        ) : (
          <View style={{ gap: 10 }}>
            {rooms.data.rooms.map((r) => (
              <Card key={r.id}>
                <AppText style={[t.typography.cardTitle, { color: t.colors.text }]}>{r.name}</AppText>
                <AppText style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]}>
                  {tr("adm.catCapacity", { n: r.capacity })} · {r.instruments.join(", ") || tr("adm.catAllInst")}
                </AppText>
              </Card>
            ))}
          </View>
        )
      ) : null}

      {segment === "instruments" ? (
        instruments.status === "loading" ? (
          <LoadingSkeleton rows={3} />
        ) : instruments.status === "error" ? (
          <ErrorState message={instruments.message} onRetry={instruments.refresh} />
        ) : (
          <View style={{ gap: 10 }}>
            {instruments.data.staticInstruments.map((name) => (
              <Card key={name}>
                <AppText style={[t.typography.body, { color: t.colors.text }]}>{name}</AppText>
              </Card>
            ))}
            {instruments.data.entries.map((e) => (
              <Card key={e.id}>
                <AppText style={[t.typography.body, { color: t.colors.text }]}>{e.name}</AppText>
              </Card>
            ))}
          </View>
        )
      ) : null}

      <AppText style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 16, textAlign: "center" }]}>
        {tr("adm.catFootnote")}
      </AppText>
    </Screen>
  );
}
