import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("an agent creates a priced proposal, a token opens it, and acceptance persists", async () => {
  const root = await mkdtemp(join(tmpdir(), "cortez-quotes-"));
  process.env.CORTEZ_STORAGE_DIR = root;
  try {
    const { createUser } = await import("../src/lib/auth/session");
    const { createQuote, quoteByToken, acceptQuote, cancelQuote } = await import("../src/lib/quotes/service");
    const { readCollection } = await import("../src/lib/json-db/store");
    const { quoteTotal } = await import("../src/lib/quotes/pricing");
    const admin = await createUser({ username: "quote-admin", name: "מנהל", password: randomUUID() + "Aa1", role: "admin" });
    const agent = await createUser({ username: "quote-agent", name: "סוכן", password: randomUUID() + "Aa1", role: "agent" }, admin);
    const [model] = await readCollection("models");
    const quote = await createQuote({ customerName: "רועי", customerType: "private", customerPhone: "0528216677", modelId: model.id,
      quantity: 3, unitPriceAgorot: 100000, discount: { type: "percent", basisPoints: 1000 }, vatMode: "included", vatBasisPoints: 1800 }, agent);
    assert.equal(quote.createdBy, agent.id);
    assert.equal(quoteTotal(quote).payableAgorot, 270000);
    assert.equal(await quoteByToken("0".repeat(48)), null);
    assert.equal((await quoteByToken(quote.shareToken))?.customerName, "רועי");
    assert.deepEqual(await acceptQuote(quote.shareToken), { ok: true });
    assert.equal((await quoteByToken(quote.shareToken))?.status, "accepted");
    await assert.rejects(() => cancelQuote(quote.id, agent), { status: 409 });
    const second = await createQuote({ customerName: "חנות", customerType: "store", storeName: "גלגלים", customerPhone: "0501234567", modelId: model.id,
      quantity: 2, unitPriceAgorot: 100000, totalPriceAgorot: 199999, discount: { type: "none" }, vatMode: "excluded", vatBasisPoints: 1800 }, agent);
    assert.equal(quoteTotal(second).payableAgorot, 235999);
    await cancelQuote(second.id, agent);
    assert.equal(await quoteByToken(second.shareToken), null);
  } finally {
    await rm(root, { recursive: true, force: true });
    delete process.env.CORTEZ_STORAGE_DIR;
  }
});
