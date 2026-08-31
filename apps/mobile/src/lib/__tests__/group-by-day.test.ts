import { describe, it, expect } from "vitest";
import { groupByDay } from "../group-by-day";

type Item = { id: string; createdAt?: string };

describe("groupByDay", () => {
  it("en yeniden en eskiye sıralar", () => {
    const items: Item[] = [
      { id: "old", createdAt: "2020-01-01T00:00:00.000Z" },
      { id: "new", createdAt: "2024-01-01T00:00:00.000Z" },
    ];
    const groups = groupByDay(items, (i) => i.createdAt);
    const flat = groups.flatMap((g) => g.items.map((i) => i.id));
    expect(flat).toEqual(["new", "old"]);
  });

  it("aynı güne düşen ardışık öğeleri tek grupta toplar", () => {
    const items: Item[] = [
      { id: "a", createdAt: "2024-01-01T08:00:00.000Z" },
      { id: "b", createdAt: "2024-01-01T20:00:00.000Z" },
      { id: "c", createdAt: "2023-06-01T08:00:00.000Z" },
    ];
    const groups = groupByDay(items, (i) => i.createdAt);
    expect(groups).toHaveLength(2);
    // Grup içinde de en yeniden en eskiye sıralanır: "b" (20:00) "a" (08:00)'dan önce gelir.
    expect(groups[0]!.items.map((i) => i.id)).toEqual(["b", "a"]);
    expect(groups[1]!.items.map((i) => i.id)).toEqual(["c"]);
  });

  it("tarihi olmayan öğeler 'Tarihsiz' grubuna düşer", () => {
    const items: Item[] = [{ id: "no-date" }];
    const groups = groupByDay(items, (i) => i.createdAt);
    expect(groups).toEqual([{ label: "Tarihsiz", items: [{ id: "no-date" }] }]);
  });

  it("boş liste için boş grup dizisi döner", () => {
    expect(groupByDay<Item>([], (i) => i.createdAt)).toEqual([]);
  });
});
