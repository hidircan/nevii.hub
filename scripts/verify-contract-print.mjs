/**
 * P0 UAT (2026-09-07) — sözleşme yazdırma/PDF çıktısının GERÇEK tarayıcıda
 * doğrulanması: "indirilen PDF tamamen boş beyaz sayfa" regresyonu.
 *
 * Neyi ölçer:
 *  1. Baskı medyasında hesaplanan renkler (zemin açık mı, metin koyu mu),
 *  2. Kağıda düşen MÜREKKEP ORANI — "boş sayfa" bunun ~0 olmasıdır,
 *  3. Üretilen PDF'in byte uzunluğu ve sayfa sayısı,
 *  4. Baskı medyasında gerçekten boyanan metnin beklenen sabitleri içermesi.
 *
 * PDF'in İÇİNDEKİ metni ayrıştırmaz: Chromium alt-küme (subset) gömülü font
 * kullandığı için metin hex-CMap'e kodlanır ve bağımlılık eklemeden güvenilir
 * biçimde çıkarılamaz. Bunun yerine baskı medyasındaki DOM metni + mürekkep
 * oranı ölçülür; "boş sayfa" hatasını bu ikisi kesin olarak yakalar.
 *
 * `npm test` KAPSAMINDA DEĞİLDİR (Playwright + çalışan sunucu ister).
 * Kod tarafındaki kalıcı kilit: src/lib/__tests__/contract-print-blank-pdf.test.ts
 *
 * Kullanım:
 *   VERCEL=1 STORE_MODE=json JWT_SECRET=<yerel> PORT=3311 npm start
 *   node scripts/verify-contract-print.mjs <contractId> [baseUrl]
 * Playwright kurulu değilse: npx playwright install chromium
 */
import { createRequire } from "module";

const BASE = process.argv[3] ?? "http://localhost:3311";
const CONTRACT_ID = process.argv[2];
const EMAIL = process.env.VERIFY_EMAIL;
const PASSWORD = process.env.VERIFY_PASSWORD;

/** Boş sayfa eşikleri — ölçüldü: hatalı %0.39, sağlıklı %6.12. */
const MIN_INK_RATIO = 0.02;
const MIN_PDF_BYTES = 20_000;
const EXPECTED_SUBSTRINGS = ["Öğrenci Kayıt Sözleşmesi", "KVKK", "Taksit"];

if (!CONTRACT_ID) {
  console.error("Kullanım: node scripts/verify-contract-print.mjs <contractId> [baseUrl]");
  process.exit(2);
}
if (!EMAIL || !PASSWORD) {
  console.error("VERIFY_EMAIL ve VERIFY_PASSWORD ortam değişkenleri gerekli (kaynak: parola yöneticisi; repoya YAZILMAZ).");
  process.exit(2);
}

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("Playwright bulunamadı. Kurulum: npx playwright install chromium");
  process.exit(2);
}

const failures = [];
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASSWORD);
await Promise.all([
  page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 }),
  page.click('button[type="submit"]'),
]);

// Koyu tema profili — hatanın ORTAYA ÇIKTIĞI koşul; bilinçli olarak burada test edilir.
await ctx.addCookies([{ name: "notaplan_theme_profile", value: "obsidian", url: BASE }]);
await page.goto(`${BASE}/sozlesme-yazdir/${CONTRACT_ID}`, { waitUntil: "networkidle" });
await page.emulateMedia({ media: "print" });

const styles = await page.evaluate(() => {
  const surface = document.querySelector(".contract-print-surface");
  const heading = surface?.querySelector("h1");
  const lum = (rgb) => {
    const [r, g, b] = rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const bg = getComputedStyle(surface).backgroundColor;
  const fg = getComputedStyle(heading ?? surface).color;
  return { bg, fg, bgLum: lum(bg), fgLum: lum(fg), text: surface.innerText };
});

if (styles.bgLum < 0.8) failures.push(`baskı zemini açık değil: ${styles.bg}`);
if (styles.fgLum > 0.2) failures.push(`baskı metni koyu değil: ${styles.fg}`);
for (const needle of EXPECTED_SUBSTRINGS) {
  if (!styles.text.includes(needle)) failures.push(`baskı metninde beklenen ifade yok: "${needle}"`);
}

// Mürekkep oranı — kağıdı beyaz kabul edip boyanan pikselleri say.
const shot = await page.screenshot({ clip: { x: 0, y: 0, width: 820, height: 1000 } });
const analyzer = await browser.newPage();
const ink = await analyzer.evaluate(async (url) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const g = c.getContext("2d");
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] < 200 || d[i + 1] < 200 || d[i + 2] < 200) n++;
  return n / (c.width * c.height);
}, "data:image/png;base64," + shot.toString("base64"));
await analyzer.close();
if (ink < MIN_INK_RATIO) failures.push(`sayfa pratikte BOŞ: mürekkep oranı %${(ink * 100).toFixed(2)} < %${MIN_INK_RATIO * 100}`);

// Yazdırma diyaloğunun VARSAYILANI: arka plan grafikleri kapalı.
const pdf = await page.pdf({ format: "A4", printBackground: false });
const pdfText = pdf.toString("latin1");
const pages = (pdfText.match(/\/Type\s*\/Page[^s]/g) || []).length;
if (pdf.length < MIN_PDF_BYTES) failures.push(`PDF çok küçük: ${pdf.length} bayt`);
if (pages < 1) failures.push("PDF sayfa sayısı < 1");

console.log(`zemin=${styles.bg}  metin=${styles.fg}`);
console.log(`mürekkep=%${(ink * 100).toFixed(2)}  PDF=${pdf.length} bayt  sayfa=${pages}`);
await browser.close();

if (failures.length) {
  console.error("\nBAŞARISIZ:");
  for (const f of failures) console.error(" - " + f);
  process.exit(1);
}
console.log("\nPASS — sözleşme baskısı boş değil, koyu temada da okunur.");
