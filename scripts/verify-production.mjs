import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob/client";
import sharp from "sharp";

const origin = process.env.CORTEZ_SMOKE_ORIGIN || "https://corterzcrm.vercel.app";
const password = process.env.CORTEZ_SMOKE_PASSWORD;
if (!password) throw new Error("CORTEZ_SMOKE_PASSWORD is required.");

async function request(path, method = "GET", body, cookie) {
  const response = await fetch(origin + path, {
    method,
    headers: { Origin: origin, ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return response;
}

async function json(path, method, body, cookie, expected) {
  const response = await request(path, method, body, cookie);
  const value = await response.json().catch(() => ({}));
  assert.equal(response.status, expected, `${method} ${path}: ${value.error || response.statusText}`);
  return { response, value };
}

const { response: login } = await json("/api/auth/login", "POST", { username: "admin", password }, undefined, 200);
const cookie = login.headers.get("set-cookie")?.split(";", 1)[0];
assert.ok(cookie?.startsWith("cortez_session="));

let saved;
try {
  const stagedId = randomUUID();
  const { value: grant } = await json("/api/uploads/standards", "POST", { id: stagedId }, cookie, 201);
  const jpeg = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#f00" } }).jpeg().toBuffer();
  await put(grant.pathname, new File([jpeg], "smoke.jpg", { type: "image/jpeg" }), { access: "private", token: grant.token });
  const number = "SMOKE-" + randomUUID().slice(0, 8);
  const { value: record } = await json("/api/records/standards", "POST", {
    requestId: randomUUID(), number, device: "קורקינט חשמלי", model: "בדיקת מערכת",
    status: "חדש", tasks: [], delay: "ללא עיכוב", delayReason: "", notes: "בדיקת העלאת תמונה",
    stagedPhotos: [{ id: stagedId, name: "smoke.jpg" }],
  }, cookie, 201);
  saved = record;
  assert.equal(saved.number, number);
  assert.equal(saved.photos.length, 1);
  const imagePath = `/api/images/standards/${saved.id}/${saved.photos[0].id}`;
  const image = await request(imagePath, "GET", undefined, cookie);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/webp");
  assert.equal(Buffer.from(await image.arrayBuffer()).toString("ascii", 0, 4), "RIFF");
  console.log("Production login, manual case number, upload, and image read passed.");
} finally {
  if (saved) {
    const result = await json("/api/records/standards/" + saved.id, "DELETE", { version: saved.updatedAt }, cookie, 200);
    assert.equal(result.value.ok, true);
    console.log("Smoke-test case removed.");
  }
}
const { value: backup } = await json("/api/settings/backups", "POST", {}, cookie, 201);
assert.match(backup.id, /^\d{4}-\d{2}-\d{2}T/);
console.log("Production backup passed.");
