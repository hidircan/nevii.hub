/**
 * P0 (2026-09-27) — "deploy migration'dan önce" koruması. Kod yeni bir kolonu okuyorsa
 * (`Room.deletedAt`) ama migration hedef DB'ye uygulanmadıysa, Prisma HER panel
 * isteğinde P2022 ColumnNotFound atar ve panel tamamen çöker. Bu saf fonksiyon repo'daki
 * migration'ları DB'de başarıyla bitmiş olanlarla karşılaştırır.
 */
export type AppliedMigrationRow = { migration_name: string; finished_at: Date | string | null; rolled_back_at: Date | string | null };

export function findPendingMigrations(committed: string[], applied: AppliedMigrationRow[]): string[] {
  const done = new Set(applied.filter((r) => r.finished_at && !r.rolled_back_at).map((r) => r.migration_name));
  return committed.filter((name) => !done.has(name)).sort();
}

export function pendingMigrationsMessage(pending: string[]): string {
  return (
    `Veritabanında uygulanmamış ${pending.length} migration var: ${pending.join(", ")}. ` +
    "Bu kod yayına alınırsa panel açılmaz (eksik kolon). Önce owner onayıyla migration'ı test DB'ye uygulayın " +
    "(npm run preflight:test-migration → prisma migrate deploy), sonra yeniden deploy edin."
  );
}
