import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInvoice, moneyCents, moneyText, parseShareLine } from '../void-live-deploy/lib/invoice.js';

test('3 hours of design at 50 dollars is 150 dollars', () => {
  const bill = buildInvoice({
    currency: 'USD',
    lines: [{ description: 'Design work', qty: '3', price: '50' }],
  });
  assert.equal(bill.subtotal, 15000);
  assert.equal(bill.total, 15000);
  assert.equal(moneyText(bill.total, 'USD'), '$150.00');
});

test('tax and a percent discount apply in that order, and a percent beats a flat amount', () => {
  const bill = buildInvoice({
    lines: [{ description: 'Design work', qty: '3', price: '50' }],
    discountPercent: '10',
    discountAmount: '20',
    taxPercent: '10',
  });
  assert.equal(bill.discount, 1500);
  assert.equal(bill.tax, 1350);
  assert.equal(bill.total, 14850);
});

test('a flat discount is used when no percent is set, and it cannot exceed the subtotal', () => {
  const flat = buildInvoice({ lines: [{ description: 'Work', qty: '1', price: '150' }], discountAmount: '20' });
  assert.equal(flat.discount, 2000);
  assert.equal(flat.total, 13000);
  const over = buildInvoice({ lines: [{ description: 'Work', qty: '1', price: '40' }], discountAmount: '90' });
  assert.equal(over.total, 0);
});

test('blank, junk and negative amounts add nothing', () => {
  assert.equal(moneyCents(''), 0);
  assert.equal(moneyCents('-12'), 0);
  assert.equal(moneyCents('1.005'), 101);
  const bill = buildInvoice({ lines: [{ description: '', qty: '-2', price: 'nope' }, { description: 'Hour', qty: '1.5', price: '10' }] });
  assert.equal(bill.rows.length, 1);
  assert.equal(bill.total, 1500);
});

test('a share line keeps the description even when it contains a bar', () => {
  assert.deepEqual(parseShareLine('Design work|3|50'), { description: 'Design work', qty: '3', price: '50' });
  assert.equal(parseShareLine('only-two|3'), null);
});
