import { describe, it, expect } from "vitest";
import { filterRooms, isRoomFilterActive, parseRoomFilters } from "../room-filters";
import type { Room } from "../types";

const room = (id: string, over: Partial<Room> = {}): Room => ({
  id,
  name: id,
  branchId: "erzene",
  capacity: 2,
  instruments: ["Piyano"],
  ...over,
});
const rooms: Room[] = [
  room("Piyano 2"),
  room("Bateri", { branchId: "evka3", instruments: ["Bateri"] }),
  room("Piyano 1", { active: false }),
  room("Eski", { active: false, deletedAt: "2026-09-01T00:00:00.000Z" }),
];
const names = (p: Record<string, string>) => filterRooms(rooms, parseRoomFilters(p)).map((r) => r.name);

describe("Odalar filtreleri", () => {
  it("varsayılan: yalnız aktif, silinmiş hiç görünmez, ada göre sıralı", () => {
    expect(names({})).toEqual(["Bateri", "Piyano 2"]);
    expect(isRoomFilterActive(parseRoomFilters({}))).toBe(false);
  });
  it("durum pasif / tümü; tanınmayan değer aktif'e düşer", () => {
    expect(names({ durum: "pasif" })).toEqual(["Piyano 1"]);
    expect(names({ durum: "tumu" })).toEqual(["Bateri", "Piyano 1", "Piyano 2"]);
    expect(names({ durum: "xyz" })).toEqual(["Bateri", "Piyano 2"]);
  });
  it("şube + enstrüman + ad birlikte daraltır; uyuşmayan birleşim boş döner", () => {
    expect(names({ sube: "evka3" })).toEqual(["Bateri"]);
    expect(names({ durum: "tumu", enstruman: "Piyano", q: "piyano 1" })).toEqual(["Piyano 1"]);
    expect(names({ sube: "evka3", enstruman: "Piyano" })).toEqual([]);
  });
});
