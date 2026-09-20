import { useState } from "react";
import { Text, View } from "react-native";
import { AppHeader, Button, Card, EmptyState, ErrorState, Icon, LoadingSkeleton, Screen, StatusBadge } from "../../components/ui";
import { useApiGet } from "../../hooks/use-api";
import { useSelectedStudentId } from "../../student/student-context";
import { shortDayMonth } from "../../lib/date";
import { downloadAndOpenFile } from "../../lib/open-file";
import { useTheme } from "../../theme/theme-context";
import { listFallback, usePersonaBasePath } from "../../lib/navigation";
import type { TeachingMaterialsResponse } from "../../types/api";

/** Öğretmenin paylaştığı materyaller — veli ve öğrenci için ortak, salt-okunur liste. */
export function StudentScopeMaterialsScreen() {
  const t = useTheme();
  const base = usePersonaBasePath();
  const studentId = useSelectedStudentId();
  const res = useApiGet<TeachingMaterialsResponse>(studentId ? `/api/v1/students/${studentId}/teaching-materials` : "");
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
    <Screen onRefresh={res.refresh} refreshing={res.status === "loading"}>
      <AppHeader title="Materyaller" showBack backFallback={listFallback(base, "gelisim")} showNotifications={false} />

      {res.status === "loading" ? (
        <LoadingSkeleton rows={4} />
      ) : res.status === "error" ? (
        <ErrorState message={res.message} onRetry={res.refresh} />
      ) : res.data.materials.length === 0 ? (
        <EmptyState icon="folder-open-outline" title="Henüz materyal paylaşılmadı" />
      ) : (
        <View style={{ gap: 10 }}>
          {downloadError ? <Text style={[t.typography.caption, { color: t.colors.danger }]}>{downloadError}</Text> : null}
          {res.data.materials.map((m) => (
            <Card key={m.id}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                <Icon name={m.fileName ? "document-attach-outline" : "book-outline"} size={18} color={t.colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[t.typography.cardTitle, { color: t.colors.text }]}>{m.title}</Text>
                  <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]} numberOfLines={3}>
                    {m.description}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    {m.targetInstrument ? <StatusBadge label={m.targetInstrument} tone="info" /> : null}
                    {m.targetLevel ? <StatusBadge label={m.targetLevel} tone="neutral" /> : null}
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
