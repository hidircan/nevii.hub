import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { apiPost } from "../../../src/api/client";
import {
  AppHeader,
  Avatar,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  Screen,
  SectionHeader,
  SelectField,
  StatusBadge,
  TextField,
} from "../../../src/components/ui";
import { useApiGet } from "../../../src/hooks/use-api";
import { format } from "../../../src/lib/date";
import { lessonStatusBadge } from "../../../src/lib/lesson-status";
import { useTheme } from "../../../src/theme/theme-context";
import type { BranchesResponse, LessonOpsResponse, LessonReassignResponse, LessonsResponse, RoomsResponse, TeachersResponse } from "../../../src/types/api";

const OPS_FLAG_LABEL: Record<string, string> = {
  attended: "Katıldı",
  absent: "Gelmedi",
  excused: "İzinli",
  processed: "İşlendi",
  makeup: "Telafi",
};

export default function AdminLessonDetail() {
  const t = useTheme();
  const { lessonId, from, to } = useLocalSearchParams<{ lessonId: string; from: string; to: string }>();
  const res = useApiGet<LessonsResponse>(from && to ? `/api/v1/lessons?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` : "");

  const [reassignOpen, setReassignOpen] = useState(false);
  const [newTeacherId, setNewTeacherId] = useState<string | null>(null);
  const [newBranchId, setNewBranchId] = useState<string | null>(null);
  const [newRoomId, setNewRoomId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [reassignedOk, setReassignedOk] = useState(false);
  const [opsBusy, setOpsBusy] = useState<string | null>(null);
  const [opsError, setOpsError] = useState<string | null>(null);
  const [pendingSwitch, setPendingSwitch] = useState<{ flag: string; from: string; reason?: string } | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [reasonPrompt, setReasonPrompt] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const teachers = useApiGet<TeachersResponse>(reassignOpen ? "/api/v1/teachers" : "");
  const branches = useApiGet<BranchesResponse>(reassignOpen ? "/api/v1/branches" : "");
  const rooms = useApiGet<RoomsResponse>(reassignOpen ? "/api/v1/rooms" : "");

  if (res.status === "loading") {
    return (
      <Screen>
        <AppHeader title="Ders" showBack showNotifications={false} />
        <LoadingSkeleton rows={3} />
      </Screen>
    );
  }
  if (res.status === "error") {
    return (
      <Screen>
        <AppHeader title="Ders" showBack showNotifications={false} />
        <ErrorState message={res.message} onRetry={res.refresh} />
      </Screen>
    );
  }

  const lesson = res.data.lessons.find((l) => l.id === lessonId);
  if (!lesson) {
    return (
      <Screen>
        <AppHeader title="Ders" showBack showNotifications={false} />
        <EmptyState icon="alert-circle-outline" title="Ders bulunamadı" />
      </Screen>
    );
  }

  const badge = lessonStatusBadge(lesson);

  const eligibleTeachers =
    teachers.status === "success"
      ? teachers.data.teachers.filter((tc) => !lesson.instrument || tc.instruments.includes(lesson.instrument!))
      : [];
  const branchOptions = branches.status === "success" ? branches.data.branches : [];
  const roomsInBranch =
    rooms.status === "success" && newBranchId
      ? rooms.data.rooms.filter((r) => r.branchId === newBranchId && r.active && (!lesson.instrument || r.instruments.includes(lesson.instrument!)))
      : [];

  const teacherChanged = !!newTeacherId;
  const branchChanged = !!newBranchId;
  const canSubmit = (teacherChanged || branchChanged) && (!branchChanged || !!newRoomId) && !submitting;

  const selectedTeacherName = eligibleTeachers.find((tc) => tc.id === newTeacherId)?.name;
  const selectedBranchName = branchOptions.find((b) => b.id === newBranchId)?.name;
  const selectedRoomName = roomsInBranch.find((r) => r.id === newRoomId)?.name;

  async function markOps(flag: string, confirmSwitch = false, reasonText?: string) {
    setOpsBusy(flag);
    setOpsError(null);
    const result = await apiPost<LessonOpsResponse>(`/api/v1/lessons/${lessonId}/ops`, {
      flag,
      confirmSwitch,
      ...(reasonText !== undefined ? { reason: reasonText } : {}),
    });
    setOpsBusy(null);
    if (!result.ok) {
      setOpsError(result.error.message || "Yoklama kaydedilemedi.");
      return;
    }
    if (result.data.needsConfirmation) {
      setPendingSwitch({ flag, from: result.data.currentStatus ?? "?", reason: reasonText });
      return;
    }
    res.refresh();
  }

  async function cancelLesson() {
    setConfirmingCancel(false);
    setOpsBusy("cancel");
    setOpsError(null);
    const result = await apiPost(`/api/v1/lessons/${lessonId}/cancel`, {});
    setOpsBusy(null);
    if (!result.ok) {
      setOpsError(result.error.message || "Ders iptal edilemedi.");
      return;
    }
    res.refresh();
  }

  async function submitReassign() {
    setConfirming(false);
    setSubmitting(true);
    setReassignError(null);
    const result = await apiPost<LessonReassignResponse>(`/api/v1/lessons/${lessonId}/reassign`, {
      scope: "single",
      newTeacherId: newTeacherId ?? undefined,
      newBranchId: newBranchId ?? undefined,
      newRoomId: newBranchId ? newRoomId ?? undefined : undefined,
    });
    setSubmitting(false);
    if (!result.ok) {
      setReassignError(result.error.message || "Değişiklik uygulanamadı.");
      return;
    }
    setReassignedOk(true);
    setReassignOpen(false);
    res.refresh();
  }

  return (
    <Screen>
      <AppHeader title="Ders detayı" showBack showNotifications={false} />

      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <Avatar name={lesson.studentName ?? "?"} size={44} />
          <View style={{ flex: 1 }}>
            <Text style={[t.typography.cardTitle, { color: t.colors.text }]}>{lesson.studentName ?? "Öğrenci"}</Text>
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>Öğrenci</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Avatar name={lesson.teacherName ?? "?"} size={44} />
          <View style={{ flex: 1 }}>
            <Text style={[t.typography.cardTitle, { color: t.colors.text }]}>{lesson.teacherName ?? "Öğretmen"}</Text>
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>Öğretmen</Text>
          </View>
        </View>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={[t.typography.body, { color: t.colors.text }]}>
            {format(new Date(lesson.startAt), "HH:mm")}–{format(new Date(lesson.endAt), "HH:mm")}
          </Text>
          <StatusBadge label={badge.label} tone={badge.tone} />
        </View>
        <View style={{ gap: 6, marginTop: 10 }}>
          {lesson.instrument ? <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>Enstrüman: {lesson.instrument}</Text> : null}
          {lesson.roomName ? <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>Oda: {lesson.roomName}</Text> : null}
        </View>
      </Card>

      <SectionHeader title="Yoklama" />
      {opsError ? (
        <Card style={{ marginBottom: 10, borderColor: t.colors.danger }}>
          <Text style={[t.typography.body, { color: t.colors.danger }]}>{opsError}</Text>
        </Card>
      ) : null}
      {lesson.status === "cancelled" ? (
        <EmptyState icon="ban-outline" title="Bu ders iptal edilmiş" />
      ) : (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button label="Katıldı" size="sm" loading={opsBusy === "attended"} onPress={() => markOps("attended")} style={{ flex: 1 }} />
            <Button label="Gelmedi" size="sm" variant="danger" loading={opsBusy === "absent"} onPress={() => markOps("absent")} style={{ flex: 1 }} />
            <Button label="İzinli" size="sm" variant="secondary" loading={opsBusy === "excused"} onPress={() => markOps("excused")} style={{ flex: 1 }} />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button label="Telafi" size="sm" variant="secondary" loading={opsBusy === "makeup"} onPress={() => { setReason(""); setReasonPrompt("makeup"); }} style={{ flex: 1 }} />
            <Button label="İşlendi" size="sm" variant="secondary" loading={opsBusy === "processed"} onPress={() => { setReason(""); setReasonPrompt("processed"); }} style={{ flex: 1 }} />
            <Button label="İptal et" size="sm" variant="danger" loading={opsBusy === "cancel"} onPress={() => setConfirmingCancel(true)} style={{ flex: 1 }} />
          </View>
          {reasonPrompt ? (
            <Card>
              <TextField
                label={`"${OPS_FLAG_LABEL[reasonPrompt] ?? reasonPrompt}" gerekçesi (zorunlu)`}
                value={reason}
                onChangeText={setReason}
                placeholder="Kısa gerekçe yazın"
              />
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <Button label="Vazgeç" variant="secondary" style={{ flex: 1 }} onPress={() => setReasonPrompt(null)} />
                <Button
                  label="Uygula"
                  style={{ flex: 1 }}
                  disabled={reason.trim().length === 0}
                  loading={opsBusy === reasonPrompt}
                  onPress={() => {
                    const flag = reasonPrompt;
                    setReasonPrompt(null);
                    void markOps(flag, false, reason.trim());
                  }}
                />
              </View>
            </Card>
          ) : null}
        </View>
      )}

      <SectionHeader title="Öğretmen / Şube değiştir" />
      {reassignedOk ? (
        <Card style={{ borderColor: t.colors.success, backgroundColor: t.colors.successSoft }}>
          <Text style={[t.typography.body, { color: t.colors.success }]}>Değişiklik uygulandı.</Text>
        </Card>
      ) : null}
      {!reassignOpen ? (
        <Button label="Öğretmen/Şube değiştir" variant="secondary" onPress={() => setReassignOpen(true)} />
      ) : (
        <Card>
          <SelectField
            label="Yeni öğretmen"
            value={newTeacherId}
            placeholder="Değiştirme"
            options={eligibleTeachers.map((tc) => ({ label: tc.name, value: tc.id }))}
            onChange={setNewTeacherId}
          />
          <View style={{ height: 12 }} />
          <SelectField
            label="Yeni şube"
            value={newBranchId}
            placeholder="Değiştirme"
            options={branchOptions.map((b) => ({ label: b.name, value: b.id }))}
            onChange={(v) => {
              setNewBranchId(v);
              setNewRoomId(null);
            }}
          />
          {newBranchId ? (
            <>
              <View style={{ height: 12 }} />
              <SelectField
                label="Yeni oda"
                value={newRoomId}
                placeholder={roomsInBranch.length === 0 ? "Bu şubede uygun oda yok" : "Seçin"}
                options={roomsInBranch.map((r) => ({ label: r.name, value: r.id }))}
                onChange={setNewRoomId}
              />
            </>
          ) : null}

          {reassignError ? <Text style={[t.typography.caption, { color: t.colors.danger, marginTop: 12 }]}>{reassignError}</Text> : null}

          <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
            <Button
              label="Vazgeç"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => {
                setReassignOpen(false);
                setNewTeacherId(null);
                setNewBranchId(null);
                setNewRoomId(null);
                setReassignError(null);
              }}
            />
            <Button
              label="Değişikliği uygula"
              style={{ flex: 1 }}
              disabled={!canSubmit}
              loading={submitting}
              onPress={() => setConfirming(true)}
            />
          </View>
        </Card>
      )}

      <ConfirmDialog
        visible={!!pendingSwitch}
        title="Statü değiştirilsin mi?"
        message={
          pendingSwitch
            ? `Bu ders şu an "${OPS_FLAG_LABEL[pendingSwitch.from] ?? pendingSwitch.from}" durumunda. "${OPS_FLAG_LABEL[pendingSwitch.flag] ?? pendingSwitch.flag}" olarak değiştirmek istiyor musunuz?`
            : undefined
        }
        confirmLabel="Değiştir"
        onConfirm={() => {
          if (!pendingSwitch) return;
          const { flag, reason: savedReason } = pendingSwitch;
          setPendingSwitch(null);
          void markOps(flag, true, savedReason);
        }}
        onCancel={() => setPendingSwitch(null)}
      />

      <ConfirmDialog
        visible={confirmingCancel}
        title="Ders iptal edilsin mi?"
        message="Öğrenci ve öğretmene iptal bildirimi gönderilir. Bu işlem geri alınamaz."
        confirmLabel="İptal et"
        danger
        onConfirm={cancelLesson}
        onCancel={() => setConfirmingCancel(false)}
      />

      <ConfirmDialog
        visible={confirming}
        title="Bu değişikliği uygulamak istiyor musunuz?"
        message={`Öğretmen: ${selectedTeacherName ?? "(değişmiyor)"}\nŞube: ${selectedBranchName ?? "(değişmiyor)"}${
          newBranchId ? `\nOda: ${selectedRoomName ?? "(seçilmedi)"}` : ""
        }`}
        confirmLabel="Uygula"
        onConfirm={submitReassign}
        onCancel={() => setConfirming(false)}
      />
    </Screen>
  );
}
