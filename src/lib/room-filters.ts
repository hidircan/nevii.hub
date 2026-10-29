import type { Room } from "./types";

/** Odalar ekranı filtreleri — yalnız görünümü daraltır, kayıtları değiştirmez. */
export type RoomStatusFilter = "aktif" | "pasif" | "tumu";

export interface RoomFilters {
  /** Şube id; boş = tüm şubeler. */
  sube: string;
  durum: RoomStatusFilter;
  /** Enstrüman adı; boş = hepsi. */
  enstruman: string;
  /** Oda adında arama (Türkçe büyük/küçük harf duyarsız). */
  q: string;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();

/** URL parametrelerinden filtre; tanınmayan durum değeri varsayılan "aktif"e düşer. */
export function parseRoomFilters(params: Params): RoomFilters {
  const durumRaw = one(params.durum);
  return {
    sube: one(params.sube),
    durum: durumRaw === "pasif" || durumRaw === "tumu" ? durumRaw : "aktif",
    enstruman: one(params.enstruman),
    q: one(params.q),
  };
}

export function isRoomFilterActive(f: RoomFilters): boolean {
  return f.sube !== "" || f.durum !== "aktif" || f.enstruman !== "" || f.q !== "";
}

/** Silinmiş odalar hiçbir filtrede görünmez (geçmiş dersler adı korur). Sonuç ada göre sıralıdır. */
export function filterRooms(rooms: Room[], f: RoomFilters): Room[] {
  const q = f.q.toLocaleLowerCase("tr");
  return rooms
    .filter((r) => !r.deletedAt)
    .filter((r) => (f.durum === "tumu" ? true : f.durum === "pasif" ? r.active === false : r.active !== false))
    .filter((r) => !f.sube || r.branchId === f.sube)
    .filter((r) => !f.enstruman || (r.instruments as string[]).includes(f.enstruman))
    .filter((r) => !q || r.name.toLocaleLowerCase("tr").includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
}
