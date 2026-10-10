import { describe, it, expect, vi } from "vitest";
import { classifyOpsResult, createInFlightGuard, opsFlagLabel, pendingAttendance } from "../attendance";
import type { Lesson } from "../../types/api";

describe("classifyOpsResult — yoklama sonucu", () => {
  it("ağ hatasında ASLA 'kaydedildi' demez", () => {
    const out = classifyOpsResult({ ok: false, error: { code: "NETWORK_ERROR", message: "Sunucuya bağlanılamadı." } });
    expect(out).toEqual({ kind: "error", message: "Sunucuya bağlanılamadı." });
  });

  it("başka öğretmenin dersi (403) hata olarak kalır", () => {
    expect(classifyOpsResult({ ok: false, error: { code: "FORBIDDEN", message: "yetki yok", status: 403 } }).kind).toBe("error");
  });

  it("statü değişimi needsConfirmation → onay ister, kaydedildi DEMEZ", () => {
    expect(classifyOpsResult({ ok: true, data: { needsConfirmation: true, alreadySet: false } })).toEqual({ kind: "confirm" });
  });

  it("yeni kayıt ve idempotent tekrar ayrı mesaj alır", () => {
    expect(classifyOpsResult({ ok: true, data: { alreadySet: false } })).toEqual({ kind: "saved", message: "Yoklama kaydedildi." });
    expect(classifyOpsResult({ ok: true, data: { alreadySet: true } })).toEqual({ kind: "saved", message: "Yoklama zaten bu şekilde kayıtlı." });
  });

  it("İngilizce yoklama mesajları ve bayrak etiketleri", () => {
    expect(classifyOpsResult({ ok: true, data: { alreadySet: false } }, "en")).toEqual({ kind: "saved", message: "Attendance saved." });
    expect(opsFlagLabel("attended", "en")).toBe("Attended");
    expect(opsFlagLabel("excused", "tr")).toBe("İzinli");
  });
});

describe("createInFlightGuard — double-submit koruması", () => {
  it("ilk istek bitmeden gelen ikinci dokunuş istek göndermez", async () => {
    const guard = createInFlightGuard();
    let release!: () => void;
    const task = vi.fn(() => new Promise<string>((r) => (release = () => r("ok"))));

    const first = guard.run(task);
    const second = await guard.run(task);
    expect(second).toBeUndefined();
    expect(task).toHaveBeenCalledTimes(1);

    release();
    expect(await first).toBe("ok");
  });

  it("hata sonrası kilit açılır (yeniden deneme mümkün)", async () => {
    const guard = createInFlightGuard();
    await expect(guard.run(() => Promise.reject(new Error("x")))).rejects.toThrow("x");
    expect(await guard.run(async () => 1)).toBe(1);
  });
});

describe("pendingAttendance — yoklama bekleyen dersler", () => {
  const now = new Date(2026, 8, 13, 18, 0).getTime();
  const lesson = (id: string, endHoursAgo: number, extra: Partial<Lesson> = {}): Lesson => ({
    id,
    startAt: new Date(now - (endHoursAgo + 1) * 3_600_000).toISOString(),
    endAt: new Date(now - endHoursAgo * 3_600_000).toISOString(),
    status: "scheduled",
    ...extra,
  });

  it("yalnız bitmiş, kayıtsız, iptal olmayan ve pencere içindeki dersleri döner (en eski önce)", () => {
    const out = pendingAttendance(
      [
        lesson("recent", 1),
        lesson("older", 48),
        lesson("future", -2),
        lesson("attended", 3, { studentAttended: true }),
        lesson("excused", 3, { studentExcused: true }),
        lesson("cancelled", 3, { status: "cancelled" }),
        lesson("tooOld", 24 * 20),
      ],
      now
    );
    expect(out.map((l) => l.id)).toEqual(["older", "recent"]);
  });
});
