/**
 * 9. tur — oda düzenleme (ad, şube, kapasite, enstrümanlar) kuralları. Saf, testli.
 *
 * Geçmiş dersler odaya `roomId` ile bağlıdır ve oda adını/şubesini canlı okur;
 * bu yüzden ad ve kapasite serbestçe düzeltilebilir. Planlanmış GELECEK dersleri
 * bozacak iki değişiklik engellenir (kullanıcıya ne yapacağı söylenir):
 *  - şube değişikliği: dersin şubesi ile odanın şubesi ayrışırdı;
 *  - bu derslerin kullandığı bir enstrümanın odadan çıkarılması.
 * Aynı şubede (silinmemiş) aynı adlı ikinci oda açılmaz — seçicilerde ayırt edilemez.
 */
import type { AppData, Room } from "./types";

export type RoomRevisionPatch = Partial<Pick<Room, "name" | "capacity" | "branchId" | "instruments">>;

function norm(value: string): string {
  // "PIYANO" (Türkçe olmayan klavye) ile "Piyano" aynı ad sayılır: ı/i farkı yok sayılır.
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("tr").replace(/ı/g, "i");
}

export function validateRoomRevision(
  data: Pick<AppData, "rooms" | "lessons">,
  roomId: string,
  patch: RoomRevisionPatch,
  now: Date = new Date()
): string | null {
  const room = data.rooms.find((r) => r.id === roomId);
  if (!room) return "Oda bulunamadı.";
  const nextName = patch.name?.trim() ?? room.name;
  const nextBranch = patch.branchId ?? room.branchId;
  const duplicate = data.rooms.find(
    (r) => r.id !== roomId && !r.deletedAt && r.branchId === nextBranch && norm(r.name) === norm(nextName)
  );
  if (duplicate) return `Bu şubede "${duplicate.name}" adlı başka bir oda var; farklı bir ad girin.`;

  const upcoming = data.lessons.filter(
    (l) => l.roomId === roomId && l.status === "scheduled" && new Date(l.startAt).getTime() > now.getTime()
  );
  if (patch.branchId && patch.branchId !== room.branchId && upcoming.length > 0) {
    return (
      `Bu odada ${upcoming.length} ileri tarihli planlı ders var; şubesi değiştirilemez (dersler eski şubede görünürdü). ` +
      "Önce bu dersleri Ders Programı'ndan başka bir odaya taşıyın ya da yeni şube için yeni bir oda oluşturun."
    );
  }
  if (patch.instruments) {
    const kept = new Set(patch.instruments);
    const blocked = Array.from(new Set(upcoming.map((l) => l.instrument).filter((i) => !kept.has(i))));
    if (blocked.length > 0) {
      const count = upcoming.filter((l) => blocked.includes(l.instrument)).length;
      return (
        `${blocked.join(", ")} enstrümanı bu odadaki ${count} ileri tarihli planlı derste kullanılıyor; listeden çıkarılamaz. ` +
        "Önce bu dersleri başka bir odaya taşıyın."
      );
    }
  }
  return null;
}
