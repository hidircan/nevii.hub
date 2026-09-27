import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { findPendingMigrations, pendingMigrationsMessage } from "../ops/pending-migrations";

/**
 * P0 2026-09-27 — test.neviihub.com paneli açılmıyordu: kod (0934e2e) `Room.deletedAt` okuyordu,
 * `20260927090000_room_soft_delete` test DB'ye uygulanmamıştı → her /panel isteğinde
 * `prisma.school.findFirst()` P2022 ColumnNotFound → React #441 / "Panel hatası".
 * Koruma: `test` build'i uygulanmamış migration varken durur (scripts/check-pending-migrations.ts).
 */
describe("panel açılışı — uygulanmamış migration build kapısı", () => {
  const applied = (name: string) => ({ migration_name: name, finished_at: "2026-09-26T18:21:49Z", rolled_back_at: null });

  it("olay senaryosu: repo'daki room_soft_delete DB'de yoksa bekleyen olarak yakalanır", () => {
    const pending = findPendingMigrations(
      ["20260926090000_trial_result_notes", "20260927090000_room_soft_delete"],
      [applied("20260926090000_trial_result_notes")]
    );
    expect(pending).toEqual(["20260927090000_room_soft_delete"]);
    expect(pendingMigrationsMessage(pending)).toContain("panel açılmaz");
  });

  it("yarıda kalmış veya geri alınmış migration uygulanmış sayılmaz", () => {
    expect(
      findPendingMigrations(
        ["a", "b"],
        [{ migration_name: "a", finished_at: null, rolled_back_at: null }, { migration_name: "b", finished_at: "x", rolled_back_at: "y" }]
      )
    ).toEqual(["a", "b"]);
  });

  it("repo'daki tüm migration'lar uygulanmışsa kapı geçer", () => {
    const committed = readdirSync(path.join(process.cwd(), "prisma", "migrations"), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    expect(findPendingMigrations(committed, committed.map(applied))).toEqual([]);
  });

  it("kapı build'e bağlı kalır (prebuild) ve yalnız test dalında çalışır", () => {
    const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    expect(pkg.scripts.prebuild).toContain("scripts/check-pending-migrations.ts");
    const script = readFileSync(path.join(process.cwd(), "scripts", "check-pending-migrations.ts"), "utf8");
    expect(script).toContain('VERCEL_GIT_COMMIT_REF !== "test"');
  });
});
