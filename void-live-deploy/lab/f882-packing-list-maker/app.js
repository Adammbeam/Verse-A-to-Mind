const KEY = 'verse-f882-packing';
const $ = id => document.getElementById(id);
const daysEl = $('days'), weatherEl = $('weather'), typeEl = $('type'), notesEl = $('notes');
const listEl = $('list'), statusEl = $('status');

let items = [];
let checks = {};

function baseItems(days, weather, type) {
  const clothes = Math.max(3, Math.ceil(days * 0.7));
  const underwear = days + 1;
  const socks = days + 2;
  let list = [
    { cat: 'Documents', name: 'ID / passport', qty: 1 },
    { cat: 'Documents', name: 'Tickets / boarding passes', qty: 1 },
    { cat: 'Documents', name: 'Wallet / cards / cash', qty: 1 },
    { cat: 'Clothing', name: 'Underwear', qty: underwear },
    { cat: 'Clothing', name: 'Socks', qty: socks },
    { cat: 'Clothing', name: 'T-shirts / tops', qty: clothes },
    { cat: 'Clothing', name: 'Pants / shorts', qty: Math.max(2, Math.ceil(days / 3)) },
    { cat: 'Clothing', name: 'Sleepwear', qty: 1 },
    { cat: 'Clothing', name: 'Comfortable shoes', qty: 1 },
    { cat: 'Toiletries', name: 'Toothbrush & toothpaste', qty: 1 },
    { cat: 'Toiletries', name: 'Deodorant', qty: 1 },
    { cat: 'Toiletries', name: 'Shampoo / soap (travel)', qty: 1 },
    { cat: 'Toiletries', name: 'Medications / prescriptions', qty: 1 },
    { cat: 'Electronics', name: 'Phone & charger', qty: 1 },
    { cat: 'Electronics', name: 'Power bank', qty: 1 },
    { cat: 'Other', name: 'Reusable water bottle', qty: 1 },
    { cat: 'Other', name: 'Daypack / bag', qty: 1 },
  ];

  if (weather === 'hot' || weather === 'mixed') {
    list.push({ cat: 'Clothing', name: 'Sunglasses', qty: 1 });
    list.push({ cat: 'Clothing', name: 'Hat / cap', qty: 1 });
    list.push({ cat: 'Toiletries', name: 'Sunscreen', qty: 1 });
  }
  if (weather === 'cold' || weather === 'mixed') {
    list.push({ cat: 'Clothing', name: 'Warm jacket / layers', qty: 1 });
    list.push({ cat: 'Clothing', name: 'Sweater', qty: 1 });
  }
  if (weather === 'rainy') {
    list.push({ cat: 'Clothing', name: 'Rain jacket / umbrella', qty: 1 });
    list.push({ cat: 'Clothing', name: 'Waterproof shoes or covers', qty: 1 });
  }

  if (type === 'beach') {
    list.push({ cat: 'Clothing', name: 'Swimwear', qty: 2 });
    list.push({ cat: 'Other', name: 'Beach towel', qty: 1 });
    list.push({ cat: 'Toiletries', name: 'After-sun lotion', qty: 1 });
  }
  if (type === 'hiking') {
    list.push({ cat: 'Clothing', name: 'Hiking boots', qty: 1 });
    list.push({ cat: 'Clothing', name: 'Extra socks', qty: 2 });
    list.push({ cat: 'Other', name: 'First aid kit', qty: 1 });
    list.push({ cat: 'Other', name: 'Map / GPS / offline maps', qty: 1 });
  }
  if (type === 'business') {
    list.push({ cat: 'Clothing', name: 'Business attire / suit', qty: 1 });
    list.push({ cat: 'Electronics', name: 'Laptop & charger', qty: 1 });
    list.push({ cat: 'Documents', name: 'Business cards / notes', qty: 1 });
  }
  if (type === 'camping') {
    list.push({ cat: 'Other', name: 'Tent / sleeping bag', qty: 1 });
    list.push({ cat: 'Other', name: 'Headlamp', qty: 1 });
    list.push({ cat: 'Other', name: 'Multi-tool', qty: 1 });
  }
  if (type === 'city') {
    list.push({ cat: 'Other', name: 'Comfortable walking shoes', qty: 1 });
  }

  return list;
}

