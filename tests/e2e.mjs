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
  await button(page, "הסרת תמונה 2").click();
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
  await noOverflow(page);

  stage = "repair, inline customer, and customer history";
  await page.goto("/repairs/new");
  await field(page, "שם הדגם").fill("קורקינט בדיקה");
  await field(page, "מספר סידורי של הכלי").fill("SER-TEST-73");
  await field(page, "מה התקלה?").fill("כשל בהדלקה");
  await button(page, "לקוח חדש").click();
  const customer = page.getByRole("dialog", { name: "לקוח חדש" });
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

  stage = "3d agent catalog and public showroom";
  await admin.goto("/catalog");
  await visible(heading(admin, "קטלוג סוכנים · אולם תצוגה תלת־ממדי"));
  await visible(admin.locator(".showroom-spotlight"));
  assert.ok((await admin.locator(".showroom-card").count()) >= 32);
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
  await button(admin, "תצוגת 3D ומפרט עבור CORTEZ 10X").click();
  await visible(heading(admin, "מפרט טכני מלא"));
  await visible(admin.getByRole("dialog").locator("dd", { hasText: "36V/10.4Ah" }));
  await button(admin, "מעבר לסטודיו לילה").click();
  await button(admin, "מעבר לסטודיו יום").click();
  await button(admin, "סגירת תצוגת דגם").click();
  const card10x = admin.locator(".showroom-card", { has: heading(admin, "CORTEZ 10X") });
  const cardA1 = admin.locator(".showroom-card", { has: heading(admin, "CORTEZ A1") });
  await card10x.getByRole("button", { name: "השוואה" }).click();
  await cardA1.getByRole("button", { name: "השוואה" }).click();
  await button(admin, "השוואת דגמים").click();
  await visible(heading(admin, "השוואת דגמי קורטז"));
  await visible(admin.locator(".compare-winner-badge", { hasText: "מוביל" }).first());
  await button(admin, "סגירת השוואה").click();
  assert.equal((await anonymous.get("/showroom")).status(), 200);
  assert.equal((await anonymous.get("/api/catalog-image?url=https://example.com/evil.png")).status(), 400);
  const anonContext = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const anonPage = await anonContext.newPage();
  captureErrors(anonPage);
  await anonPage.goto("/showroom");
  await visible(heading(anonPage, "CORTEZ 10X"));
  await noOverflow(anonPage);
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

  stage = "confirmed deletion and logout";
  await button(admin, "מחיקה").click();
  await button(admin.getByRole("alertdialog"), "מחיקה").click();
  await visible(admin.getByText("לא ניתן למחוק לקוח עם תיקונים משויכים."));
  await admin.goto(repairPath);
  await button(admin, "מחיקה").click();
  await button(admin.getByRole("alertdialog"), "מחיקה").click();
  await admin.waitForURL("**/repairs?deleted=1");
  await visible(admin.getByText("הרשומה נמחקה."));
  await admin.goto(standardPath);
  await button(admin, "מחיקה").click();
  await button(admin.getByRole("alertdialog"), "מחיקה").click();
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
