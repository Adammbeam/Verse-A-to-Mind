// Invoice totals for /invoice/. Money is integer cents. Nothing is stored and nothing is sent.
// A test names this file: tools/invoice.test.mjs.

export const CURRENCIES = Object.freeze(['USD', 'EUR', 'GBP', 'CAD', 'AUD']);

/** A typed amount as cents. Blank, negative and junk are 0. Pure. */
export function moneyCents(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed || trimmed.startsWith('-')) return 0;
  const raw = trimmed.replace(/[^0-9.]/g, '');
  if (!raw || raw === '.') return 0;
  const [whole, frac = ''] = raw.split('.');
  const digits = (frac + '00').slice(0, 3);
  const cents = Number(whole || '0') * 100 + Number(digits.slice(0, 2));
  const bump = Number(digits[2] || '0') >= 5 ? 1 : 0;
  const out = cents + bump;
  return Number.isFinite(out) ? out : 0;
}

/** A percent from 0 to 100. Zero and blank mean "not set". Pure. */
export function percentOf(text) {
  const n = Number(String(text ?? '').trim());
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, 100);
}

/** Quantity times a unit price, in cents. Pure. */
export function lineCents(qtyText, priceText) {
  const q = Number(String(qtyText ?? '').trim());
  if (!Number.isFinite(q) || q <= 0) return 0;
  return Math.round(q * moneyCents(priceText));
}

/**
 * Totals for one invoice. A discount percent, when set, is used instead of a flat discount.
 * The discount cannot exceed the subtotal. Tax is applied after the discount. Pure.
 */
export function buildInvoice(input) {
  const src = input || {};
  const currency = CURRENCIES.includes(src.currency) ? src.currency : 'USD';
  const rows = (src.lines || []).map((line) => {
    const amount = lineCents(line && line.qty, line && line.price);
    return {
      description: String((line && line.description) || '').trim().slice(0, 180),
      qty: String((line && line.qty) ?? '').trim(),
      price: moneyCents(line && line.price),
      amount,
    };
  }).filter((row) => row.description || row.amount);
  const subtotal = rows.reduce((sum, row) => sum + row.amount, 0);
  const discountPercent = percentOf(src.discountPercent);
  const flat = moneyCents(src.discountAmount);
  const discount = Math.min(subtotal, discountPercent > 0 ? Math.round(subtotal * discountPercent / 100) : flat);
  const after = subtotal - discount;
  const taxPercent = percentOf(src.taxPercent);
  const tax = Math.round(after * taxPercent / 100);
  return { currency, rows, subtotal, discount, discountPercent, tax, taxPercent, total: after + tax };
}

/** Cents as a currency string. Pure. */
export function moneyText(cents, currency) {
  const code = CURRENCIES.includes(currency) ? currency : 'USD';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format((Number(cents) || 0) / 100);
}

/** One share-link line: "description|qty|price". Pure. */
export function parseShareLine(text) {
  const parts = String(text || '').split('|');
  if (parts.length < 3) return null;
  return { description: parts.slice(0, -2).join('|'), qty: parts[parts.length - 2], price: parts[parts.length - 1] };
}
