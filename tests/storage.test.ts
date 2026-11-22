import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("initializes, serializes reservations, keeps them across deletions, and preserves corrupt JSON", async () => {
  const root = await mkdtemp(join(tmpdir(), "cortez-db-"));
  process.env.CORTEZ_STORAGE_DIR = root;
  try {
    const { readCollection, reserveNumber, serialized, createBackup, readBackup, writeCollection } = await import("../src/lib/json-db/store");
    const empty = await readCollection("customers");
    assert.deepEqual(empty, []);
    const values = await Promise.all(Array.from({ length: 30 }, () => serialized(() => reserveNumber("repairs"))));
    assert.deepEqual(values, Array.from({ length: 30 }, (_, index) => "REP-" + String(index + 1).padStart(4, "0")));
    assert.equal(await serialized(() => reserveNumber("repairs")), "REP-0031");
    await assert.rejects(() => writeCollection("customers", [{} as never]));
    const backup = await serialized(createBackup);
    assert.deepEqual(JSON.parse(await readFile(join(root, "backups", backup.id, "data", "counters.json"), "utf8")), { standards: 0, repairs: 31 });
    const exported = await readBackup(backup.id) as { id: string; state: { counters: { repairs: number } } };
    assert.equal(exported.id, backup.id);
    assert.equal(exported.state.counters.repairs, 31);

    const file = join(root, "data", "customers.json");
    await writeFile(file, "{damaged");
    await assert.rejects(() => readCollection("customers"));
    assert.equal(await readFile(file, "utf8"), "{damaged");
    await assert.rejects(() => serialized(createBackup));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("normalizePhoto accepts Samsung-style JPEG, mismatched MIME (WhatsApp/Android), detects HEIC headers, and rejects SVG/corrupt buffers", async () => {
  const { default: sharp } = await import("sharp");
  const { isHeicBuffer, normalizePhoto } = await import("../src/lib/uploads/images");
  const baseJpeg = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#ba1517" } }).jpeg().toBuffer();
  const samsungMotionPhoto = Buffer.concat([baseJpeg, Buffer.from("MotionPhoto_Data\0\0\x01\x02\x03")]);
  const webp = await normalizePhoto(samsungMotionPhoto, "image/jpeg");
  assert.equal((await sharp(webp).metadata()).format, "webp");

  // WhatsApp / Android often label PNG or WebP bytes as image/jpeg — must decode cleanly instead of rejecting.
  const pngBytes = await sharp({ create: { width: 32, height: 24, channels: 4, background: { r: 20, g: 20, b: 24, alpha: 1 } } }).png().toBuffer();
  const webpFromMismatchedPng = await normalizePhoto(pngBytes, "image/jpeg");
  assert.equal((await sharp(webpFromMismatchedPng).metadata()).format, "webp");

  const webpBytes = await sharp({ create: { width: 32, height: 24, channels: 3, background: "#224466" } }).webp().toBuffer();
  const webpFromMismatchedWebp = await normalizePhoto(webpBytes, "image/jpeg");
  assert.equal((await sharp(webpFromMismatchedWebp).metadata()).format, "webp");

  // ISO BMFF HEIC vs AVIF header detection
  const heicHeader = Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0, 0x6d, 0x69, 0x66, 0x31]);
  const avifHeader = Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0, 0, 0, 0, 0x6d, 0x69, 0x66, 0x31]);
  assert.equal(isHeicBuffer(heicHeader), true);
  assert.equal(isHeicBuffer(avifHeader), false);
  assert.equal(isHeicBuffer(baseJpeg), false);

  await assert.rejects(() => normalizePhoto(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), "image/svg+xml"), { status: 400 });
  await assert.rejects(() => normalizePhoto(Buffer.from("bad image"), "image/jpeg"), { status: 400 });
});

test("saveRecord omits undefined keys and parseMongoState recovers legacy null optional model fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "cortez-mongo-safety-"));
  process.env.CORTEZ_STORAGE_DIR = root;
  try {
    const { stripUndefined, parseMongoState } = await import("../src/lib/json-db/mongo-store");
    const { readCollection, writeCollection } = await import("../src/lib/json-db/store");
    const { saveRecord } = await import("../src/lib/json-db/records");
    const admin = {
      id: "11111111-1111-4111-8111-111111111111",
      username: "admin",
      name: "Admin",
      role: "admin" as const,
      disabled: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    await writeCollection("users", [{
      ...admin,
      passwordHash: "0".repeat(32) + ":" + "0".repeat(128),
    }]);

    const created = await saveRecord("models", undefined, {
      device: "קורקינט חשמלי",
      name: "Cooper",
      notes: "",
      summary: "",
      msrp: null,
      specs: [],
    }, [], admin);

    // Must not contain any own property with value `undefined` (MongoDB BSON would write it as `null`).
    const hasUndefined = (obj: unknown): boolean => {
      if (Array.isArray(obj)) return obj.some(hasUndefined);
      if (obj && typeof obj === "object") {
        return Object.values(obj).some((value) => value === undefined || hasUndefined(value));
      }
      return false;
    };
    assert.equal(hasUndefined(created), false);
    assert.ok("msrp" in created);
    assert.equal(created.msrp, null);

    // stripUndefined preserves intentional nulls (msrp, metrics.*) and drops undefined keys.
    const cleaned = stripUndefined({ msrp: null, metrics: { rangeKm: null, speedKmh: undefined }, imageUrl: undefined });
    assert.deepEqual(cleaned, { msrp: null, metrics: { rangeKm: null } });

    // parseMongoState recovers legacy MongoDB docs where BSON coerced optional fields to null.
    const storedModels = await readCollection("models");
    const legacyDoc = {
      format: 1,
      standards: [],
      repairs: [],
      customers: [],
      models: [
        ...storedModels.slice(0, 1),
        {
          ...created,
          imageUrl: null,
          productUrl: null,
          galleryUrls: null,
          studio: { source: null, usdzUrl: null },
          metrics: { rangeKm: null },
        },
      ],
      users: [],
      counters: { standards: 0, repairs: 0 },
      activity: [],
      sessions: [],
    };
    const recovered = parseMongoState(legacyDoc);
    const cooper = recovered.models.find((m) => m.name === "Cooper");
    assert.ok(cooper);
    assert.equal(cooper.imageUrl, undefined);
    assert.equal(cooper.productUrl, undefined);
    assert.equal(cooper.galleryUrls, undefined);
    assert.equal(cooper.msrp, null);
    assert.equal(cooper.metrics?.rangeKm, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
