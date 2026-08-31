import { describe, it, expect } from "vitest";
import {
  addDays,
  format,
  formatCurrency,
  isSameDay,
  relativeDayLabel,
  shortDayMonth,
  startOfDay,
  startOfWeek,
  weekdayName,
} from "../date";

describe("format", () => {
  it("yyyy-MM-dd biçimlendirir", () => {
    expect(format(new Date(2024, 0, 3), "yyyy-MM-dd")).toBe("2024-01-03");
  });

  it("HH:mm biçimlendirir, sıfırla doldurur", () => {
    expect(format(new Date(2024, 0, 3, 9, 5), "HH:mm")).toBe("09:05");
  });
});

describe("weekdayName", () => {
  it("Türkçe gün adı döner", () => {
    expect(weekdayName(new Date(2024, 0, 3))).toBe("Çarşamba"); // 2024-01-03
  });
});

describe("shortDayMonth", () => {
  it("gün + kısa ay adı döner", () => {
    expect(shortDayMonth(new Date(2024, 7, 26))).toBe("26 Ağu");
  });
});

describe("relativeDayLabel", () => {
  const now = new Date(2024, 0, 10);

  it("bugün için 'Bugün' döner", () => {
    expect(relativeDayLabel(new Date(2024, 0, 10, 22), now)).toBe("Bugün");
  });

  it("yarın için 'Yarın' döner", () => {
    expect(relativeDayLabel(new Date(2024, 0, 11), now)).toBe("Yarın");
  });

  it("dün için 'Dün' döner", () => {
    expect(relativeDayLabel(new Date(2024, 0, 9), now)).toBe("Dün");
  });

  it("diğer günler için tarih + gün adı döner", () => {
    expect(relativeDayLabel(new Date(2024, 0, 15), now)).toBe("15 Oca, Pazartesi");
  });
});

describe("startOfDay", () => {
  it("saat/dakikayı sıfırlar", () => {
    const d = startOfDay(new Date(2024, 0, 3, 18, 45));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getDate()).toBe(3);
  });
});

describe("startOfWeek", () => {
  it("Çarşamba için o haftanın Pazartesi'sini döner", () => {
    const wednesday = new Date(2024, 0, 3); // 2024-01-03 = Çarşamba
    const monday = startOfWeek(wednesday);
    expect(monday.getFullYear()).toBe(2024);
    expect(monday.getMonth()).toBe(0);
    expect(monday.getDate()).toBe(1); // 2024-01-01 = Pazartesi
  });

  it("Pazar için önceki Pazartesi'yi döner", () => {
    const sunday = new Date(2024, 0, 7); // 2024-01-07 = Pazar
    const monday = startOfWeek(sunday);
    expect(monday.getDate()).toBe(1);
  });

  it("Pazartesi için kendisini döner", () => {
    const monday = new Date(2024, 0, 1);
    expect(startOfWeek(monday).getDate()).toBe(1);
  });
});

describe("addDays", () => {
  it("gün ekler", () => {
    const d = addDays(new Date(2024, 0, 1), 6);
    expect(d.getDate()).toBe(7);
  });

  it("negatif gün ile geri gider", () => {
    const d = addDays(new Date(2024, 0, 1), -1);
    expect(d.getMonth()).toBe(11);
    expect(d.getDate()).toBe(31);
  });
});

describe("isSameDay", () => {
  it("aynı gün farklı saatler için true döner", () => {
    expect(isSameDay(new Date(2024, 0, 1, 8), new Date(2024, 0, 1, 20))).toBe(true);
  });

  it("farklı günler için false döner", () => {
    expect(isSameDay(new Date(2024, 0, 1), new Date(2024, 0, 2))).toBe(false);
  });
});

describe("formatCurrency", () => {
  it("TL biçiminde, küsuratsız formatlar", () => {
    const result = formatCurrency(1500);
    expect(result).toContain("1.500");
    expect(result).toContain("₺");
  });
});
