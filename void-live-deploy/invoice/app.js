import { NAV } from '/lib/verse-shell.js';
import { buildInvoice, moneyText, parseShareLine } from '/lib/invoice.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };

function chrome() {
  if (document.getElementById('verse-nav')) return;
  const header = el('header', '', 'vs-chrome');
  const nav = el('nav', '', 'vs-app');
  nav.id = 'verse-nav';
  nav.setAttribute('aria-label', 'Verse');
  const brand = el('a', 'Verse', 'vs-brand');
  brand.href = '/';
  const links = el('div', '', 'vs-links');
  links.style.cssText = 'display:flex;flex:1;min-width:0;overflow-x:auto';
  for (const item of NAV) { const a = el('a', item.label); a.href = item.href; links.append(a); }
  const k = el('button', '', 'vs-k');
  k.type = 'button';
  k.setAttribute('aria-label', 'Commands ⌘K');
  k.append(el('span', '⌘K'));
  k.firstChild.setAttribute('aria-hidden', 'true');
  nav.append(brand, links, k);
  header.append(nav);
  document.body.prepend(header);
}

function addLine(line) {
  line = { description: '', qty: '1', price: '', ...(line || {}) };
  const i = $('lines').children.length;
  const row = el('div', '', 'line');
  const make = (id, label, value) => {
    const input = el('input');
    input.id = id + '-' + i; input.type = 'text'; input.maxLength = 180; input.placeholder = label;
    input.setAttribute('aria-label', label); if (id !== 'desc') input.inputMode = 'decimal';
    input.value = value || ''; input.addEventListener('input', draw);
    return input;
  };
  const remove = el('button', 'Remove');
  remove.type = 'button';
  remove.addEventListener('click', () => { if ($('lines').children.length > 1) { row.remove(); draw(); } });
  row.append(make('desc', 'Description', line.description), make('qty', 'Quantity', line.qty), make('price', 'Price', line.price), remove);
  $('lines').append(row);
}

function fields() {
  return {
    currency: $('currency').value, discountPercent: $('discount-pct').value, discountAmount: $('discount-amt').value, taxPercent: $('tax').value,
    lines: [...$('lines').querySelectorAll('.line')].map((row) => { const [d, qty, price] = row.querySelectorAll('input'); return { description: d.value, qty: qty.value, price: price.value }; }),
  };
}

function textBlock(title, body) {
  const wrap = el('div'); wrap.append(el('h3', title), el('p', body || '—')); return wrap;
}

function draw() {
  const rows = [...$('lines').children];
  rows.forEach((row) => { row.querySelector('button').disabled = rows.length < 2; });
  const bill = buildInvoice(fields());
  const sheet = $('sheet');
  sheet.replaceChildren();
  const meta = el('p', ['No. ' + ($('number').value || '—'), $('issued').value, $('due').value ? 'Due ' + $('due').value : ''].filter(Boolean).join(' · '), 'fine');
  const parties = el('div', '', 'parties');
  parties.append(textBlock('From', [$('biz').value, $('biz-addr').value].filter(Boolean).join('\n')), textBlock('Bill to', [$('client').value, $('client-addr').value].filter(Boolean).join('\n')));
  const table = el('table');
  const head = el('tr');
  ['Description', 'Qty', 'Price', 'Amount'].forEach((label, n) => head.append(el('th', label, n ? 'num' : '')));
  table.append(head);
  for (const row of (bill.rows.length ? bill.rows : [{ description: 'No lines yet', qty: '', price: 0, amount: 0 }])) {
    const tr = el('tr');
    [row.description, row.qty, row.price ? moneyText(row.price, bill.currency) : '', moneyText(row.amount, bill.currency)].forEach((value, n) => tr.append(el('td', value, n ? 'num' : '')));
    table.append(tr);
  }
  const bits = ['Subtotal ' + moneyText(bill.subtotal, bill.currency)];
  if (bill.discount) bits.push('Discount ' + moneyText(bill.discount, bill.currency));
  if (bill.tax) bits.push('Tax ' + moneyText(bill.tax, bill.currency));
  bits.push('Total ' + moneyText(bill.total, bill.currency));
  const totals = el('p', bits.join(' · '));
  totals.id = 'total';
  sheet.append(el('h2', 'Invoice'), meta, parties, table, totals, el('p', $('notes').value), el('p', 'Prepared in the browser. Nothing was sent to a server.', 'fine'));
}

function shareUrl() {
  const u = new URL(location.href);
  const set = (key, value) => { if (value) u.searchParams.set(key, value); else u.searchParams.delete(key); };
  for (const [key, id] of [['biz', 'biz'], ['from', 'biz-addr'], ['client', 'client'], ['to', 'client-addr'], ['n', 'number'], ['date', 'issued'], ['due', 'due'], ['cur', 'currency'], ['disc', 'discount-pct'], ['off', 'discount-amt'], ['tax', 'tax'], ['notes', 'notes']]) set(key, $(id).value.trim());
  u.searchParams.delete('l');
  for (const line of fields().lines) if (line.description || line.price) u.searchParams.append('l', [line.description, line.qty, line.price].join('|'));
  return u.toString();
}

chrome();
await import('/verse-shell.js');
$('issued').value = q.get('date') || new Date().toISOString().slice(0, 10);
for (const [id, key] of [['biz', 'biz'], ['biz-addr', 'from'], ['client', 'client'], ['client-addr', 'to'], ['number', 'n'], ['due', 'due'], ['discount-pct', 'disc'], ['discount-amt', 'off'], ['tax', 'tax'], ['notes', 'notes']]) if (q.get(key)) $(id).value = q.get(key);
if (q.get('cur')) $('currency').value = q.get('cur');
const shared = q.getAll('l').map(parseShareLine).filter(Boolean);
(shared.length ? shared : [{}]).forEach(addLine);
for (const id of ['biz', 'biz-addr', 'client', 'client-addr', 'number', 'issued', 'due', 'discount-pct', 'discount-amt', 'tax', 'notes', 'currency']) $(id).addEventListener('input', draw);
$('currency').addEventListener('change', draw);
$('add').addEventListener('click', () => { addLine(); draw(); });
$('example').addEventListener('click', () => {
  if (!$('biz').value) $('biz').value = 'Harbor Studio';
  if (!$('client').value) $('client').value = 'North Pier';
  $('lines').replaceChildren();
  addLine({ description: 'Design work', qty: '3', price: '50' });
  draw();
});
$('print').addEventListener('click', () => window.print());
$('copy').addEventListener('click', async () => {
  const url = shareUrl();
  try { await navigator.clipboard.writeText(url); $('say').textContent = 'Link copied.'; }
  catch { $('say').textContent = url; }
});
draw();
