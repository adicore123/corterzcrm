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

test("normalizePhoto accepts Samsung-style JPEG with trailing metadata and rejects corrupt buffers", async () => {
  const { default: sharp } = await import("sharp");
  const { normalizePhoto } = await import("../src/lib/uploads/images");
  const baseJpeg = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#ba1517" } }).jpeg().toBuffer();
  const samsungMotionPhoto = Buffer.concat([baseJpeg, Buffer.from("MotionPhoto_Data\0\0\x01\x02\x03")]);
  const webp = await normalizePhoto(samsungMotionPhoto, "image/jpeg");
  assert.equal((await sharp(webp).metadata()).format, "webp");
  await assert.rejects(() => normalizePhoto(Buffer.from("bad image"), "image/jpeg"), { status: 400 });
});
