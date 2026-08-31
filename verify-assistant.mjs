import { chromium } from "playwright";
import fs from "node:fs";

const SHOT_DIR = "/tmp/assistant-screenshots";
fs.mkdirSync(SHOT_DIR, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (err) => errors.push(String(err)));

let failures = 0;
function check(label, ok) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}`);
  if (!ok) failures++;
}

async function shot(name) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
}

const FAB = 'button[aria-label="AI Asistanı aç"]';
const DIALOG = '[role="dialog"][aria-label="Nevii Hub AI"]';

console.log("\n== 1) /login — no FAB, no popup ==");
await page.goto("http://localhost:3000/login");
await page.waitForSelector("text=Giriş yap");
await page.waitForTimeout(1200); // let any client auth-check settle
check("FAB absent on /login", (await page.locator(FAB).count()) === 0);
check("dialog absent on /login", (await page.locator(DIALOG).count()) === 0);
await shot("01-login");

console.log("\n== log in as SCHOOL_ADMIN ==");
await page.fill('input[type="email"]', "admin@niluferacar.com.tr");
await page.fill('input[type="password"]', "demo-admin");
await page.click('button[type="submit"]');
await page.waitForURL("**/panel");
await page.waitForSelector(FAB, { timeout: 8000 });

console.log("\n== 2) authenticated panel page — only the small FAB, no open surface ==");
const fabBox = await page.locator(FAB).boundingBox();
check("FAB visible with a compact ~52px box", !!fabBox && fabBox.width >= 48 && fabBox.width <= 56 && fabBox.height >= 48 && fabBox.height <= 56);
const dialogOpacity0 = await page.locator(DIALOG).evaluate((el) => getComputedStyle(el).opacity);
check("popup surface not visually open (opacity 0) before clicking FAB", Number(dialogOpacity0) === 0);
await shot("02-fab-only");

console.log("\n== 3) click FAB — compact popup opens ==");
await page.click(FAB);
await page.waitForTimeout(300); // let the 200ms open transition settle
await page.waitForSelector("text=Genel asistan");
await shot("03-popup-open");

console.log("\n== 4) popup is compact everywhere — never a side panel or fullscreen ==");
async function assertCompactPopup(label) {
  const box = await page.locator(DIALOG).boundingBox();
  const vp = page.viewportSize();
  check(
    `${label}: width in 320-370px range (not a ${vp.width}px-wide side panel)`,
    !!box && box.width >= 320 && box.width <= 370
  );
  check(
    `${label}: height in 400-560px range (not fullscreen ${vp.height}px)`,
    !!box && box.height >= 400 && box.height <= 560
  );
  // "not edge-to-edge" is only a meaningful signal on a viewport that's
  // comfortably larger than the popup itself (desktop). On a narrow phone
  // viewport a fixed ~352px-wide popup is legitimately most of the screen
  // width by spec ("mümkün olan en büyük ama yine popup/dialog karakterinde
  // kompakt bir alan") — the absolute width/height ranges above are what
  // actually prove it isn't a true 100vw/100vh fullscreen takeover there.
  if (vp.width >= 900) {
    check(`${label}: does not cover majority of viewport`, !!box && box.width * box.height < 0.5 * vp.width * vp.height);
  }
  return box;
}
await assertCompactPopup("desktop 1400x900");

// no expand/panel/fullscreen controls should exist at all anymore
check("no 'Genişlet' (expand) control present", (await page.locator('[aria-label="Genişlet"]').count()) === 0);
check("no 'Daralt' (collapse) control present", (await page.locator('[aria-label="Daralt"]').count()) === 0);
check("no 'Küçült' control present", (await page.locator('[aria-label="Küçült"]').count()) === 0);

console.log("\n== mobile viewport — still compact, never fullscreen ==");
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(200);
await assertCompactPopup("mobile 390x844");
await shot("04-mobile-compact-popup");
await page.setViewportSize({ width: 1400, height: 900 });
await page.waitForTimeout(200);

console.log("\n== 5) Escape closes the popup ==");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
const closedOpacity = await page.locator(DIALOG).evaluate((el) => getComputedStyle(el).opacity);
check("Escape closes popup (opacity back to 0)", Number(closedOpacity) === 0);
check("FAB reappears after Escape-close", (await page.locator(FAB).boundingBox().then((b) => b?.width)) > 0);
await shot("05-after-escape");

console.log("\n== 6) drag the popup from its header ==");
await page.click(FAB);
await page.waitForTimeout(300);
const before = await page.locator(DIALOG).boundingBox();
const headerHandle = page.locator(DIALOG).locator("> div").first(); // header row = dialog's first child
await headerHandle.hover();
await page.mouse.down();
await page.mouse.move(before.x - 220, before.y - 260, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(150);
const after = await page.locator(DIALOG).boundingBox();
check("popup moved after header drag", Math.abs(after.x - before.x) > 100 && Math.abs(after.y - before.y) > 100);
await shot("06-after-drag");

console.log("\n== 7) close button + composer still work post-drag ==");
await page.fill('input[placeholder="Mesajınızı yazın…"]', "Hangi modelsin?");
await page.click('button[aria-label="Gönder"]');
await page.waitForFunction(() => document.body.innerText.includes("kullanıyorum") || document.body.innerText.includes("heuristic"), { timeout: 15000 });
check("message sent + answered after drag", true);
await shot("07-chat-works-after-drag");
await page.click('button[aria-label="Kapat"]');
await page.waitForTimeout(300);
const closedAfterX = await page.locator(DIALOG).evaluate((el) => getComputedStyle(el).opacity);
check("close (X) button closes the popup", Number(closedAfterX) === 0);

console.log("\n== drag does not move a button click (clicking close doesn't drag) ==");
await page.click(FAB);
await page.waitForTimeout(300);
const beforeClickBox = await page.locator(DIALOG).boundingBox();
await page.click('button[aria-label="Kapat"]');
await page.waitForTimeout(300);
check("clicking the header's close button closed it (not just started a drag)", Number(await page.locator(DIALOG).evaluate((el) => getComputedStyle(el).opacity)) === 0);
void beforeClickBox;

console.log("\n== 8) page context + persisted conversation survive real client-side navigation ==");
await page.click(FAB);
await page.waitForTimeout(300);
await page.locator('a[href="/panel/odemeler"]').first().click();
await page.waitForURL("**/panel/odemeler");
await page.locator('a[href="/panel/odemeler/s1"]').first().click();
await page.waitForURL("**/panel/odemeler/s1");
await page.waitForSelector("h1:has-text('Zeynep Arslan')");
await page.waitForTimeout(300);
check("popup still open after client-side nav", Number(await page.locator(DIALOG).evaluate((el) => getComputedStyle(el).opacity)) === 1);
check("earlier message ('Hangi modelsin?') still present (conversation persisted)", (await page.locator("text=Hangi modelsin?").count()) > 0);
check("header now shows page entity 'Zeynep Arslan'", (await page.locator(`${DIALOG} >> text=Zeynep Arslan`).count()) > 0);
check("entity-specific quick action present ('Bakiyesini göster')", (await page.locator("text=Bakiyesini göster").count()) > 0);
await shot("08-context-aware-after-nav");
await assertCompactPopup("still compact after navigation");

console.log("\n=== console/page errors captured ===");
console.log(errors.length ? errors : "none");

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
