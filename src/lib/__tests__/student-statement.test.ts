import { describe, it, expect } from "vitest";
import { buildStudentPaymentAttendanceStatement, PAYMENT_STATUS_TEXT, LESSON_STATUS_TEXT } from "../student-statement";
import type { AppData } from "../types";
import { createSeedData } from "../seed";
import { getStudentPaymentAttendanceStatementTool } from "../services/tools";
import { DEFAULT_TENANT_ID } from "../auth/config";
import type { ServiceContext } from "../services/context";

describe("öğrenci ödeme-yoklama dökümü", () => {
  it("statü metinleri renk dışında okunabilir", () => {
    expect(LESSON_STATUS_TEXT.attended).toBe("Geldi");
    expect(LESSON_STATUS_TEXT.processed).toBe("İşlendi");
    expect(LESSON_STATUS_TEXT.makeup).toBe("Telafi");
    expect(LESSON_STATUS_TEXT.cancelled).toBe("İptal");
    expect(PAYMENT_STATUS_TEXT.partial).toBe("Kısmi ödendi");
    expect(PAYMENT_STATUS_TEXT.paid).toBe("Ödendi");
    expect(PAYMENT_STATUS_TEXT.pending).toBe("Ödenmedi");
  });

  it("tutarı yeniden hesaplamaz — plan satırı yoksa empty state", () => {
    const data = createSeedData() as AppData;
    const studentId = data.students[0]?.id;
    if (!studentId) throw new Error("seed öğrenci yok");
    const statement = buildStudentPaymentAttendanceStatement({
      data,
      studentId,
      term: "guz",
      anchorYear: 2026,
      contracts: [],
      collectorNames: new Map(),
    });
    if ("error" in statement) throw new Error(statement.error);
    const october = statement.months.find((m) => m.month === 10 && m.year === 2026);
    if (october) {
      expect(october.plan.state).not.toBe("ok");
      if (october.plan.state !== "ok") {
        expect(october.plan.message).toBe("Bu ay için aktif ödeme planı bulunmuyor.");
      }
    }
  });

  it("öğretmen/veli döküm aracına erişemez", async () => {
    const teacher: ServiceContext = {
      role: "TEACHER",
      userId: "t1",
      tenantId: DEFAULT_TENANT_ID,
      channel: "web",
    };
    const res = await getStudentPaymentAttendanceStatementTool(teacher, {
      studentId: "s1",
      term: "guz",
      anchorYear: 2026,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("FORBIDDEN");
  });
});
