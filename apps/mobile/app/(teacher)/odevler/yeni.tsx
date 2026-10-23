import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { apiPost } from "../../../src/api/client";
import { useAuth } from "../../../src/auth/auth-context";
import { AppHeader, Button, Card, DueDateField, Icon, Screen, SelectField, TextField, AppText } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { ALLOWED_ATTACHMENT_MIME_TYPES, validateAttachment } from "../../../src/lib/attachment-validation";
import { useLocale } from "../../../src/i18n/locale-context";
import { useTheme } from "../../../src/theme/theme-context";
import type { TeacherStudentsResponse } from "../../../src/types/api";

type Attachment = { fileName: string; fileMimeType: string; fileData: string; sizeBytes: number };

export default function YeniOdev() {
  const t = useTheme();
  const { t: tr } = useLocale();
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ studentId?: string }>();
  const studentsRes = useApiGet<TeacherStudentsResponse>(user?.teacherId ? `/api/v1/teachers/${user.teacherId}/students` : "");

  const [studentId, setStudentId] = useState<string | null>(params.studentId ?? null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<Date>(() => new Date(Date.now() + 24 * 60 * 60 * 1000));
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options =
    studentsRes.status === "success" ? studentsRes.data.students.map((s) => ({ label: s.name, value: s.id })) : [];

  const canSubmit = !!studentId && title.trim().length > 0 && description.trim().length > 0 && !busy && !attaching;

  async function pickAttachment() {
    setAttachError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: ALLOWED_ATTACHMENT_MIME_TYPES,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;

    const validationError = validateAttachment(asset.mimeType, asset.size);
    if (validationError) {
      setAttachError(validationError);
      return;
    }

    setAttaching(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: "base64" });
      setAttachment({
        fileName: asset.name,
        fileMimeType: asset.mimeType || "application/octet-stream",
        fileData: base64,
        sizeBytes: asset.size ?? Math.floor((base64.length * 3) / 4),
      });
    } catch {
      setAttachError(tr("teachHw.attachUnreadable"));
    } finally {
      setAttaching(false);
    }
  }

  async function onSubmit() {
    setBusy(true);
    setError(null);
    const res = await apiPost<{ homeworkId: string }>("/api/v1/homework", {
      studentId,
      title: title.trim(),
      description: description.trim(),
      dueDate: dueDate.toISOString(),
      ...(attachment
        ? { fileName: attachment.fileName, fileMimeType: attachment.fileMimeType, fileData: attachment.fileData }
        : {}),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message || tr("teachHw.createFailed"));
      return;
    }
    router.back();
  }

  return (
    <Screen>
      <AppHeader title={tr("teachHw.createTitle")} showBack showNotifications={false} />

      <View style={{ gap: 16 }}>
        <SelectField
          label={tr("teachHw.studentLabel")}
          value={studentId}
          options={options}
          onChange={setStudentId}
          placeholder={tr("teachHw.pickStudent")}
          searchable
          searchPlaceholder={tr("teachHw.searchStudent")}
        />
        <TextField label={tr("teachHw.titleLabel")} value={title} onChangeText={setTitle} placeholder={tr("teachHw.titleExample")} />
        <TextField
          label={tr("teachHw.descLabel")}
          value={description}
          onChangeText={setDescription}
          placeholder={tr("teachHw.descPlaceholder")}
          multiline
          numberOfLines={4}
        />

        <DueDateField label={tr("attach.dueDate")} value={dueDate} onChange={setDueDate} minimumDate={new Date()} />

        <View style={{ gap: 6 }}>
          <AppText style={[t.typography.label, { color: t.colors.textMuted }]}>{tr("attach.fileOptional")}</AppText>
          {attachment ? (
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Icon name="document-attach-outline" size={20} color={t.colors.primary} />
                <View style={{ flex: 1 }}>
                  <AppText style={[t.typography.bodyStrong, { color: t.colors.text }]} numberOfLines={1}>
                    {attachment.fileName}
                  </AppText>
                  <AppText style={[t.typography.caption, { color: t.colors.textMuted }]}>
                    {Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB
                  </AppText>
                </View>
                <Pressable onPress={() => setAttachment(null)} hitSlop={8} accessibilityLabel={tr("teachHw.removeFile")}>
                  <Icon name="close-circle" size={20} color={t.colors.textMuted} />
                </Pressable>
              </View>
            </Card>
          ) : (
            <Pressable
              onPress={pickAttachment}
              disabled={attaching}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: t.colors.border,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 14,
              }}
            >
              <Icon name="attach-outline" size={18} color={t.colors.primary} />
              <AppText style={[t.typography.body, { color: t.colors.primary }]}>
                {attaching ? tr("teachHw.uploading") : tr("teachHw.attachButton")}
              </AppText>
            </Pressable>
          )}
          {attachError ? <AppText style={[t.typography.caption, { color: t.colors.danger }]}>{attachError}</AppText> : null}
        </View>

        {error ? <AppText style={[t.typography.caption, { color: t.colors.danger }]}>{error}</AppText> : null}

        <Button label={tr("teachHw.createButton")} onPress={onSubmit} disabled={!canSubmit} loading={busy} />
      </View>
    </Screen>
  );
}
