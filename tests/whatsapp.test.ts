import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCortezWhatsappUrl, CORTEZ_WHATSAPP_NUMBER,
  formatCustomerWhatsapp, formatFaultGuideWhatsapp, formatModelWhatsapp,
  formatRepairWhatsapp, formatStandardWhatsapp,
} from "../src/lib/whatsapp-card";

test("WhatsApp card formatters target +972 52-551-0004 and include complete card details", () => {
  assert.equal(CORTEZ_WHATSAPP_NUMBER, "972525510004");

  const stdMsg = formatStandardWhatsapp({
    id: "11111111-1111-4111-8111-111111111111",
    number: "CT-2026-0042",
    device: "קורקינט חשמלי",
    model: "CORTEZ MAX 4 2027",
    status: "בטיפול",
    delay: "מתעכב",
    delayReason: "ממתין לבדיקת בלמים",
    tasks: [
      { id: "22222222-2222-4222-8222-222222222221", title: "בדיקת בלמים", done: false },
      { id: "22222222-2222-4222-8222-222222222222", title: "צילום שלדה", done: true },
    ],
    notes: "למסור עד חמישי",
    photos: [{ id: "33333333-3333-4333-8333-333333333333", name: "front.webp", type: "image/webp", bytes: 1200 }],
    createdAt: "2026-11-22T10:00:00.000Z",
    updatedAt: "2026-11-22T11:00:00.000Z",
  });
  assert.match(stdMsg, /CT-2026-0042/);
  assert.match(stdMsg, /CORTEZ MAX 4 2027/);
  assert.match(stdMsg, /ממתין לבדיקת בלמים/);
  assert.match(stdMsg, /בדיקת בלמים/);
  assert.match(stdMsg, /תמונות מצורפות: 1/);

  const stdUrl = buildCortezWhatsappUrl(stdMsg, "https://corterzcrm.vercel.app/standards/111");
  assert.ok(stdUrl.startsWith("https://wa.me/972525510004?text="));
  assert.match(decodeURIComponent(stdUrl.split("?text=")[1]), /https:\/\/corterzcrm\.vercel\.app\/standards\/111/);

  const customer = {
    id: "44444444-4444-4444-8444-444444444444",
    name: "דני כהן",
    store: "אופני הצפון",
    phone: "050-9876543",
    createdAt: "2026-11-22T10:00:00.000Z",
    updatedAt: "2026-11-22T11:00:00.000Z",
  };
  const repairMsg = formatRepairWhatsapp({
    id: "55555555-5555-4555-8555-555555555555",
    number: "REP-0019",
    device: "אופניים חשמליים",
    model: "CORTEZ A1",
    serial: "SN-9911",
    customerId: customer.id,
    fault: "בקר לא מגיב",
    work: "הוחלף בקר 48V",
    status: "הסתיים",
    photos: [],
    createdAt: "2026-11-22T10:00:00.000Z",
    updatedAt: "2026-11-22T11:00:00.000Z",
  }, customer);
  assert.match(repairMsg, /REP-0019/);
  assert.match(repairMsg, /דני כהן/);
  assert.match(repairMsg, /אופני הצפון/);
  assert.match(repairMsg, /050-9876543/);
  assert.match(repairMsg, /הוחלף בקר 48V/);

  const customerMsg = formatCustomerWhatsapp(customer, 3);
  assert.match(customerMsg, /דני כהן/);
  assert.match(customerMsg, /תיקונים רשומים: 3/);

  const modelMsg = formatModelWhatsapp({
    id: "66666666-6666-4666-8666-666666666666",
    device: "קורקינט חשמלי",
    name: "CORTEZ 10X",
    notes: "דגם פופולרי",
    msrp: 2990,
    summary: "קורקינט עירוני",
    photos: [],
    createdAt: "2026-11-22T10:00:00.000Z",
    updatedAt: "2026-11-22T11:00:00.000Z",
  }, 2, 5);
  assert.match(modelMsg, /CORTEZ 10X/);
  assert.match(modelMsg, /2,990/);
  assert.match(modelMsg, /תיקי תקינה: 2/);

  const faultMsg = formatFaultGuideWhatsapp({
    id: "77777777-7777-4777-8777-777777777777",
    device: "קורקינט חשמלי",
    model: "CORTEZ 10X",
    summary: "בקר 36V",
    unlockInstructions: "הגדרת P08 ל־100",
    commonFaults: [{
      id: "88888888-8888-4888-8888-888888888888",
      code: "E07",
      title: "חיישן בלם",
      symptoms: "סמל בלם",
      solution: "חיזוק מחבר",
      severity: "נפוצה",
    }],
    videoLinks: [{ id: "99999999-9999-4999-8999-999999999999", title: "הדרכה", url: "https://youtu.be/abc" }],
    notes: "",
    photos: [],
    attachments: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "manual.pdf", type: "application/pdf", bytes: 5000, kind: "file" }],
    createdAt: "2026-11-22T10:00:00.000Z",
    updatedAt: "2026-11-22T11:00:00.000Z",
  }, 4);
  assert.match(faultMsg, /E07/);
  assert.match(faultMsg, /הגדרת P08/);
  assert.match(faultMsg, /קבצים: 1/);
  assert.match(faultMsg, /סרטוני הגבלה: 1/);
});
