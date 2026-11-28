import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import {
  changeOwnPassword,
  createUser,
  getUser,
  hasAnyUsers,
  login,
  logout,
  resetUserPassword,
  setUserDisabled,
} from "../src/lib/auth/session";
import { quickPatchRecord, saveRecord } from "../src/lib/json-db/records";
import {
  readCollection,
  reserveNumber,
  serialized,
  warmAllCollectionsInBackground,
  writeCollection,
} from "../src/lib/json-db/store";
import { toCatalogThumbUrl } from "../src/components/record-cells";
import { authorizeAttachmentUploads } from "../src/lib/uploads/attachments";
import { authorizeUploads } from "../src/lib/uploads/blob-images";
import { savePhotos } from "../src/lib/uploads/images";
import { mapConcurrent } from "../src/lib/utils";

test("mapConcurrent preserves order, enforces concurrency cap, and fails fast", async () => {
  let active = 0;
  let maxObserved = 0;
  const items = [10, 20, 30, 40, 50, 60, 70];

  const out = await mapConcurrent(items, 3, async (val, idx) => {
    active += 1;
    maxObserved = Math.max(maxObserved, active);
    await new Promise((r) => setTimeout(r, (7 - idx) * 4));
    active -= 1;
    return val * 2 + idx;
  });

  assert.equal(maxObserved, 3);
  assert.deepEqual(out, [20, 41, 62, 83, 104, 125, 146]);

  await assert.rejects(
    () =>
      mapConcurrent([1, 2, 3, 4], 2, async (n) => {
        if (n === 3) throw new Error("boom");
        return n;
      }),
    /boom/,
  );
});

test("parallel photo normalization preserves order, rolls back on corrupt file, and supports batch grants", async () => {
  const root = await mkdtemp(join(tmpdir(), "cortez-perf-photos-"));
  process.env.CORTEZ_STORAGE_DIR = root;
  delete process.env.CORTEZ_STORAGE_BACKEND;
  try {
    const { ensureStorage } = await import("../src/lib/json-db/store");
    await ensureStorage();

    const colors = ["#b11518", "#1f6f43", "#1d4ed8", "#9333ea"];
    const validFiles = await Promise.all(
      colors.map(async (bg, i) => {
        const bytes = await sharp({
          create: { width: 64 + i * 8, height: 48, channels: 3, background: bg },
        })
          .jpeg()
          .toBuffer();
        return new File([new Uint8Array(bytes)], `shot-${i + 1}.jpg`, { type: "image/jpeg" });
      }),
    );

    const saved = await savePhotos("repairs", validFiles);
    assert.equal(saved.length, 4);
    assert.deepEqual(
      saved.map((p) => p.name),
      ["shot-1.jpg", "shot-2.jpg", "shot-3.jpg", "shot-4.jpg"],
    );

    // Corrupt file in batch must roll back sibling writes cleanly
    const beforeFiles = (await readdir(join(root, "uploads", "repairs"))).sort();
    const mixedBatch = [
      validFiles[0],
      new File([new Uint8Array([1, 2, 3, 4, 5])], "corrupt.jpg", { type: "image/jpeg" }),
      validFiles[1],
    ];
    await assert.rejects(() => savePhotos("repairs", mixedBatch), { status: 400 });
    const afterFiles = (await readdir(join(root, "uploads", "repairs"))).sort();
    assert.deepEqual(afterFiles, beforeFiles);

    // Batch upload grant helpers
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_testfixture_notarealtoken";
    const userId = randomUUID();
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    const photoGrants = await authorizeUploads("standards", userId, ids);
    assert.equal(photoGrants.length, 3);
    assert.deepEqual(
      photoGrants.map((g) => g.id),
      ids,
    );

    const attIds = [
      { id: randomUUID(), kind: "video" as const },
      { id: randomUUID(), kind: "file" as const },
    ];
    const attGrants = await authorizeAttachmentUploads(attIds);
    assert.equal(attGrants.length, 2);
  } finally {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    await rm(root, { recursive: true, force: true });
  }
});

