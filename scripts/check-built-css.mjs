/**
 * Derleme kapısı: globals.css'teki her @keyframes çıkan CSS'te olmalı. Bayat derleme önbelleği
 * kuralları sessizce düşürdüğünde (2026-10-30) derleme burada durur; Vercel önceki sağlam
 * deployment'ı sunmaya devam eder.
 */
import fs from "node:fs";
import path from "node:path";

function cssFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(full);
    return entry.name.endsWith(".css") ? [full] : [];
  });
}

const source = fs.readFileSync("src/app/globals.css", "utf8");
const names = [...new Set([...source.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]))];
// Yalnız yayınlanan klasör: `.next/dev` altındaki geliştirme kopyaları eksikliği gizlerdi.
const files = cssFiles(".next/static");
if (files.length === 0) {
  console.warn("[css-kapisi] .next/static altinda CSS bulunamadi; kontrol atlandi.");
  process.exit(0);
}
const built = files.map((f) => fs.readFileSync(f, "utf8")).join("\n");
const missing = names.filter((name) => !built.includes(`@keyframes ${name}`));
if (missing.length > 0) {
  console.error(`[css-kapisi] Derlenen CSS bayat, eksik: ${missing.join(", ")}. Build onbellegini temizleyip yeniden derleyin.`);
  process.exit(1);
}
console.log(`[css-kapisi] ${names.length} animasyon derlenen CSS'te var.`);
