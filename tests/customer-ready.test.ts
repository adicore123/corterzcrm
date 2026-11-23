import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PICKUP_ADDRESS, customerInput, customerSchema } from '../src/lib/validation/models';
import { repairReadyMessage } from '../src/lib/whatsapp-card';
import { repairStatusNeedsWork } from '../src/components/records/inline-repair-status';

test('customer type and ready message support private, store and legacy customers', () => {
  const base = { name: 'דנה', store: 'חנות גלגל', phone: '0501234567' };
  assert.equal(customerInput.parse(base).customerType, undefined);
  assert.equal(customerInput.parse({ ...base, customerType: 'store' }).customerType, 'store');
  assert.match(repairReadyMessage({ ...base, customerType: 'private' }, 'דגם A')!, /מוכן לאיסוף/);
  assert.match(repairReadyMessage({ ...base, customerType: 'store' }, 'דגם A')!, /יוחזר אליכם בהקדם האפשרי/);
  assert.equal(repairReadyMessage(base, 'דגם A'), undefined);
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

test('private ready message is professional and includes the configured pickup address', () => {
  const customer = { name: 'רועי', store: '', phone: '0528216677', customerType: 'private' as const };
  assert.equal(DEFAULT_PICKUP_ADDRESS, 'לישנסקי 27, ראשון לציון');
  assert.equal(
    repairReadyMessage(customer, 'קורקינט X'),
    'שלום רועי, הטיפול בקורקינט X הסתיים והכלי שלך מוכן לאיסוף. ניתן להגיע לאיסוף בכתובת לישנסקי 27, ראשון לציון. נשמח לעמוד לשירותך, צוות קורטז.',
  );
  assert.match(repairReadyMessage(customer, 'קורקינט X', 'הרצל 10, תל אביב')!, /הרצל 10, תל אביב/);
});

test('repair work editor opens only for active and completed statuses', () => {
  assert.equal(repairStatusNeedsWork('התקבל'), false);
  assert.equal(repairStatusNeedsWork('בטיפול'), true);
  assert.equal(repairStatusNeedsWork('הסתיים'), true);
});
