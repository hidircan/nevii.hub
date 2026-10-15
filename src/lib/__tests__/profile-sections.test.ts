/**
 * 2026-10-15 — Bilgiler kartı: "Düzenle" yalnız o bölümün alanlarını açar ve yalnız onları gönderir; başka bölüm
 * kaydedilmez/değişmez. Eskiden Genel/İletişim/Özlük kartlarının üçü de aynı tam formu açıyordu.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { resolveDataDir } from "../config";
import { DEFAULT_TENANT_ID } from "../auth/config";
import { readData } from "../store";
import { updateStudentProfileTool, updateTeacherProfileTool } from "../services/tools";
import { STUDENT_PROFILE_SECTIONS, TEACHER_PROFILE_SECTIONS, pickSectionFields } from "../profile-sections";
import type { ServiceContext } from "../services/context";

const admin: ServiceContext = { role: "SCHOOL_ADMIN", userId: "u_admin", tenantId: DEFAULT_TENANT_ID, channel: "web" };

beforeEach(async () => {
  await fs.rm(path.join(resolveDataDir(path.join(process.cwd(), "data")), "store.json"), { force: true });
});

describe("bilgi kartı bölümleri", () => {
  it("her alan tek bir bölüme ait (bölümler ayrık)", () => {
    for (const map of [TEACHER_PROFILE_SECTIONS, STUDENT_PROFILE_SECTIONS]) {
      const all = Object.values(map).flat();
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it("öğretmen: yalnız İletişim kaydedilir — ad, şube, doğum tarihi, özlük alanları değişmez", async () => {
    const before = (await readData()).teachers[0]!;
    const full = { name: "YANLIŞ", branchId: "yok", birthDate: "1990-01-01", personnelNotes: "x", phone: "05559998877", address: "Yeni adres" };
    const patch = pickSectionFields(full, TEACHER_PROFILE_SECTIONS.contact);
    expect(Object.keys(patch).sort()).toEqual(["address", "phone"]);

    const r = await updateTeacherProfileTool(admin, { teacherId: before.id, ...patch });
    expect(r.ok, r.ok ? "" : r.error.message).toBe(true);
    const after = (await readData()).teachers.find((t) => t.id === before.id)!;
    expect(after.phone).toBe("05559998877");
    expect(after.address).toBe("Yeni adres");
    expect(after.name).toBe(before.name);
    expect(after.branchId).toBe(before.branchId);
    expect(after.birthDate).toBe(before.birthDate);
    expect(after.personnelNotes).toBe(before.personnelNotes);
  });

  it("öğrenci: yalnız İletişim kaydedilir — ad, şube, doğum tarihi değişmez", async () => {
    const before = (await readData()).students.find((s) => !s.deletedAt)!;
    const patch = pickSectionFields(
      { name: "YANLIŞ", branchId: "yok", birthDate: "2000-01-01", parentName: "Yeni Veli", parentPhone: "05551112233" },
      STUDENT_PROFILE_SECTIONS.contact
    );
    expect(Object.keys(patch).sort()).toEqual(["parentName", "parentPhone"]);

    const r = await updateStudentProfileTool(admin, { studentId: before.id, ...patch });
    expect(r.ok, r.ok ? "" : r.error.message).toBe(true);
    const after = (await readData()).students.find((s) => s.id === before.id)!;
    expect(after.parentName).toBe("Yeni Veli");
    expect(after.name).toBe(before.name);
    expect(after.branchId).toBe(before.branchId);
    expect(after.birthDate).toBe(before.birthDate);
  });
});
