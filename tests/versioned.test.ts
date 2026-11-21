import assert from "node:assert/strict";
import test from "node:test";
import { createVersionedStore } from "../src/lib/json-db/versioned";

test("concurrent workers commit entire transactions without dropping updates", async () => {
  let saved = { sequence: 0, numbers: [] as number[] };
  let version = 0;
  let conflicts = 0;
  const adapter = {
    async read() { return { value: structuredClone(saved), version: String(version) }; },
    async commit(value: typeof saved, expected: string | null) {
      if (String(version) !== expected) { conflicts++; return false; }
      saved = value;
      version++;
      return true;
    },
  };
  const workers = Array.from({ length: 8 }, () => createVersionedStore(adapter));
  const numbers = await Promise.all(workers.map((worker) => worker.transaction(async () => {
    const before = await worker.read();
    worker.replace({ ...before, sequence: before.sequence + 1 });
    await new Promise((resolve) => setTimeout(resolve, 1));
    const after = await worker.read();
    worker.replace({ ...after, numbers: [...after.numbers, after.sequence] });
    return after.sequence;
  })));
  assert.ok(conflicts > 0);
  assert.deepEqual(numbers.sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(saved.numbers, numbers);

  await assert.rejects(() => workers[0].transaction(async () => {
    workers[0].replace({ sequence: 0, numbers: [] });
    throw new Error("Abort without publishing");
  }));
  assert.equal(saved.sequence, 8);
});
