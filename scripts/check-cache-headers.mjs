/**
 * check-cache-headers.mjs — GET /api rotalarında Cache-Control denetimi.
 *
 * NE YAPAR:
 *   - src/app/api altındaki her route.ts içinde GET export'u arar.
 *   - Dosya/ek sunan rotalar (…/file, …/photo, signed-file, source-file, cv,
 *     export, receipt, platform-logo, …/html, …/print) açık Cache-Control
 *     taşımak ZORUNDA — yoksa HATA (exit 1). Gerekçe: bu rotalar her istekte
 *     DB/Storage'dan tam bayt okur; header'sız yanıt ne tarayıcıda ne CDN'de
 *     öngörülebilir şekilde önbelleğe alınır ve Supabase egress'ini şişirir.
 *   - Diğer GET rotaları listelenir ama durdurmaz (UYARI) — JSON API'lerin
 *     çoğu kullanıcıya özel veri döner, körlemesine cache YANLIŞ olur.
 *
 * KULLANIM: node scripts/check-cache-headers.mjs   (CI'da otomatik koşar)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const API_ROOT = new URL("../src/app/api", import.meta.url);
const GET_RE = /export\s+(const\s+GET|async\s+function\s+GET)\b/;
const ENFORCED_RE =
  /(\/file\/|\/photo\/|signed-file|source-file|\/cv\/|\/export|platform-logo|\/receipt|\/print|\/html)/;

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e === "route.ts") out.push(p);
  }
  return out;
}

const routes = walk(API_ROOT.pathname);
let getCount = 0;
const errors = [];
const warnings = [];

for (const abs of routes) {
  const rel = abs.slice(API_ROOT.pathname.length - "/src/app/api".length);
  const src = readFileSync(abs, "utf8");
  if (!GET_RE.test(src)) continue;
  getCount += 1;
  if (src.includes("Cache-Control")) continue;
  if (ENFORCED_RE.test(rel)) errors.push(rel);
  else warnings.push(rel);
}

for (const r of errors) console.log(`CACHE-ERROR: ${r} — GET dosya/ek sunuyor ama Cache-Control yok.`);
const shown = warnings.slice(0, 30);
for (const r of shown) console.log(`CACHE-WARN: ${r} — GET rotasında Cache-Control yok (bilinçliyse sorun değil).`);
if (warnings.length > shown.length) console.log(`CACHE-WARN: ... ve ${warnings.length - shown.length} rota daha.`);
console.log(`cache-headers: ${routes.length} rota tarandı, ${getCount} GET; ${errors.length} hata, ${warnings.length} uyarı.`);
if (errors.length > 0) {
  console.log("cache-headers: BAŞARISIZ — dosya sunan rotalara açık Cache-Control ekle.");
  process.exit(1);
}
