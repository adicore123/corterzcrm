import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, request } from "playwright";
import sharp from "sharp";
import { BoxGeometry } from "three";

const root = await mkdtemp(join(tmpdir(), "cortez-e2e-"));
const adminPassword = randomUUID();
const employeePassword = randomUUID();
const env = { ...process.env, VERCEL: "0", CORTEZ_STORAGE_BACKEND: "file", CORTEZ_STORAGE_DIR: root, CORTEZ_ADMIN_PASSWORD: adminPassword };
const hold = createServer();
await new Promise((resolve) => hold.listen(0, "127.0.0.1", resolve));
const { port } = hold.address();
await new Promise((resolve) => hold.close(resolve));
const baseURL = "http://127.0.0.1:" + port;
env.CORTEZ_ORIGIN = baseURL;
let server;
let browser;
let anonymous;
let output = "";
const pageErrors = [];
let stage = "bootstrap";

function collect(process) {
  for (const stream of [process.stdout, process.stderr]) stream.on("data", (chunk) => {
    output = (output + chunk.toString()).slice(-12_000);
  });
  return process;
}

async function stop() {
  if (!server || server.exitCode !== null || server.signalCode) return;
  await new Promise((resolve) => {
    server.once("exit", resolve);
    server.kill();
  });
}

async function start() {
  server = collect(spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { env }));
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error("The production server exited early.");
    const response = await fetch(baseURL + "/login").catch(() => null);
    if (response?.ok) return;
    await delay(120);
  }
  throw new Error("The production server did not become ready.");
}

const button = (page, name) => page.getByRole("button", { name, exact: true });
const link = (page, name) => page.getByRole("link", { name, exact: true });
const field = (page, name) => page.getByLabel(name, { exact: true });
const heading = (page, name) => page.getByRole("heading", { name, exact: true });
async function visible(locator) { await locator.waitFor({ state: "visible" }); }

async function login(page, username, password) {
  await field(page, "שם משתמש").fill(username);
  await field(page, "סיסמה").fill(password);
  await button(page, "כניסה למערכת").click();
}

async function save(page, kind) {
  await button(page, "שמירה").click();
  await page.waitForURL(new RegExp("/" + kind + "/[\\da-f-]+\\?saved=1$"));
  await visible(page.getByText("השינויים נשמרו בהצלחה."));
  return new URL(page.url()).pathname;
}

async function readDb(file) {
  return JSON.parse(await readFile(join(root, "data", file + ".json"), "utf8"));
}

async function api(context, method, endpoint, data, status, headers = {}) {
  const response = await context.fetch(endpoint, { method, data, headers: { Origin: baseURL, ...headers } });
  assert.equal(response.status(), status, method + " " + endpoint + " " + await response.text());
  return response.json();
}

function captureErrors(page) {
  page.on("pageerror", (err) => pageErrors.push(err.message));
}

async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, "Horizontal overflow at " + page.url());
}

