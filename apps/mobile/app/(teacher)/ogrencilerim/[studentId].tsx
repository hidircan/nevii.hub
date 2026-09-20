import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { apiPatch, apiPost } from "../../../src/api/client";
import {
  AppHeader,
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorState,
  HomeworkCard,
  LoadingSkeleton,
  ProgressBar,
  Screen,
  SectionHeader,
  SelectField,
  StatusBadge,
  TextField,
} from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { useNow } from "../../../src/hooks/use-now";
import { useFocusRefetch } from "../../../src/hooks/use-focus-refetch";
import { isPast, relativeDayLabel } from "../../../src/lib/date";
import { useTheme } from "../../../src/theme/theme-context";
import type {
  AssessmentsResponse,
  CurriculumResponse,
  CurriculumTopic,
  CurriculumTopicStatus,
  HomeworkResponse,
  ScheduleResponse,
  StudentProfile,
  StudentScoreResponse,
} from "../../../src/types/api";

function scoreTone(score: number): "success" | "info" | "warning" {
  if (score >= 80) return "success";
  if (score >= 55) return "info";
  return "warning";
}

const SCORE_COMPONENT_LABELS = {
  attendance: "Devam durumu",
  homework: "Ödev tamamlama",
  curriculum: "Müfredat ilerlemesi",
  teacherAssessment: "Öğretmen değerlendirmesi",
} as const;

const STATUS_LABEL: Record<CurriculumTopicStatus, string> = {
  planned: "Planlandı",
  in_progress: "Çalışılıyor",
  mastered: "Pekişti",
  deferred: "Ertelendi",
};
const STATUS_TONE: Record<CurriculumTopicStatus, "neutral" | "info" | "success" | "warning"> = {
  planned: "neutral",
  in_progress: "info",
  mastered: "success",
  deferred: "warning",
};
const STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as CurriculumTopicStatus[]).map((v) => ({
  label: STATUS_LABEL[v],
  value: v,
}));

