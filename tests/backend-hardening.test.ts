import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("hardened RBAC, cryptographic agent invite, delete-password rate limit, modelId integrity, and quote expiry", async () => {
  const root = await mkdtemp(join(tmpdir(), "cortez-hardening-"));
  process.env.CORTEZ_STORAGE_DIR = root;
  delete process.env.CORTEZ_STORAGE_BACKEND;
  try {
    const {
      createUser,
      ensureAgentInviteToken,
      registerAgent,
      requireDeletePassword,
      rotateAgentInviteToken,
    } = await import("../src/lib/auth/session");
    const { clearRateLimit } = await import("../src/lib/auth/rate-limit");
    const { safeApiErrorResponse } = await import("../src/lib/api-guard");
    const { deleteRecord, saveRecord } = await import("../src/lib/json-db/records");
    const { catalogModels } = await import("../src/lib/json-db/queries");
    const {
      acceptQuote,
      cancelQuote,
      createQuote,
      listQuotesForUser,
    } = await import("../src/lib/quotes/service");

    // 1. Predictable hardcoded "cortez-agent" must be rejected before an invite token is provisioned
    await assert.rejects(
      () =>
        registerAgent(
          {
            name: "תוקף",
            username: "attacker1",
            password: "12345",
            code: "cortez-agent",
          },
          "10.0.0.1",
        ),
      { status: 403 },
    );

    const admin = await createUser({
      role: "admin",
      username: "sec-admin",
      name: "מנהל אבטחה",
      password: randomUUID() + "Aa1",
    });

    const inviteToken = await ensureAgentInviteToken();
    assert.notEqual(inviteToken, "cortez-agent");
    assert.ok(inviteToken.length >= 12);

    await registerAgent(
      {
        name: "סוכן מורשה א",
        username: "agent-alpha",
        password: "12345",
        code: inviteToken,
      },
      "10.0.0.2",
    );

    const rotated = await rotateAgentInviteToken(admin);
    assert.notEqual(rotated.token, inviteToken);
    await assert.rejects(
      () =>
        registerAgent(
          {
            name: "סוכן עם קוד ישן",
            username: "agent-stale",
            password: "12345",
            code: inviteToken,
          },
          "10.0.0.3",
        ),
      { status: 403 },
    );

    const agentA = await createUser(
      { role: "agent", username: "agent-a", name: "סוכן א", password: "12345" },
      admin,
    );
    const agentB = await createUser(
      { role: "agent", username: "agent-b", name: "סוכן ב", password: "12345" },
      admin,
    );

    // 2. Delete-password brute-force protection locks after 8 failed attempts
    const scope = "brute-test-scope";
    await clearRateLimit(`delpwd:${scope}`);
    for (let i = 0; i < 8; i++) {
      await assert.rejects(() => requireDeletePassword("0000", scope), { status: 403 });
    }
    await assert.rejects(() => requireDeletePassword("5522", scope), { status: 429 });
    await clearRateLimit(`delpwd:${scope}`);
    await requireDeletePassword("5522", scope);

    // 3. Customer auto-linking, agent quote isolation, tokenHash stripping & quote expiration
    const customer = await saveRecord(
      "customers",
      undefined,
      { name: "יוסי כהן", customerType: "private", store: "", phone: "054-7778899" },
      [],
      admin,
    );
    const models = await catalogModels();
    const firstModel = models[0]!;

    const quoteA = await createQuote(
      {
        customerName: "יוסי כהן",
        customerType: "private",
        customerPhone: "+972547778899",
        modelId: firstModel.id,
        quantity: 1,
        unitPriceAgorot: 420000,
        discount: { type: "none" },
        vatMode: "included",
        vatBasisPoints: 1800,
      },
      agentA,
    );
    assert.equal(quoteA.customerId, customer.id);
    assert.ok(quoteA.expiresAt);

    const expiredQuote = await createQuote(
      {
        customerName: "לקוח פג תוקף",
        customerType: "private",
        customerPhone: "0501112222",
        modelId: firstModel.id,
        quantity: 1,
        unitPriceAgorot: 350000,
        discount: { type: "none" },
        vatMode: "included",
        vatBasisPoints: 1800,
        expiresAt: "2020-01-01T00:00:00.000Z",
      },
      agentB,
    );
    await assert.rejects(() => acceptQuote(expiredQuote.shareToken), { status: 410 });

    const seenByA = await listQuotesForUser(agentA);
    const seenByB = await listQuotesForUser(agentB);
    const seenByAdmin = await listQuotesForUser(admin);
    assert.equal(seenByA.length, 1);
    assert.equal(seenByA[0]?.id, quoteA.id);
    assert.equal("tokenHash" in seenByA[0]!, false);
    assert.equal(seenByB.length, 1);
    assert.equal(seenByB[0]?.id, expiredQuote.id);
    assert.equal(seenByAdmin.length, 2);

    // 4. Whitespace-normalized model matching prevents ghost models & enforces delete guards
    const countBefore = (await catalogModels()).length;
    const std = await saveRecord(
      "standards",
      undefined,
      {
        number: "ST-NORM-1",
        device: firstModel.device,
        model: `  ${firstModel.name.toLowerCase()}  `,
        status: "חדש",
        delay: "ללא עיכוב",
        delayReason: "",
        notes: "",
        tasks: [],
      },
      [],
      admin,
    );
    assert.equal((await catalogModels()).length, countBefore);
    assert.ok("modelId" in std);
    assert.equal(std.modelId, firstModel.id);

    const customModel = await saveRecord(
      "models",
      undefined,
      { device: "קורקינט חשמלי", name: "CORTEZ GUARD TEST", notes: "", published: true },
      [],
      admin,
    );
    const guardQuote = await createQuote(
      {
        customerName: "לקוח הגנה",
        customerType: "private",
        customerPhone: "0539998877",
        modelId: customModel.id,
        quantity: 1,
        unitPriceAgorot: 299000,
        discount: { type: "none" },
        vatMode: "included",
        vatBasisPoints: 1800,
      },
      admin,
    );
    // Cannot delete a model while an active quote references it
    await assert.rejects(
      () => deleteRecord("models", customModel.id, customModel.updatedAt, admin),
      { status: 409 },
    );
    await cancelQuote(guardQuote.id, admin);
    await deleteRecord("models", customModel.id, customModel.updatedAt, admin);

    // 5. Safe API error wrapper never leaks raw internal errors
    const leaked = safeApiErrorResponse(
      new Error("MongoServerSelectionError: mongodb+srv://secret-password@cluster"),
      "test-route",
    );
    assert.equal(leaked.status, 500);
    const body = (await leaked.json()) as { error: string };
    assert.equal(body.error.includes("secret-password"), false);
    assert.equal(body.error.includes("MongoServerSelectionError"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
    delete process.env.CORTEZ_STORAGE_DIR;
  }
});