try {
  const bootstrap = collect(spawn(process.execPath, ["--import", "tsx", "scripts/create-admin.ts", "qa-admin", "מנהל בדיקה"], { env }));
  assert.equal(await new Promise((resolve) => bootstrap.once("exit", resolve)), 0, "Could not create isolated admin.");
  delete env.CORTEZ_ADMIN_PASSWORD;
  await start();
  browser = await chromium.launch({ channel: process.env.CORTEZ_TEST_BROWSER || "chrome" });
  anonymous = await request.newContext({ baseURL });
  const desktop = await browser.newContext({ baseURL, viewport: { width: 1487, height: 1058 } });
  desktop.setDefaultTimeout(8000);
  desktop.setDefaultNavigationTimeout(12000);
  const admin = await desktop.newPage();
  captureErrors(admin);
  stage = "unauthenticated and desktop dashboard";
  await admin.goto("/dashboard");
  await admin.waitForURL("**/login");
  assert.equal(await admin.locator("html").getAttribute("dir"), "rtl");
  await login(admin, "qa-admin", "wrong-password");
  await visible(admin.getByText("שם המשתמש או הסיסמה שגויים."));
  await login(admin, "qa-admin", adminPassword);
  await admin.waitForURL("**/dashboard");
  await visible(heading(admin, "סקירה כללית"));
  await admin.evaluate(() => document.fonts.ready);
  assert.deepEqual(await admin.locator(".metric-copy strong").allTextContents(), ["0", "0", "0", "0"]);
  if (process.env.CORTEZ_QA_SCREENSHOTS) await admin.screenshot({ path: join(process.env.CORTEZ_QA_SCREENSHOTS, "cortez-desktop.png") });
  await button(admin, "כיווץ סרגל ניווט").click();
  assert.equal(await admin.locator(".app-shell.is-collapsed").count(), 1);
  await button(admin, "הרחבת סרגל ניווט").click();
  assert.equal(await admin.locator(".app-shell.is-collapsed").count(), 0);

  stage = "mobile standards workflow";
  const mobile = await browser.newContext({
    baseURL, storageState: await desktop.storageState(), viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  });
  mobile.setDefaultTimeout(8000);
  mobile.setDefaultNavigationTimeout(12000);
  const page = await mobile.newPage();
  captureErrors(page);
  await page.goto("/dashboard");
  await noOverflow(page);
  if (process.env.CORTEZ_QA_SCREENSHOTS) await page.screenshot({ path: join(process.env.CORTEZ_QA_SCREENSHOTS, "cortez-mobile.png") });
  await button(page, "פתיחת תפריט").click();
  await visible(page.getByRole("dialog", { name: "תפריט ניווט" }));
  await button(page, "סגירת תפריט").click();
  await link(page, "תיק מכון תקנים").click();
  await visible(heading(page, "תיק מכון תקנים חדש"));
  await field(page, "מספר תיק").fill("TEST-100");
  await field(page, "סוג מכשיר").selectOption("אופניים חשמליים");
  await field(page, "שם הדגם").fill("דגם בדיקה 2");
  await link(page, "ביטול").click();
  const unsavedDialog = page.getByRole("alertdialog", { name: "יציאה ללא שמירה" });
  await visible(unsavedDialog);
  await button(unsavedDialog, "המשך עריכה").click();
  await unsavedDialog.waitFor({ state: "hidden" });
  assert.match(page.url(), /\/standards\/new$/);
  await field(page, "סטטוס טיפול").selectOption("בטיפול");
  await field(page, "סטטוס עיכוב").selectOption("מתעכב");
  await button(page, "שמירה").click();
  await visible(page.getByText("יש להזין סיבת עיכוב."));
  await field(page, "סיבת עיכוב").fill("ממתינים לאישור");
  await button(page, "הוספת משימה").click();
  await field(page, "שם משימה 1").fill("בדיקת בלמים");
  await button(page, "הוספת משימה").click();
  await field(page, "שם משימה 2").fill("בדיקת תאורה");
  await field(page, "סימון משימה 1 כהושלמה").check();
  const buffer = await sharp({ create: { width: 28, height: 32, channels: 3, background: "#bf1619" } }).jpeg().toBuffer();
  const photo = { buffer, name: "test.jpg", mimeType: "image/jpeg" };
  await page.locator('input[capture="environment"]').setInputFiles(photo);
  await field(page, "בחירת תמונות").setInputFiles(photo);
  await visible(button(page, "תמונה 2"));
  await noOverflow(page);
  if (process.env.CORTEZ_QA_SCREENSHOTS) await page.screenshot({ path: join(process.env.CORTEZ_QA_SCREENSHOTS, "cortez-form.png"), fullPage: true });
  const standardPath = await save(page, "standards");
  const standardId = standardPath.split("/").pop();
  const [original] = await readDb("standard-cases");
  assert.equal(original.number, "TEST-100");
  assert.equal(original.status, "בטיפול");
  assert.equal(original.delay, "מתעכב");
  assert.equal(original.tasks.length, 2);
  assert.equal(original.tasks[0].done, true);
  assert.equal(original.photos.length, 2);
  const imagePath = "/api/images/standards/" + standardId + "/" + original.photos[0].id;
  assert.equal((await anonymous.get(imagePath)).status(), 401);
  assert.equal((await mobile.request.get(imagePath)).headers()["content-type"], "image/webp");
  assert.deepEqual(await readdir(join(root, "uploads", "standards")), original.photos.map((item) => item.id + ".webp").sort());
  await button(page, "תמונה 1").click();
  await visible(page.getByRole("dialog", { name: "תמונה 1" }));
  await button(page, "סגירה").click();
  await button(page, "סימון משימה כהושלמה: בדיקת תאורה").click();
  await visible(button(page, "ביטול סימון משימה: בדיקת תאורה"));
  await link(page, "עריכה").click();
  await field(page, "סטטוס טיפול").selectOption("הסתיים");
  await button(page, "מחיקת משימה 2").click();
  const delTaskPwd = page.getByRole("alertdialog", { name: "אישור מחיקה באמצעות סיסמה" });
  await visible(delTaskPwd);
  await delTaskPwd.getByLabel("סיסמת מחיקה").fill("0000");
  await button(delTaskPwd, "מחיקה").click();
  await visible(delTaskPwd.getByText("סיסמת המחיקה שגויה."));
  await delTaskPwd.getByLabel("סיסמת מחיקה").fill("5522");
  await button(delTaskPwd, "מחיקה").click();
  await delTaskPwd.waitFor({ state: "hidden" });

  await button(page, "הסרת תמונה 2").click();
  const delPhotoPwd = page.getByRole("alertdialog", { name: "אישור מחיקה באמצעות סיסמה" });
  await visible(delPhotoPwd);
  await delPhotoPwd.getByLabel("סיסמת מחיקה").fill("5522");
  await button(delPhotoPwd, "מחיקה").click();
  await delPhotoPwd.waitFor({ state: "hidden" });

  await save(page, "standards");
  const [updated] = await readDb("standard-cases");
  assert.deepEqual([updated.status, updated.delay, updated.tasks.length, updated.photos.length], ["הסתיים", "מתעכב", 1, 1]);
  assert.equal(updated.number, original.number);
  assert.equal((await mobile.request.get("/api/images/standards/" + standardId + "/" + original.photos[1].id)).status(), 404);
  await page.goto("/standards");
  await field(page, "חיפוש לפי מספר תיק או דגם").fill(original.number);
  await field(page, "סינון לפי סטטוס").selectOption("הסתיים");
  await field(page, "סינון עיכובים").selectOption("מתעכב");
  await field(page, "מיון רשומות").selectOption("oldest");
  await button(page, "חיפוש").click();
  await visible(link(page, original.number));
  await visible(page.locator(".mobile-record-card"));
  await visible(page.locator(".standard-status-block"));
  if (process.env.CORTEZ_QA_SCREENSHOTS) await page.screenshot({ path: join(process.env.CORTEZ_QA_SCREENSHOTS, "standards-mobile.png") });

  // Switch status inline right from mobile card without opening the record.
  await button(page, "סטטוס בטיפול עבור " + original.number).click();
  await visible(page.locator(".standard-status-block.is-active"));
  await page.goto("/standards?q=" + encodeURIComponent(original.number));
  await visible(page.locator(".standard-status-block.is-active"));
  await button(page, "סטטוס הסתיים עבור " + original.number).click();
  await visible(page.locator(".standard-status-block.is-done"));

  const mobileWaHref = await page.locator(".mobile-record-card .mobile-action-btn.is-whatsapp").first().getAttribute("href");
  assert.ok(mobileWaHref?.startsWith("https://wa.me/972525510004?text="));
  assert.match(decodeURIComponent(mobileWaHref), new RegExp(original.number));
  await visible(page.locator(".mobile-record-card .mobile-photo-strip"));
  await page.locator(".mobile-record-card .mobile-photo-thumb").first().click();
  await visible(page.getByRole("dialog", { name: "תמונות · דגם בדיקה 2" }));
  await button(page, "סגירת גלריית תמונות").click();
  await noOverflow(page);

  await admin.goto("/standards");
  await visible(admin.locator(".data-table"));
  const inlineSelect = admin.locator(".data-table").getByLabel("שינוי סטטוס עבור " + original.number);
  await visible(inlineSelect);
  await inlineSelect.selectOption("בטיפול");
  await visible(admin.locator(".data-table .inline-status-saved"));
  await inlineSelect.selectOption("הסתיים");
  await visible(admin.locator(".data-table .inline-status-saved"));
  if (process.env.CORTEZ_QA_SCREENSHOTS) await admin.screenshot({ path: join(process.env.CORTEZ_QA_SCREENSHOTS, "standards-desktop.png") });
  const desktopWaHref = await admin.locator(".data-table .action-pill-wa").first().getAttribute("href");
  assert.ok(desktopWaHref?.startsWith("https://wa.me/972525510004?text="));
  await admin.locator(".data-table .action-pill-photo").first().click();
  await visible(admin.getByRole("dialog", { name: "תמונות · דגם בדיקה 2" }));
  await button(admin, "סגירת גלריית תמונות").click();

  stage = "repair, inline customer, and customer history";
  await page.goto("/repairs/new");
  await field(page, "שם הדגם").fill("קורקינט בדיקה");
  await field(page, "מספר סידורי של הכלי").fill("SER-TEST-73");
  await field(page, "מה התקלה?").fill("כשל בהדלקה");
  await button(page, "לקוח חדש").click();
  const customer = page.getByRole("dialog", { name: "לקוח חדש" });
  await field(customer, "סוג לקוח").selectOption("store");
  await field(customer, "שם לקוח").fill("לקוח בדיקה");
  await field(customer, "שם החנות").fill("חנות בדיקה");
  await field(customer, "מספר טלפון").fill("050-1234567");
  await button(customer, "שמירת לקוח").click();
  await customer.waitFor({ state: "hidden" });
  const [contact] = await readDb("customers");
  assert.equal(await field(page, "לקוח").inputValue(), contact.id);
  assert.equal(await field(page, "מה התקלה?").inputValue(), "כשל בהדלקה");
  await field(page, "בחירת תמונות").setInputFiles(photo);
  const repairPath = await save(page, "repairs");
  const [repair] = await readDb("repairs");
  assert.equal(repair.number, "REP-0001");
  assert.equal(repair.customerId, contact.id);
  assert.equal(repair.photos.length, 1);
  await page.goto("/repairs");
  await field(page, "חיפוש לפי מספר תיקון, דגם או מספר סידורי").fill("לקוח בדיקה");
  await button(page, "חיפוש").click();
  await visible(link(page, repair.number));
  await field(page, "חיפוש לפי מספר תיקון, דגם או מספר סידורי").fill("SER-TEST-73");
  await field(page, "סינון לפי סטטוס").selectOption("התקבל");
  await button(page, "חיפוש").click();
  await link(page, repair.number).click();
  await link(page, "עריכה").click();
  await field(page, "מה תוקן?").fill("הוחלף מחבר");
  await field(page, "סטטוס תיקון").selectOption("בטיפול");
  await save(page, "repairs");
  await visible(page.getByText("הוחלף מחבר"));
  await link(page, "לקוח בדיקה").click();
  await visible(heading(page, "היסטוריית תיקונים"));
  const customerPath = new URL(page.url()).pathname;
  assert.equal(customerPath, "/customers/" + contact.id);
  assert.equal(await link(page, "050-1234567").getAttribute("href"), "tel:0501234567");
  await visible(link(page, repair.number));
  await link(page, "עריכה").click();
  await field(page, "שם החנות").fill("חנות מעודכנת");
  await save(page, "customers");
  await visible(page.getByText("חנות מעודכנת"));
  await link(page, "תיקון חדש").click();
  assert.equal(await field(page, "לקוח").inputValue(), contact.id);
  await page.goto("/customers");
  await field(page, "חיפוש לפי שם, חנות או טלפון").fill("0501234567");
  await button(page, "חיפוש").click();
  await visible(link(page, "לקוח בדיקה"));
  await page.goto("/customers/new");
  await field(page, "סוג לקוח").selectOption("private");
  await field(page, "שם לקוח").fill("לקוח נוסף");
  await field(page, "מספר טלפון").fill("052-5557788");
  await save(page, "customers");

  stage = "models catalog and linking";
  await page.goto("/models");
  await visible(heading(page, "מאגר דגמים"));
  await visible(link(page, "CORTEZ 10X"));
  await field(page, "חיפוש לפי שם דגם או סוג מכשיר").fill("דגם בדיקה 2");
  await button(page, "חיפוש").click();
  await link(page, "דגם בדיקה 2").click();
  await visible(heading(page, "תיקי מכון תקנים של דגם זה"));
  await visible(link(page, original.number));

  stage = "catalog product experience and public showroom";
  const studioPoster = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#f0f1f4" } }).png().toBuffer();
  await desktop.route("**/api/catalog-image?**", (route) => route.fulfill({ contentType: "image/png", body: studioPoster }));
  await admin.goto("/catalog");
  await visible(heading(admin, "הכלי הבא שלכם. מכל זווית."));
  await visible(admin.locator(".coastal-exhibition-stage canvas"));
  assert.ok(await admin.locator(".coastal-exhibition-stage canvas").evaluate((canvas) => canvas.getBoundingClientRect().height > 200));
  await button(admin, "שעת הזהב").click();
  await visible(admin.locator(".coastal-exhibition.is-golden"));
  if (process.env.CORTEZ_QA_SCREENSHOTS) {
    await delay(750);
    await admin.screenshot({ path: join(process.env.CORTEZ_QA_SCREENSHOTS, "catalog-desktop-golden.png") });
  }
  await button(admin, "אור יום בחוף").click();
  assert.equal(await admin.locator('a[href*="wa.me"]').count(), 0, "Catalog must not contain WhatsApp links");
  if (process.env.CORTEZ_QA_SCREENSHOTS) {
    await delay(750);
    await admin.screenshot({ path: join(process.env.CORTEZ_QA_SCREENSHOTS, "catalog-desktop.png") });
  }

  // Verify top header is not sticky and Presentation Mode button is removed
  assert.notEqual(
    await admin.locator(".cortez-header").evaluate((el) => getComputedStyle(el).position),
    "sticky",
    "Top catalog header must not be sticky on scroll",
  );
  assert.equal(await admin.getByRole("button", { name: "מצב מצגת" }).count(), 0, "Presentation mode button must be removed");

  // Exercise 4-step Ride Finder wizard
  await admin.locator(".is-finder-trigger").click();
  const finderDialog = admin.getByRole("dialog");
  await visible(finderDialog);
  await button(finderDialog, "המשך").click();
  await button(finderDialog, "המשך").click();
  await button(finderDialog, "המשך").click();
  await button(finderDialog, "גלו את ההתאמות שלי").click();
  assert.ok((await finderDialog.locator(".ride-finder-card").count()) >= 1);
  await button(finderDialog, "סגירת אשף התאמה").click();

  assert.ok((await admin.locator(".showroom-card").count()) >= 32);
  const miaCard = admin.locator(".showroom-card", { has: heading(admin, "CORTEZ MIA") });
  await miaCard.locator(".card-swatch-dot").first().click();
  await button(admin, "שיכוך מלא").click();
  const fullSuspCount = await admin.locator(".showroom-card").count();
  assert.ok(fullSuspCount > 0 && fullSuspCount < 32);
  await button(admin, "שיכוך מלא").click();
  assert.ok((await admin.locator(".showroom-card").count()) >= 32);
  await field(admin, "חיפוש בקטלוג הסוכנים").fill("48V");
  await visible(heading(admin, "CORTEZ A1"));
  assert.equal(await heading(admin, "CORTEZ 10X").count(), 0);
  await field(admin, "חיפוש בקטלוג הסוכנים").fill("");
  await button(admin, "הסתרת מחירון").click();
  assert.equal(await admin.locator(".showroom-price").count(), 0);
  await button(admin, "הצגת מחירון").click();
  assert.ok((await admin.locator(".showroom-price").count()) > 0);
  await button(admin, "גלריה ומפרט עבור CORTEZ 10X").click();
  await visible(admin.locator(".stage-3d-canvas canvas"));
  assert.ok(await admin.locator(".stage-3d-canvas canvas").evaluate((canvas) => canvas.getBoundingClientRect().height > 250));
  assert.equal(await admin.locator('a[href*="wa.me"]').count(), 0, "Product modal must not contain WhatsApp links");
  await button(admin, "מעבר לשעת הזהב").click();
  assert.equal(await admin.locator(".stage-3d-shell.is-night").count(), 1);
  await button(admin, "מעבר לאור יום בחוף").click();
  await button(admin, "מבט קרוב").click();
  assert.equal(await button(admin, "מבט קרוב").getAttribute("aria-pressed"), "true");
  await button(admin, "מבט ראשי").click();
  await admin.getByRole("button", { name: /הכירו את הדגם בסיור קצר/ }).click();
  await visible(admin.getByRole("region", { name: "סיור מודרך במוצר" }));
  await button(admin, "עצירת הסיור").click();
  await button(admin, "הבא").click();
  assert.match(await admin.locator(".studio-tour h3").innerText(), /סוללה/);
  await button(admin, "הקודם").click();
  assert.equal(await admin.locator(".studio-tour h3").innerText(), "CORTEZ 10X");
  await button(admin, "יציאה מהסיור").click();
  await admin.locator(".stage-hotspot").first().click();
  await visible(admin.getByRole("region", { name: "הסבר על מאפיין הדגם" }));
  await button(admin, "מאפיין הבא").click();
  await button(admin, "סגירת הסבר מאפיין").click();
  await admin.getByRole("button", { name: /תמונות 8/ }).click();
  await button(admin, "הגדלה ובדיקת פרטים").click();
  await button(admin, "הגדלת תמונה").click();
  await visible(admin.getByText("150%", { exact: true }));
  await button(admin, "סגירת הגדלה").click();
  assert.equal(await button(admin, "הגדלה ובדיקת פרטים").evaluate((element) => element === document.activeElement), true);
  await button(admin, "תמונה הבאה").click();
  await button(admin, "מפרט מלא").click();
  await visible(heading(admin, "מפרט טכני מלא"));
  await visible(admin.getByRole("dialog").locator("dd", { hasText: "36V/10.4Ah" }));

  await button(admin, "סגירת תצוגת דגם").click();

  // Rapidly switch across 6 models and every CRM module to ensure no WebGL context exhaustion or navigation crash.
  const modelButtons = admin.locator(".showroom-card .showroom-card-visual");
  const sampleCount = Math.min(await modelButtons.count(), 6);
  for (let i = 0; i < sampleCount; i++) {
    await modelButtons.nth(i).click();
    await visible(admin.getByRole("dialog"));
    await button(admin, "סגירת תצוגת דגם").click();
  }
  assert.equal((await anonymous.get("/favicon.ico")).status(), 200);
  for (const [navLabel, urlGlob, title] of [
    ["סקירה כללית", "**/dashboard", "סקירה כללית"],
    ["מכון תקנים", "**/standards", "מכון תקנים"],
    ["תיקונים", "**/repairs", "תיקונים"],
    ["לקוחות", "**/customers", "לקוחות"],
    ["מאגר דגמים", "**/models", "מאגר דגמים"],
    ["תקלות ופתיחות הגבלה", "**/faults", "תקלות ופתיחות הגבלה"],
    ["הגדרות", "**/settings", "הגדרות"],
    ["קטלוג סוכנים", "**/catalog", "הכלי הבא שלכם. מכל זווית."],
  ]) {
    await admin.locator(".sidebar .side-nav").getByRole("link", { name: navLabel }).click();
    await admin.waitForURL(urlGlob);
    await visible(heading(admin, title));
    assert.equal(await admin.getByText("טעינת הדף נכשלה").count(), 0);
  }

  const card10x = admin.locator(".showroom-card", { has: heading(admin, "CORTEZ 10X") });
  const cardA1 = admin.locator(".showroom-card", { has: heading(admin, "CORTEZ A1") });
  await card10x.getByRole("button", { name: "השוואה" }).click();
  await cardA1.getByRole("button", { name: "השוואה" }).click();
  await button(admin, "השוואת דגמים").click();
  await visible(heading(admin, "השוואת דגמי קורטז"));
  await visible(admin.locator(".compare-winner-badge", { hasText: "מוביל" }).first());
  await button(admin, "סגירת השוואה").click();
  assert.equal((await anonymous.get("/showroom")).status(), 200);
  // Dedicated product URLs and legacy links resolve the same public product.
  const productId = "00000000-0000-4000-8000-000000000001";
  assert.equal((await anonymous.get("/showroom/" + productId)).status(), 200);
  const hiddenModel = await api(desktop.request, "POST", "/api/records/models", {
    device: "קורקינט חשמלי", name: "QA hidden model", notes: "INTERNAL-NOTE-NEVER-PUBLIC", published: false,
  }, 201);
  assert.equal((await anonymous.get("/showroom/" + hiddenModel.id)).status(), 404);
  assert.equal((await anonymous.get("/showroom?model=" + hiddenModel.id)).status(), 404);
  const publicHtml = await (await anonymous.get("/showroom")).text();
  assert.equal(publicHtml.includes("INTERNAL-NOTE-NEVER-PUBLIC"), false);
  assert.equal(publicHtml.includes("QA hidden model"), false);
  await api(desktop.request, "DELETE", "/api/records/models/" + hiddenModel.id, { version: hiddenModel.updatedAt }, 400);
  await api(desktop.request, "DELETE", "/api/records/models/" + hiddenModel.id, { version: hiddenModel.updatedAt, deletePassword: "5522" }, 200);
  // Saving a legacy model through the editor must not erase legacy metrics or gallery order.
  await admin.goto("/models/" + productId + "/edit");
  await field(admin, "הערות פנימיות").fill("INTERNAL-EDITOR-NOTE");
  await save(admin, "models");
  const editedModel = (await readDb("models")).find((item) => item.id === productId);
  assert.equal(editedModel.metrics?.rangeKm, undefined);
  assert.ok(editedModel.galleryUrls.length > 1);
  assert.equal((await (await anonymous.get("/showroom/" + productId)).text()).includes("INTERNAL-EDITOR-NOTE"), false);

  // A tiny test-only geometry verifies GLTF loading, manual controls, failure recovery and reduced motion.
  const fixtureGeometry = new BoxGeometry(2, 2, 1).toNonIndexed();
  const vertices = fixtureGeometry.attributes.position.array;
  const times = new Float32Array([0, 1]), rotations = new Float32Array([0, 0, 0, 1, 0, 0, Math.SQRT1_2, Math.SQRT1_2]);
  const fixtureBytes = Buffer.concat([Buffer.from(vertices.buffer), Buffer.from(times.buffer), Buffer.from(rotations.buffer)]);
  const fixtureGltf = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: "Frame", mesh: 0 }],
    buffers: [{ uri: "data:application/octet-stream;base64," + fixtureBytes.toString("base64"), byteLength: fixtureBytes.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: vertices.byteLength }, { buffer: 0, byteOffset: vertices.byteLength, byteLength: times.byteLength }, { buffer: 0, byteOffset: vertices.byteLength + times.byteLength, byteLength: rotations.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: vertices.length / 3, type: "VEC3", min: [-1, -1, -.5], max: [1, 1, .5] }, { bufferView: 1, componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [1] }, { bufferView: 2, componentType: 5126, count: 2, type: "VEC4" }],
    materials: [{ name: "Frame paint", pbrMetallicRoughness: { baseColorFactor: [.2, .2, .2, 1] } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    animations: [{ name: "Fold", samplers: [{ input: 1, output: 2, interpolation: "LINEAR" }], channels: [{ sampler: 0, target: { node: 0, path: "rotation" } }] }] };
  fixtureGeometry.dispose();
  const fixtureStudio = { assetVerified: true, scaleVerified: true, source: "PRIVATE-ASSET-SOURCE", dimensions: { length: 2, width: 1, height: 2 },
    features: [{ title: "רכיב בדיקה", description: "תיאור רכיב מאומת לצורך בדיקת הממשק", nodePath: "0", point: [0, 0, .5] }],
    actions: [{ id: "fold", title: "הדגמת קיפול", clip: "Fold" }],
    variants: [{ id: "white", title: "לבן", sku: "QA-WHITE", color: "#eeeeee", price: 3500, materials: [{ name: "Frame paint", color: "#eeeeee" }] }] };
  let failGeometry = false;
  await desktop.route("**/qa-model.glb", (route) => route.fulfill({ status: failGeometry ? 404 : 200, contentType: "model/gltf+json", body: failGeometry ? "missing" : JSON.stringify(fixtureGltf) }));
  const geometryModel = await api(desktop.request, "POST", "/api/records/models", {
    device: "קורקינט חשמלי", name: "QA geometry fixture", notes: "", published: true, model3dUrl: baseURL + "/qa-model.glb", studio: fixtureStudio,
  }, 201);
  await admin.goto("/showroom/" + geometryModel.id);
  await admin.emulateMedia({ reducedMotion: "reduce" });
  await button(admin, "תלת־ממד").click();
  await visible(button(admin, "חזית"));
  assert.equal(await admin.locator(".product-real-canvas canvas").evaluate((element) => element.style.touchAction), "pan-y");
  await button(admin, "התקרבות").click();
  await button(admin, "צד").click();
  await button(admin, "חזית").click();
  await visible(admin.locator("[data-feature-anchor='0']"));
  await admin.locator("[data-feature-anchor='0']").click();
  await button(admin, "מידות").click();
  await visible(admin.locator(".studio-dimension-labels"));
  await button(admin, "קנה מידה").click();
  await visible(admin.locator(".studio-reference-caption"));
  await button(admin, "הדגמת קיפול").click();
  await button(admin, "הפעלה").click();
  await visible(button(admin, "החזרה"));
  await button(admin, "לבן").click();
  assert.equal(new URL(admin.url()).searchParams.get("variant"), "white");
  assert.match(await admin.locator(".product-price").innerText(), /₪3,500/);
  await admin.reload();
  assert.equal(await button(admin, "לבן").getAttribute("aria-pressed"), "true");
  assert.equal(new URL(admin.url()).searchParams.get("mode"), "3d");
  assert.equal((await (await anonymous.get("/showroom/" + geometryModel.id)).text()).includes("PRIVATE-ASSET-SOURCE"), false);
  failGeometry = true;
  await admin.reload();
  await button(admin, "תלת־ממד").click();
  await visible(button(admin, "ניסיון נוסף"));
  failGeometry = false;
  await button(admin, "ניסיון נוסף").click();
  await visible(button(admin, "חזית"));
  await admin.emulateMedia({ reducedMotion: "no-preference" });
  const secondGeometry = await api(desktop.request, "POST", "/api/records/models", {
    device: "קורקינט חשמלי", name: "QA second geometry", notes: "", published: true, model3dUrl: baseURL + "/qa-model.glb", studio: fixtureStudio,
  }, 201);
  await admin.goto("/catalog?compare=" + geometryModel.id + "," + secondGeometry.id);
  await button(admin, "השוואת דגמים").click();
  await button(admin, "השוואה בתלת־ממד").click();
  await visible(admin.locator(".studio-compare-grid .product-real-canvas canvas").nth(1));
  await admin.locator(".studio-compare-toolbar").getByRole("button", { name: "צד", exact: true }).click();
  await noOverflow(admin);
  await button(admin, "סגירת השוואה").click();
  await admin.goto("/models/" + geometryModel.id + "/edit");
  await field(admin, "מקור המודל והאימות").fill("PRIVATE-ASSET-SOURCE-EDITED");
  await save(admin, "models");
  const savedGeometry = (await readDb("models")).find((item) => item.id === geometryModel.id);
  assert.equal(savedGeometry.studio.features[0].nodePath, "0");
  assert.equal(savedGeometry.studio.variants[0].sku, "QA-WHITE");
  await api(desktop.request, "DELETE", "/api/records/models/" + geometryModel.id, { version: savedGeometry.updatedAt, deletePassword: "5522" }, 200);
  await api(desktop.request, "DELETE", "/api/records/models/" + secondGeometry.id, { version: secondGeometry.updatedAt, deletePassword: "5522" }, 200);
  const anonContext = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const anonPage = await anonContext.newPage();
  captureErrors(anonPage);
  await anonPage.goto("/showroom");
  await visible(heading(anonPage, "CORTEZ 10X"));
  assert.equal(await anonPage.locator('a[href*="wa.me"]').count(), 0, "Public showroom must not contain WhatsApp links");
  await noOverflow(anonPage);
  if (process.env.CORTEZ_QA_SCREENSHOTS) await anonPage.screenshot({ path: join(process.env.CORTEZ_QA_SCREENSHOTS, "catalog-mobile-showroom.png") });
  await button(anonPage, "טווח ארוך 45+ ק״מ").click();
  await button(anonPage, "שיכוך מלא").click();
  assert.equal(new URL(anonPage.url()).searchParams.getAll("fit").length, 2);
  await anonPage.reload();
  assert.equal(await button(anonPage, "שיכוך מלא").getAttribute("aria-pressed"), "true");
  await anonPage.goto("/showroom/" + productId);
  await visible(heading(anonPage, "CORTEZ 10X"));
  assert.equal(await anonPage.locator('a[href*="wa.me"]').count(), 0, "Public product page must not contain WhatsApp links");
  await visible(heading(anonPage, "דגמים נוספים שיעניינו אתכם"));
  await noOverflow(anonPage);
  await visible(anonPage.locator(".stage-3d-canvas canvas"));
  assert.ok(await anonPage.locator(".stage-3d-canvas canvas").evaluate((canvas) => canvas.getBoundingClientRect().height > 250));
  await button(anonPage, "מבט קרוב").click();
  await button(anonPage, "מעבר לשעת הזהב").click();
  assert.equal(await anonPage.locator(".stage-3d-shell.is-night").count(), 1);
  await anonPage.locator(".stage-hotspot").first().click();
  await visible(anonPage.getByRole("region", { name: "הסבר על מאפיין הדגם" }));
  await button(anonPage, "סגירת הסבר מאפיין").click();
  await anonPage.getByRole("button", { name: /תמונות 8/ }).click();
  await button(anonPage, "הגדלה ובדיקת פרטים").click();
  await noOverflow(anonPage);
  await button(anonPage, "סגירת הגדלה").click();
  await button(anonPage, "תמונה הבאה").click();
  await button(anonPage, "מפרט מלא").click();
  await visible(heading(anonPage, "מפרט טכני מלא"));
  if (process.env.CORTEZ_QA_SCREENSHOTS) await anonPage.screenshot({ path: join(process.env.CORTEZ_QA_SCREENSHOTS, "catalog-mobile.png") });
  await anonContext.close();

  stage = "authorization, idempotency, concurrency, backup and restart";
  await admin.goto("/dashboard");
  assert.deepEqual(await admin.locator(".metric-copy strong").allTextContents(), ["0", "1", "1", "1"]);
  const input = {
    number: "TEST-API",
    device: "קורקינט חשמלי", model: "בדיקת מקביליות", status: "חדש", delay: "ללא עיכוב", delayReason: "", notes: "", tasks: [],
  };
  await api(anonymous, "POST", "/api/records/standards", input, 401);
  await api(desktop.request, "POST", "/api/records/standards", input, 403, { Origin: "https://unrelated.example" });
  await api(desktop.request, "PUT", "/api/records/standards/" + standardId, { ...input, version: original.updatedAt }, 409);
  const invalidImage = await desktop.request.post("/api/records/standards", {
    headers: { Origin: baseURL },
    multipart: { payload: JSON.stringify(input), photos: { name: "bad.jpg", mimeType: "image/jpeg", buffer: Buffer.from("bad image") } },
  });
  assert.equal(invalidImage.status(), 400);
  const created = await Promise.all(Array.from({ length: 8 }, (_, index) =>
    api(desktop.request, "POST", "/api/records/standards", { ...input, number: "TEST-" + index, requestId: randomUUID() }, 201)));
  assert.equal(new Set(created.map((item) => item.number)).size, 8);
  const requestId = randomUUID();
  const one = await api(desktop.request, "POST", "/api/records/standards", { ...input, requestId }, 201);
  const duplicate = await api(desktop.request, "POST", "/api/records/standards", { ...input, requestId }, 201);
  assert.equal(one.id, duplicate.id);
  assert.equal(one.number, duplicate.number);

  await admin.goto("/settings");
  await button(admin, "משתמש חדש").click();
  const form = admin.getByRole("dialog", { name: "משתמש חדש" });
  await field(form, "שם מלא").fill("עובד בדיקה");
  await field(form, "שם משתמש").fill("qa-employee");
  await field(form, "סיסמה").fill(employeePassword);
  await button(form, "יצירת משתמש").click();
  await visible(admin.getByText("המשתמש נוצר."));
  await button(admin, "יצירת גיבוי").click();
  await visible(admin.getByText("גיבוי מלא נשמר בשרת."));
  const backups = await readdir(join(root, "backups"));
  assert.equal(backups.length, 1);
  const downloadedBackup = await desktop.request.get("/api/settings/backups/" + backups[0]);
  assert.equal(downloadedBackup.status(), 200);
  assert.equal((await downloadedBackup.json()).id, backups[0]);
  assert.deepEqual(await readFile(join(root, "backups", backups[0], "uploads", "standards", original.photos[0].id + ".webp")),
    await readFile(join(root, "uploads", "standards", original.photos[0].id + ".webp")));
  assert.equal((await readDb("users")).some((item) => Object.values(item).includes(employeePassword)), false);

  const employee = await browser.newContext({ baseURL });
  employee.setDefaultTimeout(8000);
  const worker = await employee.newPage();
  captureErrors(worker);
  await worker.goto("/login");
  await login(worker, "qa-employee", employeePassword);
  await worker.waitForURL("**/dashboard");
  await worker.goto(standardPath);
  assert.equal(await button(worker, "מחיקה").count(), 0);
  await api(employee.request, "DELETE", "/api/records/standards/" + standardId, { version: updated.updatedAt }, 403);
  await api(employee.request, "POST", "/api/settings/backups", {}, 403);
  await button(admin, "השבתה").click();
  await visible(admin.getByText("המשתמש הושבת."));
  await worker.reload();
  await worker.waitForURL("**/login");

  await stop();
  await start();
  await page.goto(standardPath);
  await visible(heading(page, "דגם בדיקה 2"));
  assert.equal((await mobile.request.get(imagePath)).status(), 200);
  await admin.goto(customerPath);
  await visible(link(admin, "050-1234567"));
  const adminCookie = (await desktop.cookies()).find((cookie) => cookie.name === "cortez_session");
  assert.equal(adminCookie.httpOnly, true);
  assert.equal(adminCookie.sameSite, "Lax");

  stage = "faults and unlock guides module + mismatched-mime upload";
  await admin.goto("/faults");
  await visible(heading(admin, "תקלות ופתיחות הגבלה"));
  await link(admin, "מדריך חדש לדגם").click();
  await admin.waitForURL("**/faults/new");
  await field(admin, "שם הדגם").fill("CORTEZ 10X");
  await field(admin, "הוראות פתיחת הגבלה שלב אחר שלב").fill("לחיצה ממושכת על + ו- וכניסה ל-P08");
  await button(admin, "הוספת קישור לסרטון").click();
  await field(admin, "כותרת סרטון 1").fill("הדרכת פתיחת הגבלה");
  await field(admin, "קישור סרטון 1").fill("https://youtu.be/dQw4w9WgXcQ");
  await button(admin, "הוספת תקלה נפוצה").click();
  await field(admin, "קוד תקלה (אופציונלי)").fill("E07");
  await field(admin, "כותרת התקלה").fill("תקלת חיישן בלם");
  await field(admin, "תסמינים וגורם אפשרי").fill("סמל בלם מהבהב על הצג");
  await field(admin, "פתרון מומלץ ודרכי טיפול").fill("בדיקת כבל חיישן בלם בידית שמאל");

  const samplePdf = Buffer.from("%PDF-1.4\n1 0 obj <<>> endobj\n%%EOF\n");
  const sampleMp4 = Buffer.from("00000018ftypmp4200000000mp42isom_e2e_video_payload_bytes_1234567890");
  const pngWithJpgName = await sharp({ create: { width: 80, height: 60, channels: 4, background: { r: 186, g: 21, b: 23, alpha: 1 } } }).png().toBuffer();
  await admin.locator('input[type="file"][accept*="application/pdf"]').setInputFiles({
    name: "cortez-10x-errors.pdf", mimeType: "application/pdf", buffer: samplePdf,
  });
  await admin.locator('input[type="file"][accept*="video/mp4"]').setInputFiles({
    name: "unlock-10x.mp4", mimeType: "video/mp4", buffer: sampleMp4,
  });
  await admin.locator('input[type="file"][accept*="image/heic"]').setInputFiles({
    name: "whatsapp-photo.jpg", mimeType: "image/jpeg", buffer: pngWithJpgName,
  });
  await save(admin, "faults");
  const faultPath = new URL(admin.url()).pathname;
  const faultId = faultPath.split("/").pop();
  await visible(heading(admin, "CORTEZ 10X"));
  await visible(admin.getByText("E07", { exact: true }));
  await visible(admin.getByText("cortez-10x-errors.pdf"));
  await visible(admin.locator("video.unlock-video-player"));
  await visible(admin.locator(".unlock-video-embed iframe"));

  const savedFault = (await readDb("fault-guides")).find((item) => item.id === faultId);
  assert.ok(savedFault);
  assert.equal(savedFault.photos.length, 1);
  const pdfAtt = savedFault.attachments.find((item) => item.kind === "file");
  const vidAtt = savedFault.attachments.find((item) => item.kind === "video");
  assert.ok(pdfAtt && vidAtt);
  assert.equal((await desktop.request.get(`/api/files/faults/${faultId}/${pdfAtt.id}`)).status(), 200);
  assert.equal((await desktop.request.get(`/api/files/faults/${faultId}/${vidAtt.id}`, { headers: { range: "bytes=0-15" } })).status(), 206);
  assert.equal((await anonymous.get(`/api/files/faults/${faultId}/${pdfAtt.id}`)).status(), 401);
  assert.equal((await anonymous.get(`/api/images/faults/${faultId}/${savedFault.photos[0].id}`)).status(), 401);

  await button(admin, "הוספת תקלה נפוצה").click();
  const quickDialog = admin.getByRole("dialog");
  await quickDialog.getByLabel("קוד תקלה (אופציונלי)").fill("E10");
  await quickDialog.getByLabel("כותרת התקלה").fill("תקלת תקשורת צג");
  await quickDialog.getByLabel("פתרון מומלץ").fill("בדיקת כבל ראשי בין בקר לצג");
  await button(quickDialog, "שמירת תקלה").click();
  await visible(admin.getByText("E10", { exact: true }));

  await admin.goto("/faults?q=E10");
  await visible(link(admin, "CORTEZ 10X"));
  await admin.goto("/models/00000000-0000-4000-8000-000000000001");
  await visible(heading(admin, "תקלות ופתיחת הגבלה של דגם זה"));
  await visible(link(admin, "פתיחת המדריך המלא"));

  await page.goto(faultPath);
  await visible(heading(page, "CORTEZ 10X"));
  await noOverflow(page);

  await admin.goto(faultPath);
  await button(admin, "מחיקה").click();
  const faultDelPwd = admin.getByRole("alertdialog", { name: "מחיקת רשומה" });
  await faultDelPwd.getByLabel("סיסמת מחיקה").fill("9999");
  await button(faultDelPwd, "מחיקה").click();
  await visible(faultDelPwd.getByText("סיסמת המחיקה שגויה."));
  await faultDelPwd.getByLabel("סיסמת מחיקה").fill("5522");
  await button(faultDelPwd, "מחיקה").click();
  await admin.waitForURL("**/faults?deleted=1");
  assert.equal((await desktop.request.get(`/api/files/faults/${faultId}/${pdfAtt.id}`)).status(), 404);

  stage = "confirmed deletion with password settings change and logout";
  // Change system delete password in /settings from default 5522 -> 8899
  await admin.goto("/settings");
  await button(admin, "שינוי סיסמת מחיקה").click();
  const delPwdModal = admin.getByRole("dialog", { name: "שינוי סיסמת מחיקה" });
  await field(delPwdModal, "סיסמת מחיקה נוכחית").fill("5522");
  await field(delPwdModal, "סיסמת מחיקה חדשה").fill("8899");
  await field(delPwdModal, "אימות סיסמת מחיקה חדשה").fill("8899");
  await button(delPwdModal, "שמירת סיסמת מחיקה").click();
  await visible(admin.getByText("סיסמת המחיקה עודכנה בהצלחה."));

  await admin.goto(customerPath);
  await button(admin, "מחיקה").click();
  const custDelPwd = admin.getByRole("alertdialog", { name: "מחיקת רשומה" });
  await custDelPwd.getByLabel("סיסמת מחיקה").fill("8899");
  await button(custDelPwd, "מחיקה").click();
  await visible(admin.getByText("לא ניתן למחוק לקוח עם תיקונים משויכים."));
  await admin.goto(repairPath);
  await button(admin, "מחיקה").click();
  const repairDelPwd = admin.getByRole("alertdialog", { name: "מחיקת רשומה" });
  await repairDelPwd.getByLabel("סיסמת מחיקה").fill("8899");
  await button(repairDelPwd, "מחיקה").click();
  await admin.waitForURL("**/repairs?deleted=1");
  await visible(admin.getByText("הרשומה נמחקה."));
  await admin.goto(standardPath);
  await api(desktop.request, "DELETE", "/api/records/standards/" + standardId, { version: updated.updatedAt, deletePassword: "5522" }, 403);
  await button(admin, "מחיקה").click();
  const stdDelPwd = admin.getByRole("alertdialog", { name: "מחיקת רשומה" });
  await stdDelPwd.getByLabel("סיסמת מחיקה").fill("8899");
  await button(stdDelPwd, "מחיקה").click();
  await admin.waitForURL("**/standards?deleted=1");
  assert.equal((await desktop.request.get(imagePath)).status(), 404);
  await api(desktop.request, "POST", "/api/records/standards", input, 409);
  assert.ok((await readDb("activity-logs")).some((entry) => entry.action === "delete" && entry.entityId === standardId));
  await button(admin, "התנתקות").click();
  await admin.waitForURL("**/login");
  await admin.goto("/settings");
  await admin.waitForURL("**/login");

  assert.deepEqual(pageErrors, [], "Browser runtime errors");
  console.log("Passed: desktop and mobile, login/logout, standards, tasks, photos, repairs, customers, searches, roles, backups, concurrent numbering, and restart persistence.");
} catch (error) {
  console.error("Workflow failed at:", stage);
  console.error(output);
  throw error;
} finally {
  await anonymous?.dispose();
  await browser?.close();
  await stop();
  await rm(root, { recursive: true, force: true });
}
