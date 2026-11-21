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