function generate() {
  const days = Math.max(1, parseInt(daysEl.value) || 5);
  const weather = weatherEl.value;
  const type = typeEl.value;
  items = baseItems(days, weather, type);
  const prev = { ...checks };
  checks = {};
  items.forEach(it => {
    const key = it.name;
    if (prev[key]) checks[key] = true;
  });
  render();
  save();
  statusEl.textContent = `List for ${days} day(s), ${weather}, ${type}.`;
}

function render() {
  listEl.innerHTML = '';
  const byCat = {};
  items.forEach(it => {
    if (!byCat[it.cat]) byCat[it.cat] = [];
    byCat[it.cat].push(it);
  });
  Object.keys(byCat).forEach(cat => {
    const h = document.createElement('div');
    h.className = 'category';
    h.textContent = cat;
    listEl.appendChild(h);
    byCat[cat].forEach(it => {
      const div = document.createElement('div');
      div.className = 'item';
      const id = 'it-' + it.name.replace(/\W/g, '');
      const checked = !!checks[it.name];
      div.innerHTML = `<input type="checkbox" id="${id}" ${checked ? 'checked' : ''} data-name="${it.name}">
        <label for="${id}">${it.name} <span class="qty">×${it.qty}</span></label>`;
      div.querySelector('input').addEventListener('change', e => {
        checks[it.name] = e.target.checked;
        save();
      });
      listEl.appendChild(div);
    });
  });
}

function save() {
  try {
    const data = {
      days: daysEl.value,
      weather: weatherEl.value,
      type: typeEl.value,
      notes: notesEl.value,
      checks,
      custom: items.filter(i => i.custom).map(i => i.name)
    };
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) { console.debug("lab f882-packing-list-maker:", e); }
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) { generate(); return; }
    const data = JSON.parse(raw);
    daysEl.value = data.days || 5;
    weatherEl.value = data.weather || 'mixed';
    typeEl.value = data.type || 'city';
    notesEl.value = data.notes || '';
    checks = data.checks || {};
    generate();
    if (data.custom) {
      data.custom.forEach(name => {
        if (!items.some(i => i.name === name)) {
          items.push({ cat: 'Custom', name, qty: 1, custom: true });
        }
      });
      render();
    }
  } catch (e) { generate(); }
}

function textList(onlyUnchecked = false) {
  let text = `Packing list (${daysEl.value} days, ${weatherEl.value}, ${typeEl.value})\n`;
  if (notesEl.value) text += `Notes: ${notesEl.value}\n`;
  text += '\n';
  const byCat = {};
  items.forEach(it => {
    if (onlyUnchecked && checks[it.name]) return;
    if (!byCat[it.cat]) byCat[it.cat] = [];
    byCat[it.cat].push(it);
  });
  Object.keys(byCat).forEach(cat => {
    text += cat + ':\n';
    byCat[cat].forEach(it => {
      const mark = checks[it.name] ? '[x]' : '[ ]';
      text += `  ${mark} ${it.name} ×${it.qty}\n`;
    });
    text += '\n';
  });
  return text;
}

$('generate').onclick = generate;
$('copy').onclick = async () => {
  const t = textList(false);
  try {
    await navigator.clipboard.writeText(t);
    statusEl.textContent = 'Copied to clipboard.';
  } catch (e) {
    statusEl.textContent = 'Copy failed (permission). Select and copy manually.';
  }
};
$('download').onclick = () => {
  const t = textList(false);
  const blob = new Blob([t], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'packing-list.txt';
  a.click();
  URL.revokeObjectURL(a.href);
  statusEl.textContent = 'Downloaded.';
};
$('clear').onclick = () => {
  checks = {};
  render();
  save();
};
$('addCustom').onclick = () => {
  const name = $('custom').value.trim();
  if (!name) return;
  if (!items.some(i => i.name === name)) {
    items.push({ cat: 'Custom', name, qty: 1, custom: true });
    checks[name] = false;
    render();
    save();
  }
  $('custom').value = '';
};

daysEl.addEventListener('change', generate);
weatherEl.addEventListener('change', generate);
typeEl.addEventListener('change', generate);
notesEl.addEventListener('input', save);

load();
