import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { apiPost } from "../../src/api/client";
import { useAuth } from "../../src/auth/auth-context";
import { AppHeader, Button, Card, Screen, ScoreSelector, SectionHeader, StatusBadge, TextField, AppText } from "../../src/components/ui";
import { useApiGet } from "../../src/hooks/use-api";
import { useLocale } from "../../src/i18n/locale-context";
import { relativeDayLabel } from "../../src/lib/date";
import { useTheme } from "../../src/theme/theme-context";
import type {
  AssessmentScoresPayload,
  PendingPeriodicAssessmentsResponse,
  TeachersResponse,
} from "../../src/types/api";

const CRITERIA: Array<{ key: keyof AssessmentScoresPayload; labelKey: string }> = [
  { key: "teknikBecerisi", labelKey: "assess.critTechnique" },
  { key: "notaOkuma", labelKey: "assess.critSightReading" },
  { key: "muzikalite", labelKey: "assess.critMusicality" },
  { key: "ritimDuyusu", labelKey: "assess.critRhythm" },
  { key: "calismaDuzeni", labelKey: "assess.critStudyHabit" },
  { key: "evOdeviTamamlama", labelKey: "assess.critHomework" },
  { key: "dersKatilimi", labelKey: "assess.critParticipation" },
  { key: "motivasyon", labelKey: "assess.critMotivation" },
  { key: "genelIlerleme", labelKey: "assess.critProgress" },
  { key: "hedefeUlasma", labelKey: "assess.critGoal" },
];

const DEFAULT_SCORES: AssessmentScoresPayload = {
  teknikBecerisi: 3,
  notaOkuma: 3,
  muzikalite: 3,
  ritimDuyusu: 3,
  calismaDuzeni: 3,
  evOdeviTamamlama: 3,
  dersKatilimi: 3,
  motivasyon: 3,
  genelIlerleme: 3,
  hedefeUlasma: 3,
};

function computeAverage(scores: Record<string, number | null>): number {
  const vals = CRITERIA.map((c) => scores[c.key] ?? 3);
  const sum = vals.reduce((a, b) => a + b, 0);
  return Math.round((sum / vals.length) * 10) / 10;
}

/**
 * Ders sonrası gelişim değerlendirmesi ve 4 haftalık (4 derslik) otomatik özet/onay ekranı.
 * Web (`/gelisim`) ile aynı API sözleşmesini, varsayılan puanları ve pedagojik placeholder rehberliğini paylaşır.
 */
