import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("delete password defaults to 5522, enforces record item removals, and allows admin update", async () => {
  const root = await mkdtemp(join(tmpdir(), "cortez-delpwd-"));
  process.env.CORTEZ_STORAGE_DIR = root;
  try {
    const {
      changeDeletePassword, createUser, DEFAULT_DELETE_PASSWORD, requireDeletePassword, verifyDeletePassword,
    } = await import("../src/lib/auth/session");
    const { readCollection } = await import("../src/lib/json-db/store");
    const { saveRecord, getRecord } = await import("../src/lib/json-db/records");
    const { parseMongoState } = await import("../src/lib/json-db/mongo-store");

    assert.equal(DEFAULT_DELETE_PASSWORD, "5522");
    assert.equal(await verifyDeletePassword("5522"), true);
    assert.equal(await verifyDeletePassword(" 5522 "), true);
    assert.equal(await verifyDeletePassword("0000"), false);

    await assert.rejects(() => requireDeletePassword(""), { status: 400 });
    await assert.rejects(() => requireDeletePassword("1111"), { status: 403 });
    await requireDeletePassword("5522");

    const admin = await createUser({
      role: "admin",
      username: "del-admin",
      name: "מנהל מחיקה",
      password: randomUUID() + "Aa1",
    });
    const employee = await createUser({
      role: "employee",
      username: "del-worker",
      name: "עובד",
      password: randomUUID() + "Aa1",
    }, admin);

    await assert.rejects(() => changeDeletePassword("5522", "8899", employee), { status: 403 });
    await assert.rejects(() => changeDeletePassword("9999", "8899", admin), { status: 400 });
    await assert.rejects(() => changeDeletePassword("5522", "12", admin));

    const updated = await changeDeletePassword("5522", "8899", admin);
    assert.deepEqual(updated, { ok: true });

    const settingsRaw = await readFile(join(root, "data", "settings.json"), "utf8");
    assert.equal(settingsRaw.includes("8899"), false);
    assert.equal(await verifyDeletePassword("5522"), false);
    assert.equal(await verifyDeletePassword("8899"), true);

    const activity = await readCollection("activity");
    assert.equal(activity.some((entry) => entry.action === "delete-password-change" && entry.entity === "settings"), true);

    const createdMeta = await saveRecord("standards", undefined, {
      number: "ST-PWD-1",
      device: "קורקינט חשמלי",
      model: "CORTEZ 10X",
      status: "חדש",
      delay: "ללא עיכוב",
      delayReason: "",
      notes: "",
      tasks: [{ id: randomUUID(), title: "בדיקה ראשונה", done: false }],
    }, [], admin);
    const std = await getRecord("standards", createdMeta.id);

    await assert.rejects(() => saveRecord("standards", std.id, {
      version: std.updatedAt,
      number: std.number,
      device: std.device,
      model: std.model,
      status: std.status,
      delay: std.delay,
      delayReason: std.delayReason,
      notes: std.notes,
      tasks: [],
    }, [], admin), { status: 400 });

    await assert.rejects(() => saveRecord("standards", std.id, {
      version: std.updatedAt,
      deletePassword: "5522",
      number: std.number,
      device: std.device,
      model: std.model,
      status: std.status,
      delay: std.delay,
      delayReason: std.delayReason,
      notes: std.notes,
      tasks: [],
    }, [], admin), { status: 403 });

    await saveRecord("standards", std.id, {
      version: std.updatedAt,
      deletePassword: "8899",
      number: std.number,
      device: std.device,
      model: std.model,
      status: std.status,
      delay: std.delay,
      delayReason: std.delayReason,
      notes: std.notes,
      tasks: [],
    }, [], admin);
    const saved = await getRecord("standards", std.id);
    assert.equal(saved.tasks.length, 0);

    // Legacy Mongo state without settings recovers cleanly with empty settings object.
    const legacy = parseMongoState({
      format: 1,
      standards: [],
      repairs: [],
      customers: [],
      models: [],
      users: [],
      counters: { standards: 0, repairs: 0 },
      activity: [],
      sessions: [],
    });
    assert.deepEqual(legacy.settings, {});
  } finally {
    await rm(root, { recursive: true, force: true });
    delete process.env.CORTEZ_STORAGE_DIR;
  }
});
