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
import { useLocale } from "../../../src/i18n/locale-context";
import { format } from "../../../src/lib/date";
import { lessonStatusBadge } from "../../../src/lib/lesson-status";
import { useTheme } from "../../../src/theme/theme-context";
import type { BranchesResponse, LessonOpsResponse, LessonReassignResponse, LessonsResponse, RoomsResponse, TeachersResponse } from "../../../src/types/api";

const OPS_FLAG_KEY: Record<string, string> = {
  attended: "attFlag.flagAttended",
  absent: "attFlag.flagAbsent",
  excused: "attFlag.flagExcused",
  processed: "attFlag.flagProcessed",
  makeup: "attFlag.flagMakeup",
};

export default function AdminLessonDetail() {
  const t = useTheme();
  const { t: tr } = useLocale();
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
  const [attendedNote, setAttendedNote] = useState("");
  const [noteLessonId, setNoteLessonId] = useState<string | null>(null);

  const teachers = useApiGet<TeachersResponse>(reassignOpen ? "/api/v1/teachers" : "");
  const branches = useApiGet<BranchesResponse>(reassignOpen ? "/api/v1/branches" : "");
  const rooms = useApiGet<RoomsResponse>(reassignOpen ? "/api/v1/rooms" : "");

  if (res.status === "loading") {
    return (
      <Screen>
        <AppHeader title={tr("adm.lesTitle")} showBack showNotifications={false} />
        <LoadingSkeleton rows={3} />
      </Screen>
    );
  }
  if (res.status === "error") {
    return (
      <Screen>
        <AppHeader title={tr("adm.lesTitle")} showBack showNotifications={false} />
        <ErrorState message={res.message} onRetry={res.refresh} />
      </Screen>
    );
  }

  const lesson = res.data.lessons.find((l) => l.id === lessonId);
  if (lesson && noteLessonId !== lesson.id) {
    setNoteLessonId(lesson.id);
    setAttendedNote(lesson.studentAttendanceNote ?? "");
  }
  if (!lesson) {
    return (
      <Screen>
        <AppHeader title={tr("adm.lesTitle")} showBack showNotifications={false} />
        <EmptyState icon="alert-circle-outline" title={tr("adm.lesNotFound")} />
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

  async function markOps(flag: string, confirmSwitch = false, reasonText?: string, attendanceNote?: string) {
    setOpsBusy(flag);
    setOpsError(null);
    const result = await apiPost<LessonOpsResponse>(`/api/v1/lessons/${lessonId}/ops`, {
      flag,
      confirmSwitch,
      ...(reasonText !== undefined ? { reason: reasonText } : {}),
      ...(flag === "attended" && attendanceNote !== undefined ? { attendanceNote } : {}),
    });
    setOpsBusy(null);
    if (!result.ok) {
      setOpsError(result.error.message || tr("adm.lesSaveAttFail"));
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
      setOpsError(result.error.message || tr("adm.lesCancelFail"));
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
      setReassignError(result.error.message || tr("adm.lesReassignFail"));
      return;
    }
    setReassignedOk(true);
    setReassignOpen(false);
    res.refresh();
  }

  return (
    <Screen>
      <AppHeader title={tr("adm.lesDetail")} showBack showNotifications={false} />

      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <Avatar name={lesson.studentName ?? "?"} size={44} />
          <View style={{ flex: 1 }}>
            <Text style={[t.typography.cardTitle, { color: t.colors.text }]}>{lesson.studentName ?? tr("adm.lesRoleStudent")}</Text>
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>{tr("adm.lesRoleStudent")}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Avatar name={lesson.teacherName ?? "?"} size={44} />
          <View style={{ flex: 1 }}>
            <Text style={[t.typography.cardTitle, { color: t.colors.text }]}>{lesson.teacherName ?? tr("adm.lesRoleTeacher")}</Text>
            <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>{tr("adm.lesRoleTeacher")}</Text>
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
          {lesson.instrument ? <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{tr("adm.lesInstrument", { v: lesson.instrument })}</Text> : null}
          {lesson.roomName ? <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>{tr("adm.lesRoom", { v: lesson.roomName })}</Text> : null}
        </View>
      </Card>

      <SectionHeader title={tr("adm.lesAttTitle")} />
      {opsError ? (
        <Card style={{ marginBottom: 10, borderColor: t.colors.danger }}>
          <Text style={[t.typography.body, { color: t.colors.danger }]}>{opsError}</Text>
        </Card>
      ) : null}
      {lesson.status === "cancelled" ? (
        <EmptyState icon="ban-outline" title={tr("adm.lesCancelled")} />
      ) : (
        <View style={{ gap: 8 }}>
          <TextField
            label="Geldi notu (isteğe bağlı)"
            value={attendedNote}
            onChangeText={setAttendedNote}
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button label={tr("attFlag.flagAttended")} size="sm" loading={opsBusy === "attended"} onPress={() => markOps("attended", false, undefined, attendedNote)} style={{ flex: 1 }} />
            <Button label={tr("attFlag.flagAbsent")} size="sm" variant="danger" loading={opsBusy === "absent"} onPress={() => markOps("absent")} style={{ flex: 1 }} />
            <Button label={tr("attFlag.flagExcused")} size="sm" variant="secondary" loading={opsBusy === "excused"} onPress={() => markOps("excused")} style={{ flex: 1 }} />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button label={tr("attFlag.flagMakeup")} size="sm" variant="secondary" loading={opsBusy === "makeup"} onPress={() => { setReason(""); setReasonPrompt("makeup"); }} style={{ flex: 1 }} />
            <Button label={tr("attFlag.flagProcessed")} size="sm" variant="secondary" loading={opsBusy === "processed"} onPress={() => { setReason(""); setReasonPrompt("processed"); }} style={{ flex: 1 }} />
            <Button label={tr("adm.lesCancelConfirm")} size="sm" variant="danger" loading={opsBusy === "cancel"} onPress={() => setConfirmingCancel(true)} style={{ flex: 1 }} />
          </View>
          {reasonPrompt ? (
            <Card>
              <TextField
                label={tr("adm.lesReasonTitle", { flag: OPS_FLAG_KEY[reasonPrompt] ? tr(OPS_FLAG_KEY[reasonPrompt]) : reasonPrompt })}
                value={reason}
                onChangeText={setReason}
                placeholder={tr("adm.lesReasonPh")}
              />
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <Button label={tr("ui.cancelDefault")} variant="secondary" style={{ flex: 1 }} onPress={() => setReasonPrompt(null)} />
                <Button
                  label={tr("adm.lesApply")}
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

      <SectionHeader title={tr("adm.lesReassignTitle")} />
      {reassignedOk ? (
        <Card style={{ borderColor: t.colors.success, backgroundColor: t.colors.successSoft }}>
          <Text style={[t.typography.body, { color: t.colors.success }]}>{tr("adm.lesReassignOk")}</Text>
        </Card>
      ) : null}
      {!reassignOpen ? (
        <Button label={tr("adm.lesReassignCta")} variant="secondary" onPress={() => setReassignOpen(true)} />
      ) : (
        <Card>
          <SelectField
            label={tr("adm.lesNewTeacher")}
            value={newTeacherId}
            placeholder={tr("adm.lesKeepPh")}
            options={eligibleTeachers.map((tc) => ({ label: tc.name, value: tc.id }))}
            onChange={setNewTeacherId}
          />
          <View style={{ height: 12 }} />
          <SelectField
            label={tr("adm.lesNewBranch")}
            value={newBranchId}
            placeholder={tr("adm.lesKeepPh")}
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
                label={tr("adm.lesNewRoom")}
                value={newRoomId}
                placeholder={roomsInBranch.length === 0 ? tr("adm.lesNoRoom") : tr("adm.lesPickPh")}
                options={roomsInBranch.map((r) => ({ label: r.name, value: r.id }))}
                onChange={setNewRoomId}
              />
            </>
          ) : null}

          {reassignError ? <Text style={[t.typography.caption, { color: t.colors.danger, marginTop: 12 }]}>{reassignError}</Text> : null}

          <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
            <Button
              label={tr("ui.cancelDefault")}
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
              label={tr("adm.lesApplyChange")}
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
        title={tr("adm.lesSwitchTitle")}
        message={
          pendingSwitch
            ? tr("adm.lesSwitchMsg", { from: OPS_FLAG_KEY[pendingSwitch.from] ? tr(OPS_FLAG_KEY[pendingSwitch.from]) : pendingSwitch.from, to: OPS_FLAG_KEY[pendingSwitch.flag] ? tr(OPS_FLAG_KEY[pendingSwitch.flag]) : pendingSwitch.flag })
            : undefined
        }
        confirmLabel={tr("adm.lesSwitchConfirm")}
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
        title={tr("adm.lesCancelTitle")}
        message={tr("adm.lesCancelMsg")}
        confirmLabel={tr("adm.lesCancelConfirm")}
        danger
        onConfirm={cancelLesson}
        onCancel={() => setConfirmingCancel(false)}
      />

      <ConfirmDialog
        visible={confirming}
        title={tr("adm.lesReassignConfirmTitle")}
        message={`${tr("adm.lesTeacherLine", { v: selectedTeacherName ?? tr("adm.lesUnchanged") })}\n${tr("adm.lesBranchLine", { v: selectedBranchName ?? tr("adm.lesUnchanged") })}${
          newBranchId ? `\n${tr("adm.lesRoomLine", { v: selectedRoomName ?? tr("adm.lesUnpicked") })}` : ""
        }`}
        confirmLabel={tr("adm.lesApply")}
        onConfirm={submitReassign}
        onCancel={() => setConfirming(false)}
      />
    </Screen>
  );
}
