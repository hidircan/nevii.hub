import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { apiPost } from "../../../src/api/client";
import { useAuth } from "../../../src/auth/auth-context";
import { AppHeader, Button, Card, DueDateField, Icon, Screen, SelectField, TextField } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { ALLOWED_ATTACHMENT_MIME_TYPES, validateAttachment } from "../../../src/lib/attachment-validation";
import { useTheme } from "../../../src/theme/theme-context";
import type { TeacherStudentsResponse } from "../../../src/types/api";

type Attachment = { fileName: string; fileMimeType: string; fileData: string; sizeBytes: number };

export default function YeniOdev() {
  const t = useTheme();
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
      setAttachError("Dosya okunamadı. Lütfen tekrar deneyin.");
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
      setError(res.error.message || "Ödev oluşturulamadı.");
      return;
    }
    router.back();
  }

  return (
    <Screen>
      <AppHeader title="Yeni ödev" showBack showNotifications={false} />

      <View style={{ gap: 16 }}>
        <SelectField
          label="Öğrenci"
          value={studentId}
          options={options}
          onChange={setStudentId}
          placeholder="Öğrenci seçin"
          searchable
          searchPlaceholder="Öğrenci ara"
        />
        <TextField label="Başlık" value={title} onChangeText={setTitle} placeholder="Ör. Gam çalışması" />
        <TextField
          label="Açıklama"
          value={description}
          onChangeText={setDescription}
          placeholder="Ödev detayları"
          multiline
          numberOfLines={4}
        />

        <DueDateField label="Son tarih" value={dueDate} onChange={setDueDate} minimumDate={new Date()} />

        <View style={{ gap: 6 }}>
          <Text style={[t.typography.label, { color: t.colors.textMuted }]}>Dosya eki (opsiyonel)</Text>
          {attachment ? (
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Icon name="document-attach-outline" size={20} color={t.colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[t.typography.bodyStrong, { color: t.colors.text }]} numberOfLines={1}>
                    {attachment.fileName}
                  </Text>
                  <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>
                    {Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB
                  </Text>
                </View>
                <Pressable onPress={() => setAttachment(null)} hitSlop={8} accessibilityLabel="Dosyayı kaldır">
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
              <Text style={[t.typography.body, { color: t.colors.primary }]}>
                {attaching ? "Yükleniyor…" : "Dosya, fotoğraf veya video ekle"}
              </Text>
            </Pressable>
          )}
          {attachError ? <Text style={[t.typography.caption, { color: t.colors.danger }]}>{attachError}</Text> : null}
        </View>

        {error ? <Text style={[t.typography.caption, { color: t.colors.danger }]}>{error}</Text> : null}

        <Button label="Ödevi oluştur" onPress={onSubmit} disabled={!canSubmit} loading={busy} />
      </View>
    </Screen>
  );
}
