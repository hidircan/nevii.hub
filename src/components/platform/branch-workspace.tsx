"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Select } from "@/components/ui";
import { callApi } from "@/components/platform/api";

type Lesson = { id: string; startAt: string; studentName: string; teacherName: string; status: string; attended: boolean | null };
type Student = { id: string; name: string; phone: string; level: string };
type Branch = { id: string; name: string };

const ATTENDANCE = [
  { value: "present", label: "Geldi" },
  { value: "late", label: "Geç" },
  { value: "absent", label: "Gelmedi" },
] as const;

/**
 * Şube müdürü işlemleri — yalnız /api/v1/sube/* (sunucu her istekte
 * permission + şube kapsamını doğrular; bu bileşen yalnız arayüzdür).
 */
export function BranchWorkspace({
  lessons,
  students,
  branches,
  canAnnounce,
}: {
  lessons: Lesson[];
  students: Student[];
  branches: Branch[];
  canAnnounce: boolean;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [edit, setEdit] = useState<Record<string, { phone: string; level: string }>>({});
  const [ann, setAnn] = useState({ branchId: branches[0]?.id ?? "", title: "", body: "" });

  async function post(action: string, body: unknown, success: string) {
    setMsg(null);
    const res = await callApi(`/api/v1/sube/${action}`, "POST", body);
    if (!res.ok) return setMsg({ kind: "err", text: res.error.message });
    setMsg({ kind: "ok", text: success });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {msg ? (
        <p role={msg.kind === "err" ? "alert" : "status"} className={`text-sm ${msg.kind === "err" ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}>
          {msg.text}
        </p>
      ) : null}
      <Card>
        <h2 id="yoklama" className="text-sm font-semibold">Bugün ve önümüzdeki 7 gün — yoklama ({lessons.length})</h2>
        <ul className="mt-2 divide-y text-sm" style={{ borderColor: "var(--color-border)" }}>
          {lessons.length === 0 ? <li className="py-2 text-[var(--color-text-muted)]">Ders yok</li> : null}
          {lessons.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {new Date(l.startAt).toLocaleString("tr-TR", { weekday: "short", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })} ·{" "}
                <strong>{l.studentName}</strong> <span className="text-xs text-[var(--color-text-muted)]">· {l.teacherName}</span>
                {l.attended !== null ? <span className="ml-2 text-xs text-[var(--color-success)]">{l.attended ? "geldi" : "gelmedi"}</span> : null}
              </span>
              <span className="flex gap-1">
                {ATTENDANCE.map((a) => (
                  <Button key={a.value} variant="secondary" onClick={() => void post("attendance", { lessonId: l.id, status: a.value }, "Yoklama kaydedildi.")}>
                    {a.label}
                  </Button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="text-sm font-semibold">Öğrenciler — temel bilgi güncelleme ({students.length})</h2>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">Şube müdürü yalnız iletişim/seviye gibi operasyonel alanları günceller; ücret ve kimlik alanları kapalıdır.</p>
        <ul className="mt-2 max-h-96 divide-y overflow-auto text-sm" style={{ borderColor: "var(--color-border)" }}>
          {students.map((st) => {
            const e = edit[st.id] ?? { phone: st.phone, level: st.level };
            return (
              <li key={st.id} className="grid items-center gap-2 py-2 sm:grid-cols-[1fr_10rem_8rem_auto]">
                <span>{st.name}</span>
                <Input aria-label={`${st.name} telefon`} value={e.phone} onChange={(ev) => setEdit({ ...edit, [st.id]: { ...e, phone: ev.target.value } })} />
                <Input aria-label={`${st.name} seviye`} value={e.level} onChange={(ev) => setEdit({ ...edit, [st.id]: { ...e, level: ev.target.value } })} />
                <Button variant="secondary" onClick={() => void post("students", { studentId: st.id, phone: e.phone, level: e.level }, "Öğrenci güncellendi.")}>
                  Kaydet
                </Button>
              </li>
            );
          })}
        </ul>
      </Card>
      {canAnnounce ? (
        <Card>
          <h2 id="duyuru" className="text-sm font-semibold">Şube duyurusu</h2>
          <div className="mt-2 grid gap-2">
            <Select aria-label="Şube" value={ann.branchId} onChange={(e) => setAnn({ ...ann, branchId: e.target.value })}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
            <Input aria-label="Başlık" placeholder="Başlık" value={ann.title} onChange={(e) => setAnn({ ...ann, title: e.target.value })} />
            <textarea
              aria-label="Duyuru metni"
              rows={3}
              className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2 text-sm"
              value={ann.body}
              onChange={(e) => setAnn({ ...ann, body: e.target.value })}
            />
            <Button
              disabled={!ann.title || !ann.body}
              onClick={() =>
                void post(
                  "announcements",
                  { title: ann.title, body: ann.body, audienceType: "branch", audienceRef: { branchId: ann.branchId }, status: "published" },
                  "Duyuru yayınlandı."
                )
              }
            >
              Yayınla
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
