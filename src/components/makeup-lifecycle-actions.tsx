"use client";

import { useActionState, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  actionCancelMakeupRight,
  actionDeleteMakeupPlan,
  actionExtendMakeupDeadline,
  actionReviseMakeupPlan,
} from "@/lib/actions";
import { DEFAULT_APP_TIMEZONE, toZonedYmd, zonedHm, zonedWallTimeToUtc } from "@/lib/timezone";
import type { SimpleActionFormState } from "@/lib/actions";

type TeacherOption = { id: string; name: string; branchId: string; branchIds?: string[]; active?: boolean };
type RoomOption = { id: string; name: string; branchId: string; active?: boolean; deletedAt?: string };

export type MakeupLifecycleRow = {
  id: string;
  status: string;
  expiresAt?: string;
  hasActivePlan?: boolean;
  sourceClosedByExpiry?: boolean;
  hasConductMark?: boolean;
  teacherId?: string;
  roomId?: string;
  planStartAt?: string;
};

const FIELD = "mt-1 block w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm";

function FormError({ state }: { state: SimpleActionFormState }) {
  if (!state || state.ok !== false) return null;
  return <p className="text-xs text-rose-700">{state.message}</p>;
}

function AckFields({ needed }: { needed: boolean }) {
  if (!needed) return null;
  return (
    <div className="space-y-1 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-950">
      <p>Bu kayıtta yoklama veya gerçekleşme izi var. Düzeltme açık onay ve not ister. Yoklama satırı ve kaynak ders silinmez.</p>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="acknowledgeCorrection" value="1" />
        Düzeltmenin sonucunu onaylıyorum
      </label>
      <input name="correctionNote" placeholder="Düzeltme notu (en az 5 karakter)" className={FIELD} />
    </div>
  );
}