test("session cache serves repeat lookups and invalidates immediately on logout, disable, and password changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "cortez-perf-session-"));
  process.env.CORTEZ_STORAGE_DIR = root;
  delete process.env.CORTEZ_STORAGE_BACKEND;
  try {
    const admin = await createUser({
      role: "admin",
      username: "perf-admin",
      name: "מנהל מהיר",
      password: "12345",
    });
    const worker = await createUser(
      {
        role: "employee",
        username: "perf-worker",
        name: "עובד מהיר",
        password: "12345",
      },
      admin,
    );
    const agent = await createUser(
      {
        role: "agent",
        username: "perf-agent",
        name: "סוכן מהיר",
        password: "12345",
      },
      admin,
    );

    const wSession1 = await login(worker.username, "12345");
    // Prime cache and hit cache
    assert.equal((await getUser(wSession1.token))?.id, worker.id);
    assert.equal((await getUser(wSession1.token))?.id, worker.id);

    // Logout must invalidate cache immediately
    await logout(wSession1.token);
    assert.equal(await getUser(wSession1.token), null);

    // Disable user must invalidate cache immediately
    const wSession2 = await login(worker.username, "12345");
    assert.equal((await getUser(wSession2.token))?.id, worker.id);
    await setUserDisabled(worker.id, true, admin);
    assert.equal(await getUser(wSession2.token), null);
    await setUserDisabled(worker.id, false, admin);

    // Admin password reset must invalidate cache immediately
    const wSession3 = await login(worker.username, "12345");
    assert.equal((await getUser(wSession3.token))?.id, worker.id);
    await resetUserPassword(worker.id, "54321", admin);
    assert.equal(await getUser(wSession3.token), null);

    // Own password change must invalidate other sessions while keeping current token valid
    const wSessionA = await login(worker.username, "54321");
    const wSessionB = await login(worker.username, "54321");
    assert.equal((await getUser(wSessionA.token))?.id, worker.id);
    assert.equal((await getUser(wSessionB.token))?.id, worker.id);
    await changeOwnPassword(worker.id, "54321", "99999", wSessionA.token);
    assert.equal(await getUser(wSessionB.token), null);
    assert.equal((await getUser(wSessionA.token))?.id, worker.id);

    // Fast-path quickPatchRecord enforces concurrency, RBAC, and deletePassword on task removal
    const t1 = randomUUID();
    const t2 = randomUUID();
    const std = (await saveRecord(
      "standards",
      undefined,
      {
        number: "STD-FAST-1",
        device: "קורקינט חשמלי",
        model: "CORTEZ MIA",
        status: "חדש",
        delay: "ללא עיכוב",
        delayReason: "",
        notes: "",
        tasks: [
          { id: t1, title: "בדיקת בלמים", done: false },
          { id: t2, title: "בדיקת סוללה", done: false },
        ],
      },
      [],
      admin,
    )) as { id: string; updatedAt: string };

    // Agent forbidden
    await assert.rejects(
      () => quickPatchRecord("standards", std.id, { version: std.updatedAt, status: "בטיפול" }, agent),
      { status: 403 },
    );

    // Fast status + task toggle succeeds
    const patched1 = await quickPatchRecord(
      "standards",
      std.id,
      {
        version: std.updatedAt,
        status: "בטיפול",
        tasks: [
          { id: t1, title: "בדיקת בלמים", done: true },
          { id: t2, title: "בדיקת סוללה", done: false },
        ],
      },
      admin,
    );
    assert.equal(patched1.status, "בטיפול");

    // Stale version rejected with 409
    await assert.rejects(
      () => quickPatchRecord("standards", std.id, { version: std.updatedAt, status: "הסתיים" }, admin),
      { status: 409 },
    );

    // Removing a task via quickPatchRecord without deletePassword fails (400), succeeds with 5522
    await assert.rejects(
      () =>
        quickPatchRecord(
          "standards",
          std.id,
          {
            version: patched1.updatedAt,
            tasks: [{ id: t1, title: "בדיקת בלמים", done: true }],
          },
          admin,
        ),
      { status: 400 },
    );
    const patched2 = await quickPatchRecord(
      "standards",
      std.id,
      {
        version: patched1.updatedAt,
        tasks: [{ id: t1, title: "בדיקת בלמים", done: true }],
        deletePassword: "5522",
      },
      admin,
    );
    assert.equal(patched2.tasks.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("hot read cache for models/settings invalidates immediately on write, and catalog thumbnail URLs optimize WordPress images", async () => {
  const root = await mkdtemp(join(tmpdir(), "cortez-perf-hotcache-"));
  process.env.CORTEZ_STORAGE_DIR = root;
  delete process.env.CORTEZ_STORAGE_BACKEND;
  try {
    const s1 = await readCollection("settings");
    assert.deepEqual(s1, {});

    await serialized(async () => {
      await writeCollection("settings", { pickupAddress: "רחוב הבדיקה 10, תל אביב" });
    }, "auth");

    // Must immediately reflect newly written value (never stale cached `{}`)
    const s2 = await readCollection("settings");
    assert.equal(s2.pickupAddress, "רחוב הבדיקה 10, תל אביב");

    // Mutating returned object in caller must not poison hot cache
    (s2 as Record<string, unknown>).pickupAddress = "MUTATED";
    const s3 = await readCollection("settings");
    assert.equal(s3.pickupAddress, "רחוב הבדיקה 10, תל אביב");

    // Scoped reservations remain strictly sequential
    const [o1, o2, r1] = await Promise.all([
      serialized(() => reserveNumber("orders"), "orders"),
      serialized(() => reserveNumber("orders"), "orders"),
      serialized(() => reserveNumber("repairs"), "repairs"),
    ]);
    assert.match(o1, /^ORD-\d{4}-0001$/);
    assert.match(o2, /^ORD-\d{4}-0002$/);
    assert.equal(r1, "REP-0001");

    // Thumbnail URL optimizer
    assert.equal(
      toCatalogThumbUrl("https://cortez.co.il/wp-content/uploads/2026/01/mia.png", 128),
      "/api/catalog-image?url=https%3A%2F%2Fcortez.co.il%2Fwp-content%2Fuploads%2F2026%2F01%2Fmia.png&w=128",
    );
    assert.equal(
      toCatalogThumbUrl("/coastal-showroom/exhibits/mia.png", 128),
      "/coastal-showroom/exhibits/mia.png",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("hasAnyUsers fast-path and GET /api/orders/customers lazy endpoint work cleanly", async () => {
  const root = await mkdtemp(join(tmpdir(), "cortez-perf-boot-"));
  process.env.CORTEZ_STORAGE_DIR = root;
  delete process.env.CORTEZ_STORAGE_BACKEND;
  try {
    assert.equal(await hasAnyUsers(), false);
    const admin = await createUser({
      role: "admin",
      username: "boot-admin",
      name: "מנהל",
      password: "12345",
    });
    assert.equal(await hasAnyUsers(), true);
    assert.equal(await hasAnyUsers(), true);

    const agent = await createUser(
      { role: "agent", username: "boot-agent", name: "סוכן", password: "12345" },
      admin,
    );
    await saveRecord(
      "customers",
      undefined,
      { customerType: "store", name: "יוסי לוי", store: "אופני הצפון", phone: "052-3334455" },
      [],
      admin,
    );

    const { GET } = await import("../src/app/api/orders/customers/route");
    const { NextRequest } = await import("next/server");

    // Unauthenticated rejected with 401
    const unauthRes = await GET(new NextRequest("http://localhost:3000/api/orders/customers"));
    assert.equal(unauthRes.status, 401);

    // Authenticated agent receives customer options
    const agentSession = await login(agent.username, "12345");
    const authReq = new NextRequest("http://localhost:3000/api/orders/customers", {
      headers: { Cookie: `cortez_session=${agentSession.token}` },
    });
    const authRes = await GET(authReq);
    assert.equal(authRes.status, 200);
    const list = (await authRes.json()) as Array<{ name: string; store: string }>;
    assert.equal(list.length, 1);
    assert.equal(list[0].name, "יוסי לוי");
    assert.equal(list[0].store, "אופני הצפון");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("write-through hot RAM cache across CRM modules stays 100% fresh and detects external file corruption", async () => {
  const root = await mkdtemp(join(tmpdir(), "cortez-perf-writethrough-"));
  process.env.CORTEZ_STORAGE_DIR = root;
  delete process.env.CORTEZ_STORAGE_BACKEND;
  try {
    const admin = await createUser({
      role: "admin",
      username: "wt-admin",
      name: "מנהל קאש",
      password: "12345",
    });

    await warmAllCollectionsInBackground();
    assert.equal((await readCollection("customers")).length, 0);
    assert.equal((await readCollection("repairs")).length, 0);

    const cust = (await saveRecord(
      "customers",
      undefined,
      { customerType: "private", name: "לקוח מהיר", store: "", phone: "054-7778899" },
      [],
      admin,
    )) as { id: string };

    // Immediate read hits write-through cache with zero staleness
    const cachedCustomers = await readCollection("customers");
    assert.equal(cachedCustomers.length, 1);
    assert.equal(cachedCustomers[0].id, cust.id);

    // Caller array mutation must not poison hot cache
    cachedCustomers.pop();
    assert.equal((await readCollection("customers")).length, 1);

    // External out-of-process corruption on disk is detected via fileSig check
    await writeFile(join(root, "data", "customers.json"), "{corrupted");
    await assert.rejects(() => readCollection("customers"), { status: 503 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("GET /api/omni-search enforces strict RBAC between admin and agent", async () => {
  const root = await mkdtemp(join(tmpdir(), "cortez-perf-omni-"));
  process.env.CORTEZ_STORAGE_DIR = root;
  delete process.env.CORTEZ_STORAGE_BACKEND;
  try {
    const admin = await createUser({
      role: "admin",
      username: "omni-admin",
      name: "מנהל חיפוש",
      password: "12345",
    });
    const agent = await createUser(
      { role: "agent", username: "omni-agent", name: "סוכן חיפוש", password: "12345" },
      admin,
    );

    const cust = (await saveRecord(
      "customers",
      undefined,
      { customerType: "store", name: "לקוח סודי למעבדה", store: "חנות מעבדה", phone: "050-9991122" },
      [],
      admin,
    )) as { id: string };

    await saveRecord(
      "repairs",
      undefined,
      {
        device: "קורקינט חשמלי",
        model: "CORTEZ 10X",
        serial: "SN-OMNI-99",
        customerId: cust.id,
        fault: "בדיקת חיפוש",
        work: "",
        status: "התקבל",
      },
      [],
      admin,
    );

    const { GET } = await import("../src/app/api/omni-search/route");
    const { NextRequest } = await import("next/server");

    // Unauthenticated rejected
    assert.equal(
      (await GET(new NextRequest("http://localhost:3000/api/omni-search"))).status,
      401,
    );

    // Agent never sees internal repairs/customers/standards in omni-search
    const agentSession = await login(agent.username, "12345");
    const agentRes = await GET(
      new NextRequest("http://localhost:3000/api/omni-search", {
        headers: { Cookie: `cortez_session=${agentSession.token}` },
      }),
    );
    assert.equal(agentRes.status, 200);
    const agentData = (await agentRes.json()) as { items: Array<{ category: string }> };
    assert.equal(
      agentData.items.some((it) => it.category === "repairs" || it.category === "customers"),
      false,
    );

    // Admin sees repairs and customers immediately
    const adminSession = await login(admin.username, "12345");
    const adminRes = await GET(
      new NextRequest("http://localhost:3000/api/omni-search", {
        headers: { Cookie: `cortez_session=${adminSession.token}` },
      }),
    );
    assert.equal(adminRes.status, 200);
    const adminData = (await adminRes.json()) as {
      items: Array<{ category: string; keywords: string }>;
    };
    assert.equal(
      adminData.items.some(
        (it) => it.category === "repairs" && it.keywords.includes("sn-omni-99"),
      ),
      true,
    );
    assert.equal(
      adminData.items.some((it) => it.category === "customers"),
      true,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
