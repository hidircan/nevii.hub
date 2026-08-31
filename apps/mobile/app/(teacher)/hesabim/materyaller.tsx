import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { AppHeader, Button, Card, EmptyState, ErrorState, FloatingActionButton, Icon, LoadingSkeleton, Screen, StatusBadge } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { useFocusRefetch } from "../../../src/hooks/use-focus-refetch";
import { shortDayMonth } from "../../../src/lib/date";
import { downloadAndOpenFile } from "../../../src/lib/open-file";
import { useTheme } from "../../../src/theme/theme-context";
import type { TeachingMaterialsResponse } from "../../../src/types/api";

export default function TeacherMateryaller() {
  const t = useTheme();
  const router = useRouter();
  const res = useApiGet<TeachingMaterialsResponse>("/api/v1/teaching-materials/mine");
  useFocusRefetch(res.refresh);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function onOpenFile(materialId: string, fileName: string) {
    setDownloadError(null);
    setDownloadingId(materialId);
    const result = await downloadAndOpenFile(`/api/v1/teaching-materials/${materialId}/file`, fileName);
    setDownloadingId(null);
    if (!result.ok) setDownloadError(result.message);
  }

  return (
    <Screen
      floatingAction={<FloatingActionButton icon="add" accessibilityLabel="Yeni materyal" onPress={() => router.push("/(teacher)/hesabim/materyaller-yeni")} />}
    >
      <AppHeader title="Materyallerim" showBack showNotifications={false} />

      {res.status === "loading" ? (
        <LoadingSkeleton rows={4} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : res.data.materials.length === 0 ? (
        <EmptyState icon="folder-open-outline" title="Henüz materyal paylaşmadınız" actionLabel="Yeni materyal" onAction={() => router.push("/(teacher)/hesabim/materyaller-yeni")} />
      ) : (
        <View style={{ gap: 10 }}>
          {downloadError ? <Text style={{ color: t.colors.danger }}>{downloadError}</Text> : null}
          {res.data.materials.map((m) => (
            <Card key={m.id}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                <Icon name={m.fileName ? "document-attach-outline" : "book-outline"} size={18} color={t.colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[t.typography.cardTitle, { color: t.colors.text }]}>{m.title}</Text>
                  <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]} numberOfLines={2}>
                    {m.description}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    {m.targetInstrument ? <StatusBadge label={m.targetInstrument} tone="info" /> : <StatusBadge label="Tüm öğrenciler" tone="neutral" />}
                  </View>
                  <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 6 }]}>{shortDayMonth(new Date(m.createdAt))}</Text>
                  {m.fileName ? (
                    <View style={{ marginTop: 10 }}>
                      <Button
                        label={downloadingId === m.id ? "İndiriliyor…" : `Dosyayı aç · ${m.fileName}`}
                        icon="download-outline"
                        variant="secondary"
                        size="sm"
                        fullWidth={false}
                        loading={downloadingId === m.id}
                        disabled={downloadingId !== null}
                        onPress={() => onOpenFile(m.id, m.fileName!)}
                      />
                    </View>
                  ) : null}
                </View>
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