function SubmitForm({
  action,
  children,
  onDone,
}: {
  action: (prev: SimpleActionFormState, formData: FormData) => Promise<SimpleActionFormState>;
  children: ReactNode;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const started = useRef(false);
  useEffect(() => {
    if (pending) started.current = true;
    if (started.current && !pending && state == null) {
      started.current = false;
      onDone();
    }
  }, [pending, state, onDone]);
  return (
    <form
      action={formAction}
      className="space-y-2"
    >
      {children}
      <FormError state={state} />
      <button type="submit" disabled={pending} className="rounded bg-[var(--color-text)] px-2 py-1 text-xs font-semibold text-[var(--color-surface)] disabled:opacity-60">
        {pending ? "Kaydediliyor..." : "Onayla"}
      </button>
    </form>
  );
}

/** Telafi Merkezi geçmiş satırı: son gün uzatma, plan revizyonu, plan silme, hak iptali. */
export function MakeupLifecycleActions({
  row,
  teachers,
  rooms,
  /** Açık (bekleyen) kart yalnız uzatma sunar — revize onaylıya, silme/iptal geçmiş akışa aittir. */
  only,
}: {
  row: MakeupLifecycleRow;
  teachers: TeacherOption[];
  rooms: RoomOption[];
  only?: "extend";
}) {
  const router = useRouter();
  const [open, setOpen] = useState<"extend" | "revise" | "delete" | "cancel" | null>(null);
  const done = useCallback(() => {
    setOpen(null);
    router.refresh();
  }, [router]);
  const activeTeachers = teachers.filter((teacher) => teacher.active !== false);
  const teacher = activeTeachers.find((item) => item.id === row.teacherId) ?? activeTeachers[0];
  const [teacherId, setTeacherId] = useState(teacher?.id ?? "");
  const selected = activeTeachers.find((item) => item.id === teacherId);
  const activeRooms = rooms.filter(
    (room) =>
      room.active !== false &&
      !room.deletedAt &&
      (room.branchId === selected?.branchId || (selected?.branchIds ?? []).includes(room.branchId))
  );
  const planDate = row.planStartAt ? toZonedYmd(new Date(row.planStartAt), DEFAULT_APP_TIMEZONE) : "";
  const planTime = row.planStartAt ? zonedHm(new Date(row.planStartAt), DEFAULT_APP_TIMEZONE) : "";
  const [date, setDate] = useState(planDate);
  const [time, setTime] = useState(planTime);
  const [roomId, setRoomId] = useState(row.roomId && activeRooms.some((room) => room.id === row.roomId) ? row.roomId : activeRooms[0]?.id ?? "");
  const canExtend = row.status === "expired" || row.status === "confirmed" || row.status === "pending" || row.status === "suggested" || row.status === "awaiting_info";
  const canRevise = only !== "extend" && row.status === "confirmed" && row.hasActivePlan;
  const canDelete = only !== "extend" && !!row.hasActivePlan && row.status !== "cancelled" && row.status !== "completed";
  const canCancelRight = only !== "extend" && row.status !== "cancelled" && row.status !== "completed";
  if (!canExtend && !canRevise && !canDelete && !canCancelRight) return null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        {canExtend ? <button type="button" className="rounded border px-1.5 py-0.5 text-[11px]" onClick={() => setOpen(open === "extend" ? null : "extend")}>Son günü uzat</button> : null}
        {canRevise ? <button type="button" className="rounded border px-1.5 py-0.5 text-[11px]" onClick={() => setOpen(open === "revise" ? null : "revise")}>Planı revize et</button> : null}
        {canDelete ? <button type="button" className="rounded border px-1.5 py-0.5 text-[11px]" onClick={() => setOpen(open === "delete" ? null : "delete")}>Planı sil</button> : null}
        {canCancelRight ? <button type="button" className="rounded border px-1.5 py-0.5 text-[11px] text-rose-700" onClick={() => setOpen(open === "cancel" ? null : "cancel")}>Hakkı iptal et</button> : null}
      </div>
      {open === "extend" ? (
        <SubmitForm action={actionExtendMakeupDeadline} onDone={done}>
          <input type="hidden" name="requestId" value={row.id} />
          <p className="text-xs text-[var(--color-text-muted)]">Yeni son gün bugün veya sonrası olmalı. Süre dolumundan kapanan hak, yeni gün geçerliyse yeniden planlanabilir.</p>
          <input type="date" name="lastDayYmd" required className={FIELD} />
          {row.sourceClosedByExpiry ? (
            <AckFields needed />
          ) : null}
          {row.sourceClosedByExpiry ? <p className="text-xs">Kaynak dersteki “Telafi planlama süresi doldu” İşlendi işareti kalkar. Ödenmiş hakediş varsa ayrıca şifre istenir.</p> : null}
        </SubmitForm>
      ) : null}
      {open === "revise" ? (
        <SubmitForm
          action={async (prev, formData) => {
            const start = zonedWallTimeToUtc(date, time);
            if (Number.isNaN(start.getTime())) return { ok: false, message: "Tarih ve saati birlikte seçin." };
            formData.set("startAt", start.toISOString());
            return actionReviseMakeupPlan(prev, formData);
          }}
          onDone={done}
        >
          <input type="hidden" name="requestId" value={row.id} />
          <p className="text-xs">Aynı telafi dersi güncellenir. Geçmiş tarih yazılabilir. Yalnız aktif odalar listelenir. Çakışma kontrolü durur.</p>
          <select name="teacherId" value={teacherId} onChange={(event) => setTeacherId(event.target.value)} className={FIELD}>
            {activeTeachers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select name="roomId" value={roomId} onChange={(event) => setRoomId(event.target.value)} className={FIELD}>
            {activeRooms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={FIELD} />
          <input type="time" value={time} onChange={(event) => setTime(event.target.value)} className={FIELD} />
          <AckFields needed={!!row.hasConductMark} />
        </SubmitForm>
      ) : null}
      {open === "delete" ? (
        <SubmitForm action={actionDeleteMakeupPlan} onDone={done}>
          <input type="hidden" name="requestId" value={row.id} />
          <p className="text-xs">Planlanan telafi dersi iptal edilir ve takvim/oda saati boşalır. Kaynak ders silinmez. Telafi hakkı durur; süre uygunsa yeniden planlanır. Bekleyen hatırlatma, iptal edilen derse göre durur. Yoklama satırı silinmez.</p>
          <AckFields needed={!!row.hasConductMark} />
        </SubmitForm>
      ) : null}
      {open === "cancel" ? (
        <SubmitForm action={actionCancelMakeupRight} onDone={done}>
          <input type="hidden" name="requestId" value={row.id} />
          <input type="hidden" name="alsoCancelPlan" value={row.hasActivePlan ? "1" : ""} />
          <p className="text-xs">Telafi hakkı kapanır ve yeniden planlanamaz. {row.hasActivePlan ? "Planlı ders de iptal olur, saati boşalır." : "Planlı ders yok."} Kaynak ders silinmez. Yoklama satırı silinmez.</p>
          <textarea name="decisionNote" required placeholder="İptal gerekçesi" className={FIELD} />
          <AckFields needed={!!row.hasConductMark} />
        </SubmitForm>
      ) : null}
    </div>
  );
}
