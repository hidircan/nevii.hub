import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { apiPost } from "../../../../src/api/client";
import { AppHeader, Button, Card, ConfirmDialog, Icon, Screen, SelectField, TextField } from "../../../../src/components/ui";
import { useApiGet } from "../../../../src/hooks/use-api";
import { useTheme } from "../../../../src/theme/theme-context";
import type { AnnouncementAudienceType, AdminStudentsResponse, TeachersResponse } from "../../../../src/types/api";

const AUDIENCE_OPTIONS: Array<{ label: string; value: AnnouncementAudienceType }> = [
  { label: "Tüm kurum", value: "all" },
  { label: "Öğretmenler", value: "teachers" },
  { label: "Veliler", value: "parents" },
  { label: "Öğrenciler", value: "students" },
];

export default function YeniDuyuru() {
  const t = useTheme();
  const router = useRouter();
  const teachers = useApiGet<TeachersResponse>("/api/v1/teachers");
  const students = useApiGet<AdminStudentsResponse>("/api/v1/students");

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audienceType, setAudienceType] = useState<AnnouncementAudienceType | null>("all");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teacherCount = teachers.status === "success" ? (teachers.data.total ?? teachers.data.teachers.length) : 0;
  const studentCount = students.status === "success" ? (students.data.total ?? students.data.students.length) : 0;

  const recipientCount =
    audienceType === "teachers" ? teacherCount : audienceType === "students" || audienceType === "parents" ? studentCount : teacherCount + studentCount;

  const canSubmit = title.trim().length > 0 && body.trim().length > 0 && !!audienceType;

  async function onConfirm() {
    setConfirming(false);
    setBusy(true);
    setError(null);
    const res = await apiPost("/api/v1/announcements", {
      title: title.trim(),
      body: body.trim(),
      audienceType,
      status: "published",
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message || "Duyuru gönderilemedi.");
      return;
    }
    router.back();
  }

  return (
    <Screen>
      <AppHeader title="Yeni duyuru" showBack showNotifications={false} />

      <View style={{ gap: 16 }}>
        <TextField label="Başlık" value={title} onChangeText={setTitle} placeholder="Duyuru başlığı" />
        <TextField label="Metin" value={body} onChangeText={setBody} placeholder="Duyuru içeriği" multiline numberOfLines={5} />
        <SelectField label="Kime gönderilecek" value={audienceType} options={AUDIENCE_OPTIONS} onChange={(v) => setAudienceType(v as AnnouncementAudienceType)} />

        <Card style={{ backgroundColor: t.colors.infoSoft }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon name="people-outline" size={16} color={t.colors.info} />
            <Text style={[t.typography.body, { color: t.colors.info }]}>Yaklaşık {recipientCount} kişiye ulaşacak</Text>
          </View>
        </Card>

        {error ? <Text style={[t.typography.caption, { color: t.colors.danger }]}>{error}</Text> : null}

        <Button label="Duyuruyu gönder" onPress={() => setConfirming(true)} disabled={!canSubmit} loading={busy} />
      </View>

      <ConfirmDialog
        visible={confirming}
        title="Duyuru gönderilsin mi?"
        message={`"${title}" başlıklı duyuru yaklaşık ${recipientCount} kişiye gönderilecek.`}
        confirmLabel="Gönder"
        onConfirm={onConfirm}
        onCancel={() => setConfirming(false)}
      />
    </Screen>
  );
}
