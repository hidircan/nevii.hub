/**
 * 10. tur iş #5 — silme diyaloglarında her karakterde odak kaybı.
 *
 * KÖK NEDEN: `ModalShell` odak efekti `[open, busy, onClose]` bağımlıydı ve
 * TÜM kullanıcılar satır-içi (her render'da yeni kimlikli) `onClose`
 * veriyordu → gerekçe alanına yazılan HER karakterde efekt yeniden koşup
 * odağı panele çekiyor, temizlikteki `trigger?.focus?.()` tetikleyiciye
 * sıçratıyordu. Düzeltme: odak YALNIZCA açılış geçişinde alınır, `busy`/
 * `onClose` güncelliği ref aynasıyla korunur.
 *
 * Bu dosya deseni statik olarak kilitler (repo'da DOM test altyapısı yok —
 * bkz. student-search-typing.test.ts uzlaşımı). Davranış, UAT'ta tarayıcıyla
 * doğrulanır (öğrenci toplu "Silinenlere taşı" + tekli silme adım 2).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const root = (...p: string[]) => join(process.cwd(), ...p);
const modalShell = () => readFileSync(root("src/components/modal-shell.tsx"), "utf8");
const singleDialog = () => readFileSync(root("src/components/student-delete-dialog.tsx"), "utf8");
const criticalDialog = () => readFileSync(root("src/components/critical-delete-dialog.tsx"), "utf8");
const bulkBar = () => readFileSync(root("src/components/students-bulk-bar.tsx"), "utf8");

describe("modal odak yönetimi — geçiş-odak deseni", () => {
  it("ModalShell: odak efekti YALNIZCA [open] geçişinde koşar (onClose/busy bağımlılığı YOK)", () => {
    const src = modalShell();
    // Efekt kapanışı tam olarak `}, [open]);` olmalı — onClose/busy yeniden koşturmamalı.
    expect(src).toMatch(/\}, \[open\]\);/);
    expect(src).not.toMatch(/\}, \[open, busy/);
    expect(src).not.toMatch(/\}, \[open, busy, onClose\]\)/);
    // Güncellik ref aynasıyla korunur (bayat kapanma yok).
    expect(src).toContain("busyRef.current = busy");
    expect(src).toContain("onCloseRef.current = onClose");
    expect(src).toContain("!busyRef.current");
    expect(src).toContain("onCloseRef.current()");
    // Kapanışta odak tetikleyiciye döner (erişilebilirlik).
    expect(src).toContain("triggerRef.current?.focus?.()");
  });

  it("tekli + kritik silme diyalogları aynı deseni kullanır (busy odağı çekmez)", () => {
    for (const src of [singleDialog(), criticalDialog()]) {
      expect(src).toMatch(/\}, \[open\]\);/);
      expect(src).not.toMatch(/\}, \[open, busy\]\)/);
      expect(src).toContain("busyRef.current = busy");
      expect(src).toContain("triggerRef.current?.focus?.()");
    }
  });

  it("gerekçe alanları IME-güvenli: onChange değeri dönüştürmez, sınır maxLength ile", () => {
    for (const [name, src] of [
      ["single", singleDialog()],
      ["critical", criticalDialog()],
      ["bulk", bulkBar()],
    ] as const) {
      // onChange içinde .slice()/.trim() gibi değer dönüşümü IME birleşimini bozar.
      expect(src, name).not.toMatch(/onChange=\{\(e\) => set\w+\(e\.target\.value\.slice/);
      expect(src, name).not.toMatch(/onChange=\{\(e\) => set\w+\(e\.target\.value\.trim/);
    }
    // 500 karakter sınırı korunur (sunucu z.string().max(500) ile aynı).
    expect(singleDialog()).toContain("maxLength={500}");
    expect(criticalDialog()).toContain("maxLength={500}");
    expect(bulkBar()).toContain("maxLength={500}");
  });

  it("kritik doğrulama zayıflatılmadı: gerekçe + ad teyidi + kritik şifre ZORUNLU", () => {
    // Tekli: min 5 karakter gerekçe + ad teyidi + şifre.
    expect(singleDialog()).toMatch(/reason\.trim\(\)\.length >= 5/);
    expect(singleDialog()).toContain("criticalPassword");
    // Toplu: aynı kural.
    expect(bulkBar()).toMatch(/reason\.trim\(\)\.length >= 5 && password\.length > 0/);
    // Kritik: aynı kural.
    expect(criticalDialog()).toMatch(/reason\.trim\(\)\.length >= 5/);
  });

  it("ekran okuyucu: diyaloglar role/aria taşır, gerekçe alanları etiketlidir", () => {
    for (const src of [modalShell(), singleDialog(), criticalDialog()]) {
      expect(src).toContain('role="dialog"');
      expect(src).toContain("aria-modal");
      expect(src).toContain("aria-labelledby");
    }
    expect(singleDialog()).toContain("Silme gerekçesi");
    expect(bulkBar()).toContain("Silme gerekçesi");
  });
});