export default function AssessmentScreen() {
  const t = useTheme();
  const { t: tr } = useLocale();
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    lessonId: string;
    studentId?: string;
    studentName?: string;
    periodStart?: string;
    periodEnd?: string;
  }>();
  const isPeriodic = params.lessonId === "periodic";

  // Ad yalnız ders raporu imzası için; 4 haftalık raporda "Hazırlayan" adı sunucuda öğretmen kaydından yazılır.
  const teachers = useApiGet<TeachersResponse>("/api/v1/teachers", { enabled: !isPeriodic });
  const pendingPeriodic = useApiGet<PendingPeriodicAssessmentsResponse>(
    `/api/v1/periodic-assessments/pending?studentId=${encodeURIComponent(params.studentId ?? "")}`,
    { enabled: isPeriodic && Boolean(params.studentId) }
  );

  // Varsayılan 3/5 puan ile başlar — öğretmen yalnız farklılaşan kriterlere dokunur.
  const [scores, setScores] = useState<Record<string, number | null>>({ ...DEFAULT_SCORES });
  const [showCriteriaEditor, setShowCriteriaEditor] = useState(!isPeriodic);

  // Tekil ders raporu alanları
  const [piecesWorked, setPiecesWorked] = useState("");
  const [etudesWorked, setEtudesWorked] = useState("");
  const [technicalWork, setTechnicalWork] = useState("");
  const [theoryWork, setTheoryWork] = useState("");
  const [strengthNote, setStrengthNote] = useState("");
  const [improvementNote, setImprovementNote] = useState("");
  const [nextStepsNote, setNextStepsNote] = useState("");

  // 4 haftalık / 4 derslik dönem raporu alanları
  const [overallProgressNote, setOverallProgressNote] = useState("");
  const [periodicStrengthsNote, setPeriodicStrengthsNote] = useState("");
  const [areasForImprovementNote, setAreasForImprovementNote] = useState("");
  const [recommendationNote, setRecommendationNote] = useState("");
  const [draftHydrated, setDraftHydrated] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const teacherName =
    teachers.status === "success" ? teachers.data.teachers.find((tt) => tt.id === user?.teacherId)?.name ?? "" : "";

  const matchedPending =
    isPeriodic && pendingPeriodic.status === "success"
      ? pendingPeriodic.data.items.find(
          (it) =>
            it.studentId === params.studentId &&
            (!params.periodStart || it.periodStart === params.periodStart)
        ) ?? pendingPeriodic.data.items[0]
      : undefined;
  const draft = matchedPending?.draft;

  useEffect(() => {
    if (isPeriodic && draft && !draftHydrated) {
      setScores({ ...draft.suggestedScores });
      setOverallProgressNote((prev) => prev || draft.synthesizedNotes.overallProgressNote);
      setRecommendationNote((prev) => prev || draft.synthesizedNotes.recommendationNote);
      setDraftHydrated(true);
    }
  }, [isPeriodic, draft, draftHydrated]);

  const allScored = CRITERIA.every((c) => scores[c.key] !== null);
  const canSubmitLesson =
    allScored && strengthNote.trim() && improvementNote.trim() && nextStepsNote.trim() && !busy;
  // Web formuyla aynı kural: yalnız genel değerlendirme zorunlu.
  const canSubmitPeriodic = allScored && overallProgressNote.trim() && !busy;

  async function onSubmitLesson() {
    setBusy(true);
    setError(null);
    const res = await apiPost("/api/v1/assessments", {
      lessonId: params.lessonId,
      studentId: params.studentId,
      ...scores,
      piecesWorked: piecesWorked.trim() || undefined,
      etudesWorked: etudesWorked.trim() || undefined,
      technicalWork: technicalWork.trim() || undefined,
      theoryWork: theoryWork.trim() || undefined,
      strengthNote: strengthNote.trim(),
      improvementNote: improvementNote.trim(),
      nextStepsNote: nextStepsNote.trim(),
      teacherSignedName: teacherName || user?.email || tr("assess.teacherFallback"),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message || tr("assess.saveFailed"));
      return;
    }
    setDone(true);
  }

  async function onSubmitPeriodic() {
    // Ekranda gösterilen özetin dönemi gönderilir (bağlantıdaki tarih eskimiş olabilir).
    const periodStart = matchedPending?.periodStart || params.periodStart;
    const periodEnd = matchedPending?.periodEnd || params.periodEnd;
    if (!params.studentId || !periodStart || !periodEnd) {
      setError(tr("assess.saveFailed"));
      return;
    }
    setBusy(true);
    setError(null);
    const res = await apiPost("/api/v1/periodic-assessments", {
      studentId: params.studentId,
      periodStart,
      periodEnd,
      overallProgressNote: overallProgressNote.trim(),
      strengthsNote: periodicStrengthsNote.trim() || undefined,
      areasForImprovementNote: areasForImprovementNote.trim() || undefined,
      recommendationNote: recommendationNote.trim() || undefined,
      scores,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message || tr("assess.saveFailed"));
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <Screen>
        <AppHeader title={isPeriodic ? tr("assess.periodicTitle") : tr("assess.title")} showBack showNotifications={false} />
        <View style={styles.doneBox}>
          <AppText style={[t.typography.sectionTitle, { color: t.colors.success }]}>{tr("assess.saved")}</AppText>
          <AppText style={[t.typography.body, { color: t.colors.textMuted, marginTop: 6, textAlign: "center" }]}>
            {isPeriodic ? tr("assess.periodicSavedBody") : tr("assess.savedBody")}
          </AppText>
          <Button label={tr("eval.close")} onPress={() => router.back()} variant="secondary" style={{ marginTop: 16 }} fullWidth={false} />
        </View>
      </Screen>
    );
  }

  if (isPeriodic) {
    const avgScore = computeAverage(scores);
    return (
      <Screen>
        <AppHeader
          title={tr("assess.periodicTitle")}
          subtitle={params.studentName || matchedPending?.studentName || tr("assess.periodicSubtitle")}
          showBack
          showNotifications={false}
        />

        <View style={{ gap: 16 }}>
          {/* 1. Önceki 4 Dersin Otomatik Özeti */}
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>{tr("assess.periodicSummaryTitle")}</Text>
              <StatusBadge label={tr("assess.periodicAvgScore", { v: avgScore.toFixed(1) })} tone="info" />
            </View>
            <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>
              {tr("assess.periodicSummaryBody", { n: draft?.lessonCount ?? 4 })}
            </Text>

            {draft && draft.lessonSummaries.length > 0 ? (
              <View style={{ gap: 8, marginTop: 10 }}>
                {draft.lessonSummaries.map((ls, idx) => (
                  <View
                    key={ls.lessonId}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: t.colors.divider,
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={[t.typography.caption, { color: t.colors.text, fontWeight: "700" }]}>
                        {idx + 1}. Ders · {relativeDayLabel(new Date(ls.startAt))}
                      </Text>
                      {ls.overallScore !== undefined ? (
                        <Text style={[t.typography.caption, { color: t.colors.primary, fontWeight: "700" }]}>
                          {ls.overallScore.toFixed(1)} / 5
                        </Text>
                      ) : null}
                    </View>
                    {ls.piecesWorked || ls.technicalWork || ls.strengthNote ? (
                      <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]}>
                        {[ls.piecesWorked, ls.technicalWork, ls.strengthNote].filter(Boolean).join(" · ")}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}

            <Button
              label={showCriteriaEditor ? tr("assess.periodicHideScores") : tr("assess.periodicEditScores")}
              variant="secondary"
              size="sm"
              onPress={() => setShowCriteriaEditor((v) => !v)}
              style={{ marginTop: 12 }}
              fullWidth={false}
            />
          </Card>

          {showCriteriaEditor ? (
            <Card>
              <View style={{ gap: 14 }}>
                {CRITERIA.map((c) => (
                  <ScoreSelector
                    key={c.key}
                    label={tr(c.labelKey)}
                    value={scores[c.key] ?? 3}
                    onChange={(v) => setScores((s) => ({ ...s, [c.key]: v }))}
                  />
                ))}
              </View>
            </Card>
          ) : null}

          {/* 3. Kontrol ve Değerlendirme */}
          <Card>
            <View style={{ gap: 14 }}>
              <TextField
                label={tr("assess.periodicOverallLabel")}
                placeholder={tr("assess.periodicOverallPh")}
                value={overallProgressNote}
                onChangeText={setOverallProgressNote}
                multiline
                numberOfLines={3}
              />
              <TextField
                label={tr("assess.periodicStrengthsLabel")}
                placeholder={tr("assess.periodicStrengthsPh")}
                value={periodicStrengthsNote}
                onChangeText={setPeriodicStrengthsNote}
                multiline
                numberOfLines={3}
              />
              <TextField
                label={tr("assess.periodicImproveLabel")}
                placeholder={tr("assess.periodicImprovePh")}
                value={areasForImprovementNote}
                onChangeText={setAreasForImprovementNote}
                multiline
                numberOfLines={3}
              />
              <TextField
                label={tr("assess.periodicRecommendLabel")}
                placeholder={tr("assess.periodicRecommendPh")}
                value={recommendationNote}
                onChangeText={setRecommendationNote}
                multiline
                numberOfLines={3}
              />
            </View>
          </Card>

          {/* 4. Onay */}
          <Card>
            <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>{tr("assess.periodicConfirmTitle")}</Text>
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 4 }]}>
              {tr("assess.periodicConfirmHint")}
            </Text>
            {error ? <Text style={[t.typography.caption, { color: t.colors.danger, marginTop: 8 }]}>{error}</Text> : null}
            <Button
              label={tr("assess.periodicApproveBtn")}
              onPress={onSubmitPeriodic}
              disabled={!canSubmitPeriodic}
              loading={busy}
              style={{ marginTop: 12 }}
            />
          </Card>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppHeader title={tr("assess.formTitle")} subtitle={params.studentName} showBack showNotifications={false} />

      <View style={{ gap: 20 }}>
        <Card>
          <SectionHeader title={tr("assess.topicsTitle")} />
          <View style={{ gap: 12 }}>
            <TextField
              label={tr("assess.piecesLabel")}
              placeholder={tr("assess.piecesPh")}
              value={piecesWorked}
              onChangeText={setPiecesWorked}
            />
            <TextField
              label={tr("assess.etudesLabel")}
              placeholder={tr("assess.etudesPh")}
              value={etudesWorked}
              onChangeText={setEtudesWorked}
            />
            <TextField
              label={tr("assess.technicalLabel")}
              placeholder={tr("assess.technicalPh")}
              value={technicalWork}
              onChangeText={setTechnicalWork}
            />
            <TextField
              label={tr("assess.theoryLabel")}
              placeholder={tr("assess.theoryPh")}
              value={theoryWork}
              onChangeText={setTheoryWork}
            />
          </View>
        </Card>

        {CRITERIA.map((c) => (
          <ScoreSelector
            key={c.key}
            label={tr(c.labelKey)}
            value={scores[c.key] ?? null}
            onChange={(v) => setScores((s) => ({ ...s, [c.key]: v }))}
          />
        ))}

        <TextField
          label={tr("assess.strengths")}
          placeholder={tr("assess.strengthsPh")}
          value={strengthNote}
          onChangeText={setStrengthNote}
          multiline
          numberOfLines={3}
        />
        <TextField
          label={tr("assess.improvements")}
          placeholder={tr("assess.improvementsPh")}
          value={improvementNote}
          onChangeText={setImprovementNote}
          multiline
          numberOfLines={3}
        />
        <TextField
          label={tr("assess.nextSteps")}
          placeholder={tr("assess.nextStepsPh")}
          value={nextStepsNote}
          onChangeText={setNextStepsNote}
          multiline
          numberOfLines={3}
        />

        {error ? <AppText style={[t.typography.caption, { color: t.colors.danger }]}>{error}</AppText> : null}

        <Button label={tr("assess.save")} onPress={onSubmitLesson} disabled={!canSubmitLesson} loading={busy} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  doneBox: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
});
