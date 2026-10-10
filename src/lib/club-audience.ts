/**
 * Kulüp yaş grubu — istemci ve sunucu ortak TEK kaynak (sunucu modülü `clubs.ts` istemciye paketlenemez).
 * 2026-10-07: "youth" (Genç) eklendi. Sayısal yaş sınırı veya otomatik uygunluk kuralı DEĞİLDİR; yaş sınırları
 * kulüpte ayrı (`minAge`/`maxAge`) girilir. DB'de serbest metin (TEXT) saklanır; geçerli değerler burada.
 */
export type ClubAudience = "child" | "youth" | "adult";
/** Seçim sırası (formlar/filtreler buradan okur). */
export const CLUB_AUDIENCES: ClubAudience[] = ["child", "youth", "adult"];
export const CLUB_AUDIENCE_LABEL: Record<ClubAudience, string> = { child: "Çocuk", youth: "Genç", adult: "Yetişkin" };
export const isClubAudience = (v: unknown): v is ClubAudience => typeof v === "string" && (CLUB_AUDIENCES as string[]).includes(v);
