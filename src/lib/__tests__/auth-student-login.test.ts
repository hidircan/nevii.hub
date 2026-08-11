import { describe, it, expect } from "vitest";
import { authenticateUser } from "../auth/users";

/**
 * Regresyon — köke inen sebep: login-form.tsx'teki 5 "Öğrenci — CSV" demo
 * persona'sı (Ada Yılmaz vd.), t1..t7 öğretmen girişindeki köküyle AYNI
 * mode-parity sorunu yüzünden json/memory modunda (testlerin çalıştığı mod)
 * hiç giriş yapamıyordu: bu kimlikler yalnızca STORE_MODE=db'de
 * scripts/seed-demo-csv-teachers.ts çalıştırıldığında oluşuyordu — bkz.
 * auth-teacher-login.test.ts.
 */
describe("authenticateUser — CSV demo öğrenci girişi (json/memory bootstrap)", () => {
  it("her 5 CSV demo öğrencisi kendi demo şifresiyle giriş yapabilir (mode parity)", async () => {
    const students = [
      ["ada.yilmaz.demo@email.com", "demo-student-csv-1", "s_csv_1"],
      ["kerem.sahin.demo@email.com", "demo-student-csv-2", "s_csv_2"],
      ["nehir.kaya.demo@email.com", "demo-student-csv-3", "s_csv_3"],
      ["toprak.demir.demo@email.com", "demo-student-csv-4", "s_csv_4"],
      ["elif.aksoy.demo@email.com", "demo-student-csv-5", "s_csv_5"],
    ] as const;
    for (const [email, password, studentId] of students) {
      const user = await authenticateUser(email, password);
      expect(user, `${email} giriş yapamadı`).not.toBeNull();
      expect(user?.role).toBe("STUDENT");
      expect(user?.studentId).toBe(studentId);
    }
  });

  it("e-posta baştaki/sondaki boşluk ve büyük/küçük harften bağımsız eşleşir", async () => {
    const user = await authenticateUser("  Ada.Yilmaz.Demo@EMAIL.com  ", "demo-student-csv-1");
    expect(user).not.toBeNull();
    expect(user?.studentId).toBe("s_csv_1");
  });

  it("yanlış şifreyle giriş reddedilir", async () => {
    const user = await authenticateUser("ada.yilmaz.demo@email.com", "wrong-password");
    expect(user).toBeNull();
  });
});
