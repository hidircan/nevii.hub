import { describe, it, expect } from "vitest";
import { matchesAudience, isVisibleNow, resolveAudienceRecipients, type AnnouncementRecipient } from "../announcements/audience";
import type { Announcement, Student, Teacher } from "../types";

function student(overrides: Partial<Student>): Student {
  return {
    id: "s1",
    name: "Test Öğrenci",
    email: "",
    phone: "",
    parentName: "",
    parentPhone: "",
    branchId: "erzene" as Student["branchId"],
    instruments: [],
    teacherId: "t1",
    packageName: "",
    weeklyLessonCount: 1,
    monthlyFee: 0,
    active: true,
    notes: "",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function teacher(overrides: Partial<Teacher>): Teacher {
  return {
    id: "t1",
    name: "Test Öğretmen",
    email: "",
    phone: "",
    branchId: "erzene" as Teacher["branchId"],
    instruments: [],
    availability: [],
    maxDailyLessons: 8,
    active: true,
    color: "#000",
    ...overrides,
  };
}

function announcement(
  overrides: Partial<Pick<Announcement, "audienceType" | "audienceRef" | "rules">>
): Pick<Announcement, "audienceType" | "audienceRef" | "rules"> {
  return { audienceType: "all", ...overrides };
}

const STUDENTS: Student[] = [
  student({ id: "s-erzene-hobi", branchId: "erzene" as Student["branchId"], studentType: "Hobi" }),
  student({ id: "s-alsancak-meb", branchId: "alsancak" as Student["branchId"], studentType: "MEB" }),
  // Faz 1B — birden fazla türe sahip öğrenci (yeni studentTypes dizisi).
  student({
    id: "s-erzene-hobi-lcm",
    branchId: "erzene" as Student["branchId"],
    studentTypes: ["Hobi", "London College of Music Hazırlık"],
  }),
];
const TEACHERS: Teacher[] = [
  teacher({ id: "t-erzene", branchId: "erzene" as Teacher["branchId"] }),
  teacher({ id: "t-alsancak", branchId: "alsancak" as Teacher["branchId"] }),
];
const CONTEXT = { students: STUDENTS, teachers: TEACHERS };

/** Karma Öğrenci Portalı — veli artık ayrı bir rol değil, STUDENT + accessType=GUARDIAN. */
function parent(studentId: string, userId = `parent-of-${studentId}`): AnnouncementRecipient {
  return { role: "STUDENT", userId, studentId, accessType: "GUARDIAN" };
}
function studentRecipient(studentId: string, userId = `student-${studentId}`): AnnouncementRecipient {
  return { role: "STUDENT", userId, studentId, accessType: "SELF" };
}
function teacherRecipient(teacherId: string, userId = `user-${teacherId}`): AnnouncementRecipient {
  return { role: "TEACHER", userId, teacherId };
}
function admin(userId = "admin1"): AnnouncementRecipient {
  return { role: "SCHOOL_ADMIN", userId };
}

describe("EPIC 5 — matchesAudience: her audienceType için hedefte olan görür, olmayan görmez", () => {
  it("all: her rol görür", () => {
    const a = announcement({ audienceType: "all" });
    expect(matchesAudience(a, parent("s-erzene-hobi"), CONTEXT)).toBe(true);
    expect(matchesAudience(a, teacherRecipient("t-erzene"), CONTEXT)).toBe(true);
    expect(matchesAudience(a, admin(), CONTEXT)).toBe(true);
  });

  it("teachers: yalnızca TEACHER rolü görür, veli/öğrenci görmez", () => {
    const a = announcement({ audienceType: "teachers" });
    expect(matchesAudience(a, teacherRecipient("t-erzene"), CONTEXT)).toBe(true);
    expect(matchesAudience(a, parent("s-erzene-hobi"), CONTEXT)).toBe(false);
  });

  it("parents: yalnızca accessType=GUARDIAN olan STUDENT görür, TEACHER ve accessType=SELF görmez", () => {
    const a = announcement({ audienceType: "parents" });
    expect(matchesAudience(a, parent("s-erzene-hobi"), CONTEXT)).toBe(true);
    expect(matchesAudience(a, teacherRecipient("t-erzene"), CONTEXT)).toBe(false);
    expect(matchesAudience(a, studentRecipient("s-erzene-hobi"), CONTEXT)).toBe(false);
  });

  it("branch: yalnızca o şubedeki öğretmen/veli/öğrenci görür, başka şube görmez", () => {
    const a = announcement({ audienceType: "branch", audienceRef: { branchId: "erzene" } });
    expect(matchesAudience(a, teacherRecipient("t-erzene"), CONTEXT)).toBe(true);
    expect(matchesAudience(a, teacherRecipient("t-alsancak"), CONTEXT)).toBe(false);
    expect(matchesAudience(a, parent("s-erzene-hobi"), CONTEXT)).toBe(true);
    expect(matchesAudience(a, parent("s-alsancak-meb"), CONTEXT)).toBe(false);
    expect(matchesAudience(a, studentRecipient("s-erzene-hobi"), CONTEXT)).toBe(true);
    expect(matchesAudience(a, studentRecipient("s-alsancak-meb"), CONTEXT)).toBe(false);
  });

  it("branch: audienceRef eksikse kimse görmez (fail-closed)", () => {
    const a = announcement({ audienceType: "branch" });
    expect(matchesAudience(a, teacherRecipient("t-erzene"), CONTEXT)).toBe(false);
  });

  it("studentType: yalnızca o türdeki öğrencinin velisi/kendisi görür, diğer türler görmez", () => {
    const a = announcement({ audienceType: "studentType", audienceRef: { studentType: "Hobi" } });
    expect(matchesAudience(a, parent("s-erzene-hobi"), CONTEXT)).toBe(true);
    expect(matchesAudience(a, parent("s-alsancak-meb"), CONTEXT)).toBe(false);
    expect(matchesAudience(a, studentRecipient("s-erzene-hobi"), CONTEXT)).toBe(true);
    expect(matchesAudience(a, studentRecipient("s-alsancak-meb"), CONTEXT)).toBe(false);
  });

  it("Faz 1B — birden fazla türe sahip öğrenci, atanmış türlerden HERHANGİ biri hedeflenirse görür", () => {
    const targetHobi = announcement({ audienceType: "studentType", audienceRef: { studentType: "Hobi" } });
    const targetLcm = announcement({
      audienceType: "studentType",
      audienceRef: { studentType: "London College of Music Hazırlık" },
    });
    expect(matchesAudience(targetHobi, parent("s-erzene-hobi-lcm"), CONTEXT)).toBe(true);
    expect(matchesAudience(targetLcm, parent("s-erzene-hobi-lcm"), CONTEXT)).toBe(true);
    expect(matchesAudience(targetLcm, parent("s-erzene-hobi"), CONTEXT)).toBe(false);
  });

  it("studentType: TEACHER rolü asla görmez (yalnızca veli hedeflemesi)", () => {
    const a = announcement({ audienceType: "studentType", audienceRef: { studentType: "Hobi" } });
    expect(matchesAudience(a, teacherRecipient("t-erzene"), CONTEXT)).toBe(false);
  });

  it("selected: yalnızca listedeki userId görür, listede olmayan görmez", () => {
    const a = announcement({ audienceType: "selected", audienceRef: { userIds: ["user-x", "user-y"] } });
    expect(matchesAudience(a, parent("s1", "user-x"), CONTEXT)).toBe(true);
    expect(matchesAudience(a, parent("s1", "user-z"), CONTEXT)).toBe(false);
  });

  it("selected: audienceRef yoksa kimse görmez (fail-closed)", () => {
    const a = announcement({ audienceType: "selected" });
    expect(matchesAudience(a, parent("s1", "user-x"), CONTEXT)).toBe(false);
  });

  it("students: Karma Öğrenci Portalı sonrası accessType=SELF (veya bilinmeyen) görür — GUARDIAN/TEACHER görmez", () => {
    const a = announcement({ audienceType: "students" });
    expect(matchesAudience(a, studentRecipient("s-erzene-hobi"), CONTEXT)).toBe(true);
    expect(matchesAudience(a, parent("s-erzene-hobi"), CONTEXT)).toBe(false);
    expect(matchesAudience(a, teacherRecipient("t-erzene"), CONTEXT)).toBe(false);
  });
});

describe("Faz 4 — instrument segmenti", () => {
  const piyanoStudent = student({ id: "s-piyano", instruments: ["Piyano"] });
  const kemanStudent = student({ id: "s-keman", instruments: ["Keman"] });
  const piyanoTeacher = teacher({ id: "t-piyano", instruments: ["Piyano", "Gitar"] });
  const kemanTeacher = teacher({ id: "t-keman", instruments: ["Keman"] });
  const ctx = { students: [piyanoStudent, kemanStudent], teachers: [piyanoTeacher, kemanTeacher] };

  it("bu enstrümanı ÇALAN öğrenci ve ÖĞRETEN öğretmen görür, diğerleri görmez", () => {
    const a = announcement({ audienceType: "instrument", audienceRef: { instrument: ["Piyano"] } });
    expect(matchesAudience(a, studentRecipient("s-piyano"), ctx)).toBe(true);
    expect(matchesAudience(a, teacherRecipient("t-piyano"), ctx)).toBe(true);
    expect(matchesAudience(a, studentRecipient("s-keman"), ctx)).toBe(false);
    expect(matchesAudience(a, teacherRecipient("t-keman"), ctx)).toBe(false);
  });

  it("audienceRef.instrument boş/eksikse kimse görmez (fail-closed)", () => {
    const a = announcement({ audienceType: "instrument", audienceRef: { instrument: [] } });
    expect(matchesAudience(a, studentRecipient("s-piyano"), ctx)).toBe(false);
  });
});

describe("Faz 4 — resolveAudienceRecipients: çoklu kural (rules[]) ve tekilleştirme", () => {
  it("iki farklı kuralla eşleşen aynı kullanıcı listede TEK kez döner", () => {
    const pianoTeacher = teacher({ id: "t-piyano", instruments: ["Piyano"] });
    const ctx2 = { students: [], teachers: [pianoTeacher] };
    const a = announcement({
      audienceType: "teachers",
      rules: [
        { audienceType: "teachers" },
        { audienceType: "instrument", audienceRef: { instrument: ["Piyano"] } },
      ],
    });
    const candidates: AnnouncementRecipient[] = [teacherRecipient("t-piyano")];
    const result = resolveAudienceRecipients(a, candidates, ctx2);
    expect(result).toHaveLength(1);
  });

  it("aynı userId iki farklı aday satırında (ör. iki öğrencinin velisi) tek kez döner", () => {
    const s1 = student({ id: "s-a", branchId: "erzene" as Student["branchId"] });
    const s2 = student({ id: "s-b", branchId: "erzene" as Student["branchId"] });
    const ctx2 = { students: [s1, s2], teachers: [] };
    const a = announcement({ audienceType: "branch", audienceRef: { branchId: "erzene" } });
    const candidates: AnnouncementRecipient[] = [
      { role: "STUDENT", userId: "guardian-x", studentId: "s-a", accessType: "GUARDIAN" },
      { role: "STUDENT", userId: "guardian-x", studentId: "s-b", accessType: "GUARDIAN" },
    ];
    const result = resolveAudienceRecipients(a, candidates, ctx2);
    expect(result).toHaveLength(1);
    expect(result[0]!.userId).toBe("guardian-x");
  });

  it("hedef dışı aday listede hiç görünmez", () => {
    const ctx2 = CONTEXT;
    const a = announcement({ audienceType: "teachers" });
    const candidates: AnnouncementRecipient[] = [teacherRecipient("t-erzene"), parent("s-erzene-hobi")];
    const result = resolveAudienceRecipients(a, candidates, ctx2);
    expect(result.map((r) => r.userId)).toEqual(["user-t-erzene"]);
  });
});

describe("EPIC 5 — isVisibleNow: durum ve yayın penceresi", () => {
  it("draft asla görünmez", () => {
    expect(isVisibleNow({ status: "draft", publishAt: undefined, expireAt: undefined })).toBe(false);
  });

  it("archived asla görünmez", () => {
    expect(isVisibleNow({ status: "archived", publishAt: undefined, expireAt: undefined })).toBe(false);
  });

  it("published + publishAt gelecekteyse henüz görünmez", () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    expect(isVisibleNow({ status: "published", publishAt: future, expireAt: undefined })).toBe(false);
  });

  it("published + expireAt geçmişse artık görünmez", () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(isVisibleNow({ status: "published", publishAt: undefined, expireAt: past })).toBe(false);
  });

  it("published + pencere içindeyse görünür", () => {
    expect(isVisibleNow({ status: "published", publishAt: undefined, expireAt: undefined })).toBe(true);
  });
});