export default function StudentDetailScreen() {
  const t = useTheme();
  const router = useRouter();
  const now = useNow();
  const { studentId } = useLocalSearchParams<{ studentId: string }>();

  const profile = useApiGet<StudentProfile>(`/api/v1/students/${studentId}`);
  const curriculum = useApiGet<CurriculumResponse>(`/api/v1/students/${studentId}/curriculum`);
  const homework = useApiGet<HomeworkResponse>(`/api/v1/students/${studentId}/homework`);
  const schedule = useApiGet<ScheduleResponse>(`/api/v1/students/${studentId}/schedule`);
  const assessments = useApiGet<AssessmentsResponse>(`/api/v1/assessments/${studentId}`);
  const score = useApiGet<StudentScoreResponse>(`/api/v1/students/${studentId}/score`);

  // Bir alt ekranda (değerlendirme formu vb.) yapılan bir değişiklikten sonra
  // bu ekrana geri dönüldüğünde tüm bölümler otomatik tazelenir — "geçmişe
  // eklenen kayıt ekrandan çıkıp tekrar girmeden görünmüyor" hatasının kök
  // neden düzeltmesi (bkz. useFocusRefetch).
  useFocusRefetch(() => {
    assessments.refresh();
    curriculum.refresh();
    homework.refresh();
    schedule.refresh();
    score.refresh();
  });

  const [addingTopic, setAddingTopic] = useState(false);
  const [topicTitle, setTopicTitle] = useState("");
  const [topicDescription, setTopicDescription] = useState("");
  const [topicStatus, setTopicStatus] = useState<CurriculumTopicStatus>("planned");
  const [topicProgress, setTopicProgress] = useState("");
  const [topicNotes, setTopicNotes] = useState("");
  const [topicBusy, setTopicBusy] = useState(false);
  const [topicError, setTopicError] = useState<string | null>(null);

  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState<CurriculumTopicStatus>("planned");
  const [editProgress, setEditProgress] = useState("");
  const [editChangeNote, setEditChangeNote] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  async function onAddTopic() {
    setTopicBusy(true);
    setTopicError(null);
    const body: Record<string, unknown> = { studentId, title: topicTitle.trim(), status: topicStatus };
    if (topicDescription.trim()) body.description = topicDescription.trim();
    if (topicNotes.trim()) body.notes = topicNotes.trim();
    if (topicProgress.trim() !== "") body.progressPercent = Number(topicProgress);
    const res = await apiPost("/api/v1/curriculum", body);
    setTopicBusy(false);
    if (!res.ok) {
      setTopicError(res.error.message || "Konu eklenemedi.");
      return;
    }
    setTopicTitle("");
    setTopicDescription("");
    setTopicNotes("");
    setTopicProgress("");
    setTopicStatus("planned");
    setAddingTopic(false);
    curriculum.refresh();
  }

  function startEditingTopic(topic: CurriculumTopic) {
    setEditingTopicId(topic.id);
    setEditStatus(topic.status);
    setEditProgress(String(topic.progressPercent));
    setEditChangeNote("");
    setEditError(null);
  }

  async function onUpdateTopic(topicId: string) {
    setEditBusy(true);
    setEditError(null);
    const res = await apiPatch(`/api/v1/curriculum/${topicId}`, {
      status: editStatus,
      progressPercent: Number(editProgress),
      changeNote: editChangeNote.trim() || undefined,
    });
    setEditBusy(false);
    if (!res.ok) {
      setEditError(res.error.message || "Güncellenemedi.");
      return;
    }
    setEditingTopicId(null);
    curriculum.refresh();
  }

  const pastLessons =
    schedule.status === "success"
      ? schedule.data.lessons.filter((l) => isPast(l.endAt, now)).slice(-3).reverse()
      : [];
  const mostRecentLesson = pastLessons[0];

  if (profile.status === "loading") {
    return (
      <Screen>
        <AppHeader title="Öğrenci" showBack showNotifications={false} />
        <LoadingSkeleton rows={4} />
      </Screen>
    );
  }
  if (profile.status === "error") {
    return (
      <Screen>
        <AppHeader title="Öğrenci" showBack showNotifications={false} />
        <ErrorState message={profile.message} onRetry={profile.refresh} />
      </Screen>
    );
  }

  const student = profile.data;

  return (
    <Screen>
      <AppHeader title={student.name} showBack showNotifications={false} />

      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Avatar name={student.name} size={48} photoPath={student.photoPath} />
          <View style={{ flex: 1 }}>
            <Text style={[t.typography.cardTitle, { color: t.colors.text }]}>{student.name}</Text>
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
              {[student.studentType, student.instruments.join(", ")].filter(Boolean).join(" · ")} · Haftada{" "}
              {student.weeklyLessonCount} ders
            </Text>
          </View>
        </View>
      </Card>

      <SectionHeader title="Genel gelişim skoru" />
      {score.status === "loading" ? (
        <LoadingSkeleton rows={2} />
      ) : score.status === "error" ? (
        <ErrorState message={score.message} onRetry={score.refresh} />
      ) : (
        <Card>
          {score.data.score === null ? (
            <Text style={[t.typography.body, { color: t.colors.textMuted }]}>
              Henüz yeterli veri yok — yoklama, ödev, müfredat veya değerlendirme kaydı arttıkça hesaplanacak.
            </Text>
          ) : (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>Genel skor</Text>
                <StatusBadge label={String(score.data.score)} tone={scoreTone(score.data.score)} />
              </View>
              <View style={{ gap: 10 }}>
                {(Object.keys(SCORE_COMPONENT_LABELS) as (keyof typeof SCORE_COMPONENT_LABELS)[]).map((key) => {
                  const c = score.data.components[key];
                  return (
                    <View key={key}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                        <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{SCORE_COMPONENT_LABELS[key]}</Text>
                        <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>
                          {c.hasData ? `%${Math.round(c.normalizedValue ?? 0)}` : "Veri yok"}
                        </Text>
                      </View>
                      <ProgressBar progress={c.hasData ? (c.normalizedValue ?? 0) : 0} height={6} tone={c.hasData ? "info" : "warning"} />
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </Card>
      )}

      <SectionHeader title="Müfredat ilerlemesi" />
      {curriculum.status === "loading" ? (
        <LoadingSkeleton rows={2} />
      ) : curriculum.status === "error" ? (
        <ErrorState message={curriculum.message} onRetry={curriculum.refresh} />
      ) : (
        <>
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
              <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>Genel ilerleme</Text>
              <Text style={[t.typography.bodyStrong, { color: t.colors.primary }]}>%{Math.round(curriculum.data.overallPercent)}</Text>
            </View>
            <ProgressBar progress={curriculum.data.overallPercent} />
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 8 }]}>
              {curriculum.data.topics.filter((tp) => tp.status === "mastered").length} / {curriculum.data.topics.length} konu pekişti
            </Text>

            {addingTopic ? (
              <View style={{ marginTop: 14, gap: 10 }}>
                <TextField label="Konu başlığı" value={topicTitle} onChangeText={setTopicTitle} placeholder="Ör. Do majör gam" />
                <TextField
                  label="Açıklama (isteğe bağlı)"
                  value={topicDescription}
                  onChangeText={setTopicDescription}
                  placeholder="Konu hakkında kısa açıklama"
                  multiline
                  numberOfLines={2}
                />
                <SelectField label="Durum" value={topicStatus} options={STATUS_OPTIONS} onChange={(v) => setTopicStatus(v as CurriculumTopicStatus)} />
                <TextField
                  label="İlerleme % (isteğe bağlı)"
                  value={topicProgress}
                  onChangeText={setTopicProgress}
                  placeholder="Duruma göre"
                  keyboardType="number-pad"
                />
                <TextField label="Not (isteğe bağlı)" value={topicNotes} onChangeText={setTopicNotes} placeholder="Ör. Metronom 80 bpm'de çalışılıyor" />
                {topicError ? <Text style={[t.typography.caption, { color: t.colors.danger }]}>{topicError}</Text> : null}
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Button label="Vazgeç" variant="secondary" size="sm" onPress={() => setAddingTopic(false)} style={{ flex: 1 }} />
                  <Button label="Ekle" size="sm" onPress={onAddTopic} disabled={!topicTitle.trim() || topicBusy} loading={topicBusy} style={{ flex: 1 }} />
                </View>
              </View>
            ) : (
              <Button label="Konu ekle" variant="secondary" size="sm" icon="add" onPress={() => setAddingTopic(true)} style={{ marginTop: 14 }} fullWidth={false} />
            )}
          </Card>

          {curriculum.data.topics.length === 0 ? (
            <EmptyState icon="list-outline" title="Henüz konu tanımlanmadı" description="Yukarıdan bu öğrenci için müfredat konusu ekleyebilirsiniz." />
          ) : (
            <View style={{ gap: 8, marginTop: 8 }}>
              {curriculum.data.topics.map((topic) => (
                <Card key={topic.id}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>{topic.title}</Text>
                      {topic.description ? (
                        <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>{topic.description}</Text>
                      ) : null}
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <StatusBadge label={STATUS_LABEL[topic.status]} tone={STATUS_TONE[topic.status]} />
                      <Text style={[t.typography.caption, { color: t.colors.primary, fontFamily: t.fonts.serifBold, fontWeight: "700" }]}>%{topic.progressPercent}</Text>
                    </View>
                  </View>
                  <View style={{ marginTop: 10 }}>
                    <ProgressBar progress={topic.progressPercent} height={6} tone="info" />
                  </View>
                  {topic.notes ? (
                    <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 8 }]}>Not: {topic.notes}</Text>
                  ) : null}

                  {editingTopicId === topic.id ? (
                    <View style={{ marginTop: 12, gap: 10, borderTopWidth: 1, borderTopColor: t.colors.divider, paddingTop: 12 }}>
                      <SelectField label="Durum" value={editStatus} options={STATUS_OPTIONS} onChange={(v) => setEditStatus(v as CurriculumTopicStatus)} />
                      <TextField label="İlerleme %" value={editProgress} onChangeText={setEditProgress} keyboardType="number-pad" />
                      <TextField label="Değişiklik notu (isteğe bağlı)" value={editChangeNote} onChangeText={setEditChangeNote} placeholder="Ör. Bu hafta tempo arttı" />
                      {editError ? <Text style={[t.typography.caption, { color: t.colors.danger }]}>{editError}</Text> : null}
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <Button label="Vazgeç" variant="secondary" size="sm" onPress={() => setEditingTopicId(null)} style={{ flex: 1 }} />
                        <Button label="Kaydet" size="sm" onPress={() => onUpdateTopic(topic.id)} loading={editBusy} style={{ flex: 1 }} />
                      </View>
                    </View>
                  ) : (
                    <Button
                      label="Durumu güncelle"
                      variant="secondary"
                      size="sm"
                      icon="create-outline"
                      onPress={() => startEditingTopic(topic)}
                      style={{ marginTop: 12 }}
                      fullWidth={false}
                    />
                  )}
                </Card>
              ))}
            </View>
          )}
        </>
      )}

      <SectionHeader title="Önceki ders notları" />
      {schedule.status === "loading" ? (
        <LoadingSkeleton rows={2} />
      ) : pastLessons.length === 0 ? (
        <EmptyState icon="time-outline" title="Henüz geçmiş ders yok" />
      ) : (
        <View style={{ gap: 8 }}>
          {pastLessons.map((l) => (
            <Card key={l.id}>
              <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>{relativeDayLabel(new Date(l.startAt))}</Text>
              <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>{l.status}</Text>
            </Card>
          ))}
        </View>
      )}

      <SectionHeader title="Ödev geçmişi" />
      {homework.status === "loading" ? (
        <LoadingSkeleton rows={2} />
      ) : homework.status === "error" ? (
        <ErrorState message={homework.message} onRetry={homework.refresh} />
      ) : homework.data.homework.length === 0 ? (
        <EmptyState icon="book-outline" title="Henüz ödev yok" />
      ) : (
        <View style={{ gap: 10 }}>
          {homework.data.homework.slice(0, 5).map((h) => (
            <HomeworkCard key={h.id} homework={h} showStudentName={false} />
          ))}
        </View>
      )}

      <SectionHeader title="Değerlendirme geçmişi" />
      {assessments.status === "loading" ? (
        <LoadingSkeleton rows={2} />
      ) : assessments.status === "error" ? (
        <ErrorState message={assessments.message} onRetry={assessments.refresh} />
      ) : assessments.data.assessments.length === 0 ? (
        <EmptyState icon="school-outline" title="Henüz değerlendirme yapılmadı" />
      ) : (
        <View style={{ gap: 10 }}>
          {[...assessments.data.assessments].reverse().slice(0, 5).map((a) => (
            <Card key={a.id}>
              <Text style={[t.typography.caption, { color: t.colors.textFaint, marginBottom: 6 }]}>
                {relativeDayLabel(new Date(a.createdAt))} · {a.teacherSignedName}
              </Text>
              <Text style={[t.typography.body, { color: t.colors.text }]}>{a.strengthNote}</Text>
              {a.improvementNote ? (
                <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 6 }]}>
                  Gelişim alanı: {a.improvementNote}
                </Text>
              ) : null}
              <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]}>
                Sonraki adımlar: {a.nextStepsNote}
              </Text>
            </Card>
          ))}
        </View>
      )}

      <Button
        label={mostRecentLesson ? "Son dersi değerlendir" : "Değerlendirme için önce ders gerekli"}
        icon="school-outline"
        disabled={!mostRecentLesson}
        onPress={() =>
          mostRecentLesson &&
          router.push(`/assessment/${mostRecentLesson.id}?studentId=${student.id}&studentName=${encodeURIComponent(student.name)}`)
        }
        style={{ marginTop: 12 }}
      />
    </Screen>
  );
}
