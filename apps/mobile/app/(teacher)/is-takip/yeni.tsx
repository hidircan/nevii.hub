import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { apiPost } from "../../../src/api/client";
import { useAuth } from "../../../src/auth/auth-context";
import { AppHeader, Button, DueDateField, Icon, Screen, SelectField, TextField } from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { useTheme } from "../../../src/theme/theme-context";
import type { TeacherStudentsResponse } from "../../../src/types/api";

const CATEGORIES = ["Eğitim", "Veli İletişimi", "Program", "Evrak", "Teknik"];
const PRIORITIES = [
  { label: "Düşük", value: "LOW" },
  { label: "Orta", value: "MEDIUM" },
  { label: "Yüksek", value: "HIGH" },
  { label: "Acil", value: "URGENT" },
];

function toDateOnly(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function YeniGorev() {
  const t = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const studentsRes = useApiGet<TeacherStudentsResponse>(user?.teacherId ? `/api/v1/teachers/${user.teacherId}/students` : "");

  const [isPersonal, setIsPersonal] = useState(false);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [priority, setPriority] = useState<string | null>("MEDIUM");
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const studentOptions =
    studentsRes.status === "success" ? studentsRes.data.students.map((s) => ({ label: s.name, value: s.id })) : [];

  const canSubmit = (isPersonal || !!studentId) && title.trim().length > 0 && !!category && !busy;

  async function onSubmit() {
    setBusy(true);
    setError(null);
    const res = await apiPost<{ taskId: string }>("/api/v1/tasks", {
      title: title.trim(),
      description: description.trim() || undefined,
      category,
      priority,
      dueDate: dueDate ? toDateOnly(dueDate) : undefined,
      // Kendine atanmazsa oluşturan öğretmen görevi bir daha kendi listesinde
      // GÖREMEZ — bkz. tools.ts isTaskOwnedByActor (createdById görüş yetkisi
      // vermez, yalnızca sorumlu/takipçi olmak verir).
      assigneeId: user?.userId,
      ...(isPersonal ? {} : { relatedEntityType: "student", relatedEntityId: studentId }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message || "Görev oluşturulamadı.");
      return;
    }
    router.back();
  }

  return (
    <Screen>
      <AppHeader title="Yeni görev" showBack showNotifications={false} />
      <View style={{ gap: 16 }}>
        <View style={{ gap: 6 }}>
          <Text style={[t.typography.label, { color: t.colors.textMuted }]}>Görev türü</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => setIsPersonal(false)}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                borderRadius: 12,
                borderWidth: 1,
                paddingVertical: 12,
                borderColor: !isPersonal ? t.colors.primary : t.colors.border,
                backgroundColor: !isPersonal ? t.colors.primary : t.colors.bgMuted,
              }}
            >
              <Icon name="person-outline" size={16} color={!isPersonal ? t.colors.primaryOn : t.colors.text} />
              <Text style={[t.typography.bodyStrong, { color: !isPersonal ? t.colors.primaryOn : t.colors.text }]}>Öğrenciyle ilgili</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setIsPersonal(true);
                setStudentId(null);
              }}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                borderRadius: 12,
                borderWidth: 1,
                paddingVertical: 12,
                borderColor: isPersonal ? t.colors.primary : t.colors.border,
                backgroundColor: isPersonal ? t.colors.primary : t.colors.bgMuted,
              }}
            >
              <Icon name="checkbox-outline" size={16} color={isPersonal ? t.colors.primaryOn : t.colors.text} />
              <Text style={[t.typography.bodyStrong, { color: isPersonal ? t.colors.primaryOn : t.colors.text }]}>Kişisel görev</Text>
            </Pressable>
          </View>
        </View>

        {!isPersonal ? (
          <SelectField
            label="Öğrenci"
            value={studentId}
            options={studentOptions}
            onChange={setStudentId}
            placeholder="İlişkili öğrenci seçin"
            searchable
            searchPlaceholder="Öğrenci ara"
          />
        ) : null}

        <TextField label="Başlık" value={title} onChangeText={setTitle} placeholder="Ör. Veliyi devamsızlık için ara" />
        <TextField label="Açıklama" value={description} onChangeText={setDescription} placeholder="Görev detayları (opsiyonel)" multiline numberOfLines={3} />
        <SelectField label="Kategori" value={category} options={CATEGORIES.map((c) => ({ label: c, value: c }))} onChange={setCategory} placeholder="Kategori seçin" />
        <SelectField label="Öncelik" value={priority} options={PRIORITIES} onChange={setPriority} placeholder="Öncelik seçin" />
        <DueDateField label="Son tarih (opsiyonel)" value={dueDate} onChange={setDueDate} minimumDate={new Date()} />
        {error ? <Text style={{ color: t.colors.danger }}>{error}</Text> : null}
        <Button label="Görevi oluştur" onPress={onSubmit} disabled={!canSubmit} loading={busy} />
      </View>
    </Screen>
  );
}
