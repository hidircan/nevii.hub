import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { apiPost } from "../../../../src/api/client";
import { AppHeader, Button, Card, ConfirmDialog, Icon, Screen, SelectField, TextField, AppText } from "../../../../src/components/ui";
import { useApiGet } from "../../../../src/hooks/use-api";
import { useLocale } from "../../../../src/i18n/locale-context";
import { useTheme } from "../../../../src/theme/theme-context";
import type { AnnouncementAudienceType, AdminStudentsResponse, TeachersResponse } from "../../../../src/types/api";

export default function YeniDuyuru() {
  const t = useTheme();
  const { t: tr } = useLocale();
  const router = useRouter();
  const AUDIENCE_OPTIONS: Array<{ label: string; value: AnnouncementAudienceType }> = [
    { label: tr("adm.anncAudAll"), value: "all" },
    { label: tr("adm.anncAudTeachers"), value: "teachers" },
    { label: tr("adm.anncAudParents"), value: "parents" },
    { label: tr("adm.anncAudStudents"), value: "students" },
  ];
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
      setError(res.error.message || tr("adm.anncSendFail"));
      return;
    }
    router.back();
  }

  return (
    <Screen>
      <AppHeader title={tr("adm.anncNewTitle")} showBack showNotifications={false} />

      <View style={{ gap: 16 }}>
        <TextField label={tr("adm.anncTitleField")} value={title} onChangeText={setTitle} placeholder={tr("adm.anncTitlePh")} />
        <TextField label={tr("adm.anncBodyField")} value={body} onChangeText={setBody} placeholder={tr("adm.anncBodyPh")} multiline numberOfLines={5} />
        <SelectField label={tr("adm.anncAudience")} value={audienceType} options={AUDIENCE_OPTIONS} onChange={(v) => setAudienceType(v as AnnouncementAudienceType)} />

        <Card style={{ backgroundColor: t.colors.infoSoft }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon name="people-outline" size={16} color={t.colors.info} />
            <AppText style={[t.typography.body, { color: t.colors.info }]}>{tr("adm.anncReach", { n: recipientCount })}</AppText>
          </View>
        </Card>

        {error ? <AppText style={[t.typography.caption, { color: t.colors.danger }]}>{error}</AppText> : null}

        <Button label={tr("adm.anncSend")} onPress={() => setConfirming(true)} disabled={!canSubmit} loading={busy} />
      </View>

      <ConfirmDialog
        visible={confirming}
        title={tr("adm.anncConfirmTitle")}
        message={tr("adm.anncConfirmMsg", { title, n: recipientCount })}
        confirmLabel={tr("adm.anncConfirm")}
        onConfirm={onConfirm}
        onCancel={() => setConfirming(false)}
      />
    </Screen>
  );
}
