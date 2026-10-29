/**
 * Ders Programı sayfa bildirimleri (2026-09-17). Önceden dört ayrı state
 * vardı ve her işlem yalnız kendisininkini yazıyordu: başarısız bir taşımanın
 * "Değişiklik uygulanmadı" hatası, sonraki başarılı işlemden sonra da ekranda
 * kalıyordu. Kural: sayfada AYNI ANDA tek bildirim — yeni işlem başlarken
 * hepsi temizlenir, sonuç yalnız kendi bildirimini gösterir.
 */
export type ProgramNotices<TCreated> = {
  gridError: string | null;
  actionSuccess: string | null;
  lastCreated: TCreated | null;
  seriesSuccess: { createdCount: number; skippedCount: number; skipped?: { startAt: string; message: string }[]; overriddenCount?: number } | null;
};

export function emptyProgramNotices<TCreated>(): ProgramNotices<TCreated> {
  return { gridError: null, actionSuccess: null, lastCreated: null, seriesSuccess: null };
}

/** Yalnız verilen bildirimi içeren yeni durum — önceki tüm bildirimler düşer. */
export function onlyNotice<TCreated>(notice: Partial<ProgramNotices<TCreated>>): ProgramNotices<TCreated> {
  return { ...emptyProgramNotices<TCreated>(), ...notice };
}
