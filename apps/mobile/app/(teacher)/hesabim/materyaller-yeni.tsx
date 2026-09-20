import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { apiPost } from "../../../src/api/client";
import { AppHeader, Button, Card, Icon, Screen, TextField } from "../../../src/components/ui";
import { ALLOWED_ATTACHMENT_MIME_TYPES, validateAttachment } from "../../../src/lib/attachment-validation";
import { useTheme } from "../../../src/theme/theme-context";

type Attachment = { fileName: string; fileMimeType: string; fileData: string; sizeBytes: number };

export default function YeniMateryal() {
  const t = useTheme();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = title.trim().length > 0 && description.trim().length > 0 && !busy && !attaching;

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
    const res = await apiPost("/api/v1/teaching-materials", {
      title: title.trim(),
      description: description.trim(),
      ...(attachment
        ? { fileName: attachment.fileName, fileMimeType: attachment.fileMimeType, fileData: attachment.fileData }
        : {}),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message || "Materyal paylaşılamadı.");
      return;
    }
    router.back();
  }

  return (
    <Screen>
      <AppHeader title="Yeni materyal" showBack showNotifications={false} />
      <View style={{ gap: 16 }}>
        <TextField label="Başlık" value={title} onChangeText={setTitle} placeholder="Ör. Gam alıştırmaları PDF'i" />
        <TextField label="Açıklama" value={description} onChangeText={setDescription} placeholder="Materyal hakkında kısa açıklama" multiline numberOfLines={4} />

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

        <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>
          Bu materyal, hedef enstrüman/seviye belirtilmediği için tüm öğrencilerinize görünür olacak.
        </Text>
        {error ? <Text style={[t.typography.caption, { color: t.colors.danger }]}>{error}</Text> : null}
        <Button label="Paylaş" onPress={onSubmit} disabled={!canSubmit} loading={busy} />
      </View>
    </Screen>
  );
}
