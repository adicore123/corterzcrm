import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customerInput, customerSchema } from '../src/lib/validation/models';
import { repairReadyMessage } from '../src/lib/whatsapp-card';

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
  assert.equal(customerSchema.parse({ ...record, store: 'פרטי' }).customerType, 'private');
  assert.equal(customerSchema.parse({ ...record, store: 'חנות' }).customerType, undefined);
  assert.equal(customerSchema.parse({ ...record, store: 'פרטי', customerType: 'store' }).customerType, 'store');
});
