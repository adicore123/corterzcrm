import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canDeleteItems, canEditModule, customerInput, customerSchema, DEFAULT_PICKUP_ADDRESS, passwordSchema } from '../src/lib/validation/models';
import { buildTargetWhatsappUrl, completedRepairCustomerMessage, repairReadyMessage } from '../src/lib/whatsapp-card';
import { repairStatusNeedsWork } from '../src/components/records/inline-repair-status';

test('customer type and ready message support private, store and legacy customers with friendly pickup wording', () => {
  const base = { name: 'דנה', store: 'חנות גלגל', phone: '0501234567' };
  assert.equal(customerInput.parse(base).customerType, undefined);
  assert.equal(customerInput.parse({ ...base, customerType: 'store' }).customerType, 'store');
  assert.match(repairReadyMessage({ ...base, customerType: 'private' }, 'דגם A')!, /מוכן לאיסוף/);
  assert.match(repairReadyMessage({ ...base, customerType: 'store' }, 'דגם A')!, /מוכן לאיסוף/);
  assert.match(repairReadyMessage({ ...base, customerType: 'store' }, 'דגם A')!, /חנות גלגל/);
  assert.equal(repairReadyMessage(base, 'דגם A'), undefined);
  assert.match(completedRepairCustomerMessage(base, 'דגם A'), /מוכן לאיסוף/);
});

test('legacy customer marked private in the store field is recognized without changing other customers', () => {
  const record = { id: '0b745e23-1aca-4c69-95ff-83ced62fbb63', name: 'לקוח', phone: '0501234567', createdAt: '2026-11-23T09:08:19.574Z', updatedAt: '2026-11-23T09:08:19.574Z' };
  assert.deepEqual(customerSchema.parse({ ...record, store: 'פרטי' }), { ...record, store: '', customerType: 'private' });
  assert.equal(customerSchema.parse({ ...record, store: 'חנות' }).customerType, undefined);
  assert.equal(customerSchema.parse({ ...record, store: 'פרטי', customerType: 'store' }).customerType, 'store');
});

test('private customer input clears store details while store customer input preserves them', () => {
  assert.deepEqual(customerInput.parse({ name: 'רועי', store: 'ערך ישן', phone: '0528216677', customerType: 'private' }), {
    name: 'רועי', store: '', phone: '0528216677', customerType: 'private',
  });
  assert.deepEqual(customerInput.parse({ name: 'דנה', store: 'גלגל העיר', phone: '0501234567', customerType: 'store' }), {
    name: 'דנה', store: 'גלגל העיר', phone: '0501234567', customerType: 'store',
  });
});

test('completed repair WhatsApp message targets customer phone directly and includes configured pickup address', () => {
  const customer = { name: 'רועי', store: '', phone: '052-8216677', customerType: 'private' as const };
  assert.equal(DEFAULT_PICKUP_ADDRESS, 'לישנסקי 27, ראשון לציון');
  const msg = repairReadyMessage(customer, 'קורקינט X')!;
  assert.match(msg, /היי רועי/);
  assert.match(msg, /קורקינט X/);
  assert.match(msg, /מוכן לאיסוף/);
  assert.match(msg, /לישנסקי 27, ראשון לציון/);
  assert.match(repairReadyMessage(customer, 'קורקינט X', 'הרצל 10, תל אביב')!, /הרצל 10, תל אביב/);

  const targetUrl = buildTargetWhatsappUrl(msg, customer.phone, 'https://corterzcrm.vercel.app/repairs/123');
  assert.ok(targetUrl.startsWith('https://wa.me/972528216677?text='));
  assert.equal(targetUrl.includes('972525510004'), false);
});

test('repair work editor opens only for active and completed statuses', () => {
  assert.equal(repairStatusNeedsWork('התקבל'), false);
  assert.equal(repairStatusNeedsWork('בטיפול'), true);
  assert.equal(repairStatusNeedsWork('הסתיים'), true);
});

test('simple 5-8 char passwords and agent permissions work as specified', () => {
  assert.equal(passwordSchema.parse('12345'), '12345');
  assert.equal(passwordSchema.parse('552211'), '552211');
  assert.throws(() => passwordSchema.parse('1234'));

  assert.equal(canEditModule('agent', 'faults'), true);
  assert.equal(canEditModule('agent', 'repairs'), false);
  assert.equal(canEditModule('agent', 'standards'), false);
  assert.equal(canEditModule('agent', 'customers'), false);
  assert.equal(canEditModule('agent', 'models'), false);
  assert.equal(canDeleteItems('agent'), false);
  assert.equal(canDeleteItems('employee'), true);
  assert.equal(canDeleteItems('admin'), true);
});
