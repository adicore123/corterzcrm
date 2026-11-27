import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";

test("agent orders module pulls customer from customers module, allows inline customer creation by agents, fixes WhatsApp phone formatting, and enforces RBAC", async () => {
  const root = await mkdtemp(join(tmpdir(), "cortez-orders-"));
  process.env.CORTEZ_STORAGE_DIR = root;
  delete process.env.CORTEZ_STORAGE_BACKEND;
  try {
    const { verifySameOrigin } = await import("../src/lib/api-guard");
    const { createUser } = await import("../src/lib/auth/session");
    const { catalogModels } = await import("../src/lib/json-db/queries");
    const { deleteRecord, saveRecord } = await import("../src/lib/json-db/records");
    const {
      createCustomerFromOrderForm,
      createOrder,
      deleteOrder,
      listOrderCustomers,
      listOrdersForUser,
      updateOrder,
    } = await import("../src/lib/orders/service");
    const {
      buildMoranOrderWhatsappUrl,
      formatMoranOrderWhatsappText,
    } = await import("../src/lib/orders/whatsapp");
    const { sanitizePhoneInput, toWhatsappDigits } = await import("../src/lib/phone");
    const { whatsappHref } = await import("../src/lib/presentation");

    // 1. Phone normalization & invisible iOS/WhatsApp Unicode bidi stripping
    const unicodePasted = "\u2066+972\u00A0052-611-1443\u2069";
    assert.equal(sanitizePhoneInput(unicodePasted), "+972 052-611-1443");
    assert.equal(toWhatsappDigits(unicodePasted), "972526111443");
    assert.equal(toWhatsappDigits("+972-054-1234567"), "972541234567");
    assert.equal(toWhatsappDigits("52-6111443"), "972526111443");
    assert.equal(whatsappHref("+972 052-611-1443"), "https://wa.me/972526111443");

    // 2. Multi-host Origin verification (supports x-forwarded-host alongside CORTEZ_ORIGIN)
    const prevOrigin = process.env.CORTEZ_ORIGIN;
    process.env.CORTEZ_ORIGIN = "https://primary.cortez.co.il";
    try {
      const validAliasReq = new NextRequest("https://internal.vercel.app/api/orders", {
        method: "POST",
        headers: {
          origin: "https://preview-branch.vercel.app",
          "x-forwarded-host": "preview-branch.vercel.app",
          "x-forwarded-proto": "https",
        },
      });
      assert.equal(verifySameOrigin(validAliasReq), "https://preview-branch.vercel.app");

      const crossSiteReq = new NextRequest("https://internal.vercel.app/api/orders", {
        method: "POST",
        headers: {
          origin: "https://evil.example.com",
          "x-forwarded-host": "preview-branch.vercel.app",
          "x-forwarded-proto": "https",
        },
      });
      assert.throws(() => verifySameOrigin(crossSiteReq), { status: 403 });
    } finally {
      if (prevOrigin === undefined) delete process.env.CORTEZ_ORIGIN;
      else process.env.CORTEZ_ORIGIN = prevOrigin;
    }

    const admin = await createUser({
      role: "admin",
      username: "ord-admin",
      name: "מנהל ראשי",
      password: randomUUID() + "Aa1",
    });
    const moran = await createUser(
      {
        role: "employee",
        username: "moran",
        name: "מורן מזכירה",
        password: randomUUID() + "Aa1",
      },
      admin,
    );
    const agent1 = await createUser(
      {
        role: "agent",
        username: "ord-agent1",
        name: "רועי סוכן",
        password: "12345",
      },
      admin,
    );
    const agent2 = await createUser(
      {
        role: "agent",
        username: "ord-agent2",
        name: "דנה סוכנת",
        password: "12345",
      },
      admin,
    );

    // 3. Agent adds a brand-new customer inline from the Order form (even with Unicode bidi phone!)
    const inlineCustomer = await createCustomerFromOrderForm(
      {
        customerType: "store",
        name: "דני כהן",
        store: "אופני המרכז",
        phone: "\u202A+972 054-123-4567\u202C",
      },
      agent1,
    );
    assert.equal(inlineCustomer.createdBy, agent1.id);
    assert.equal(inlineCustomer.store, "אופני המרכז");

    // Duplicate phone by another agent returns the existing customer instead of duplicating
    const dedupedCustomer = await createCustomerFromOrderForm(
      {
        customerType: "store",
        name: "דני כהן כפול",
        store: "אופני המרכז",
        phone: "0541234567",
      },
      agent2,
    );
    assert.equal(dedupedCustomer.id, inlineCustomer.id);
    assert.equal((await listOrderCustomers()).length, 1);

    const models = await catalogModels();
    const modelMia = models.find((m) => m.name.includes("MIA")) ?? models[0]!;
    const model10x = models.find((m) => m.name.includes("10X")) ?? models[1]!;

    // 4. Agent 1 creates an order passing ONLY `customerId` (all customer details pulled from customers module!)
    const order1 = await createOrder(
      {
        customerId: inlineCustomer.id,
        fulfillmentType: "delivery",
        deliveryAddress: "הרצל 45, תל אביב",
        priority: "urgent",
        notes: "נא לתאם הגעה בבוקר",
        items: [
          {
            modelId: modelMia.id,
            color: "כתום",
            quantity: 2,
            agreedUnitPriceAgorot: 365000,
          },
          {
            modelId: model10x.id,
            quantity: 1,
          },
        ],
      },
      agent1,
    );

    assert.match(order1.number, /^ORD-\d{4}-0001$/);
    assert.equal(order1.createdBy, agent1.id);
    assert.equal(order1.createdByName, "רועי סוכן");
    assert.equal(order1.customerId, inlineCustomer.id);
    assert.equal(order1.customerName, "דני כהן");
    assert.equal(order1.storeName, "אופני המרכז");
    assert.equal(order1.customerType, "store");
    assert.equal(order1.status, "חדשה");
    assert.equal(order1.items[0]?.agreedUnitPriceAgorot, 365000);
    assert.equal(order1.items[1]?.agreedUnitPriceAgorot, undefined);

    // Verify WhatsApp URL targets Moran (+972 52-611-1443 -> 972526111443) even if configured as "+972 052-611-1443"
    const waUrl = buildMoranOrderWhatsappUrl(order1, "+972 052-611-1443");
    assert.ok(waUrl.startsWith("https://wa.me/972526111443?text="));
    const waText = formatMoranOrderWhatsappText(order1);
    assert.ok(waText.includes(order1.number));
    assert.ok(waText.includes("רועי סוכן"));
    assert.ok(waText.includes("אופני המרכז"));
    assert.ok(waText.includes("הרצל 45, תל אביב"));
    assert.ok(waText.includes(modelMia.name));
    assert.ok(waText.includes("צבע: כתום"));
    assert.ok(waText.includes("מחיר שנקבע עם הלקוח:"));
    assert.ok(waText.includes("3,650"));
    assert.equal(waText.includes("http"), false, "Order WhatsApp message must be text-only without links");

    // Agent 2 creates a separate pickup order -> gets ORD-YYYY-0002
    const privateCust = await createCustomerFromOrderForm(
      {
        customerType: "private",
        name: "מיכל לוי",
        phone: "052-9988776",
      },
      agent2,
    );
    const order2 = await createOrder(
      {
        customerId: privateCust.id,
        fulfillmentType: "pickup",
        priority: "normal",
        notes: "",
        items: [{ modelId: model10x.id, quantity: 1 }],
      },
      agent2,
    );
    assert.match(order2.number, /^ORD-\d{4}-0002$/);
    assert.equal(order2.customerType, "private");

    // RBAC isolation: agents see only their own orders; Moran & Admin see all
    assert.equal((await listOrdersForUser(agent1)).length, 1);
    assert.equal((await listOrdersForUser(agent1))[0]?.id, order1.id);
    assert.equal((await listOrdersForUser(agent2)).length, 1);
    assert.equal((await listOrdersForUser(agent2))[0]?.id, order2.id);
    assert.equal((await listOrdersForUser(moran)).length, 2);
    assert.equal((await listOrdersForUser(admin)).length, 2);

    // Agent cannot change status to "סופקה"
    await assert.rejects(
      () => updateOrder(order1.id, { status: "סופקה" }, agent1),
      { status: 403 },
    );

    // Moran moves order1 to "בטיפול"
    const inProgress = await updateOrder(order1.id, { status: "בטיפול" }, moran);
    assert.equal(inProgress.status, "בטיפול");

    // Once in progress, agent1 can no longer self-cancel without calling Moran
    await assert.rejects(
      () => updateOrder(order1.id, { status: "בוטלה" }, agent1),
      { status: 409 },
    );

    // Agent2 CAN self-cancel order2 while it is still "חדשה"
    const cancelledByAgent = await updateOrder(order2.id, { status: "בוטלה" }, agent2);
    assert.equal(cancelledByAgent.status, "בוטלה");

    // Model referenced in an open order cannot be deleted
    const customModel = await saveRecord(
      "models",
      undefined,
      { device: "קורקינט חשמלי", name: "CORTEZ ORDER LOCK MODEL", notes: "", published: true },
      [],
      admin,
    );
    const lockOrder = await createOrder(
      {
        customerId: privateCust.id,
        fulfillmentType: "pickup",
        priority: "normal",
        notes: "",
        items: [{ modelId: customModel.id, quantity: 1 }],
      },
      agent1,
    );
    await assert.rejects(
      () => deleteRecord("models", customModel.id, customModel.updatedAt, admin),
      { status: 409 },
    );

    // Admin deletes lockOrder with delete password, then model deletion succeeds
    await deleteOrder(lockOrder.id, "5522", admin, "orders-test-del");
    await deleteRecord("models", customModel.id, customModel.updatedAt, admin);
  } finally {
    await rm(root, { recursive: true, force: true });
    delete process.env.CORTEZ_STORAGE_DIR;
  }
});
