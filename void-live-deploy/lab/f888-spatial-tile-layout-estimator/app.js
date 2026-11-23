const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const unitsEl = document.getElementById('units');
const tileWEl = document.getElementById('tileW');
const tileLEl = document.getElementById('tileL');
const wasteEl = document.getElementById('waste');
const roomList = document.getElementById('roomList');
const totalsEl = document.getElementById('totals');
const detailsEl = document.getElementById('details');

let rooms = [];
let drag = null;
let scale = 20; // pixels per unit
let offset = {x:40, y:40};

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,5); }

function save() {
  try {
    localStorage.setItem('verse-f888-layout', JSON.stringify({rooms, units: unitsEl.value, tileW: tileWEl.value, tileL: tileLEl.value, waste: wasteEl.value}));
  } catch (e) { console.debug("lab f888-spatial-tile-layout-estimator:", e); }
}

function load() {
  try {
    const raw = localStorage.getItem('verse-f888-layout');
    if (!raw) return;
    const d = JSON.parse(raw);
    rooms = d.rooms || [];
    if (d.units) unitsEl.value = d.units;
    if (d.tileW) tileWEl.value = d.tileW;
    if (d.tileL) tileLEl.value = d.tileL;
    if (d.waste) wasteEl.value = d.waste;
  } catch (e) { console.debug("lab f888-spatial-tile-layout-estimator:", e); }
}

function addRoom(name = 'Room', w = 12, l = 14) {
  rooms.push({ id: uid(), name, w: +w, l: +l, x: 2 + rooms.length * 1.5, y: 2 + (rooms.length % 3) });
  renderList();
  redraw();
  save();
}

function renderList() {
  roomList.innerHTML = '';
  rooms.forEach(r => {
    const div = document.createElement('div');
    div.className = 'room-card';
    div.innerHTML = `<strong>${r.name}</strong> ${r.w}×${r.l} <button data-id="${r.id}" class="del secondary">×</button>`;
    roomList.appendChild(div);
  });
  roomList.querySelectorAll('.del').forEach(b => b.onclick = () => {
    rooms = rooms.filter(r => r.id !== b.dataset.id);
    renderList(); redraw(); save();
  });
}

function getTileArea() {
  const tw = +tileWEl.value || 1;
  const tl = +tileLEl.value || 1;
  // convert tile to same unit as rooms
  const u = unitsEl.value;
  let twu = tw, tlu = tl;
  if (u === 'ft') { /* assume tile in inches */ twu = tw / 12; tlu = tl / 12; }
  else { /* metres, assume tile in cm */ twu = tw / 100; tlu = tl / 100; }
  return twu * tlu;
}

function calc() {
  const waste = (+wasteEl.value || 0) / 100;
  const ta = getTileArea();
  let totalArea = 0, totalTiles = 0;
  const lines = [];
  rooms.forEach(r => {
    const area = r.w * r.l;
    totalArea += area;
    const needed = Math.ceil(area / ta * (1 + waste));
    totalTiles += needed;
    lines.push({ name: r.name, area: area.toFixed(1), tiles: needed });
  });
  return { totalArea, totalTiles, lines, ta };
}

function redraw() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = Math.min(500, rect.width * 0.7) * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = (canvas.height / dpr) + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // auto scale to fit
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  rooms.forEach(r => {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.l);
  });
  if (!rooms.length) { minX=0; minY=0; maxX=20; maxY=15; }
  const pad = 2;
  const viewW = (maxX - minX) + pad*2;
  const viewH = (maxY - minY) + pad*2;
  const cw = canvas.width / dpr, ch = canvas.height / dpr;
  scale = Math.min((cw - 40) / viewW, (ch - 40) / viewH);
  offset.x = 20 - minX * scale + pad * scale;
  offset.y = 20 - minY * scale + pad * scale;

  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, cw, ch);

  // grid
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 1;
  for (let x=0; x<cw; x+=scale) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,ch); ctx.stroke(); }
  for (let y=0; y<ch; y+=scale) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(cw,y); ctx.stroke(); }

  const c = calc();
  rooms.forEach(r => {
    const x = offset.x + r.x * scale;
    const y = offset.y + r.y * scale;
    const w = r.w * scale;
    const h = r.l * scale;
    ctx.fillStyle = 'rgba(79,209,197,0.25)';
    ctx.strokeStyle = '#4fd1c5';
    ctx.lineWidth = 2;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);

    // tile grid
    const ta = c.ta;
    const tilesAcross = Math.ceil(r.w / Math.sqrt(ta));
    const tilesDown = Math.ceil(r.l / Math.sqrt(ta));
    ctx.strokeStyle = 'rgba(79,209,197,0.3)';
    ctx.lineWidth = 0.5;
    for (let i=1; i<tilesAcross; i++) {
      const px = x + (i / tilesAcross) * w;
      ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y+h); ctx.stroke();
    }
    for (let i=1; i<tilesDown; i++) {
      const py = y + (i / tilesDown) * h;
      ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x+w, py); ctx.stroke();
    }

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '14px system-ui';
    ctx.fillText(r.name, x + 8, y + 20);
    ctx.font = '12px system-ui';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`${r.w}×${r.l} ${unitsEl.value}`, x + 8, y + 38);
  });

  updateSummary(c);
}

function updateSummary(c) {
  if (!rooms.length) {
    totalsEl.textContent = 'Add rooms to see totals';
    detailsEl.innerHTML = '';
    return;
  }
  const u = unitsEl.value;
  totalsEl.innerHTML = `Total area: <span class="warn">${c.totalArea.toFixed(1)} ${u}²</span> · Tiles needed: <span class="warn">${c.totalTiles}</span>`;
  detailsEl.innerHTML = c.lines.map(l => `${l.name}: ${l.area} ${u}² → ${l.tiles} tiles`).join('<br>');
}

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function toWorld(px, py) {
  return { x: (px - offset.x) / scale, y: (py - offset.y) / scale };
}

canvas.addEventListener('pointerdown', e => {
  const p = getPos(e);
  const w = toWorld(p.x, p.y);
  for (let i = rooms.length - 1; i >= 0; i--) {
    const r = rooms[i];
    if (w.x >= r.x && w.x <= r.x + r.w && w.y >= r.y && w.y <= r.y + r.l) {
      drag = { room: r, dx: w.x - r.x, dy: w.y - r.y };
      canvas.setPointerCapture(e.pointerId);
      break;
    }
  }
});
canvas.addEventListener('pointermove', e => {
  if (!drag) return;
  const p = getPos(e);
  const w = toWorld(p.x, p.y);
  drag.room.x = w.x - drag.dx;
  drag.room.y = w.y - drag.dy;
  redraw();
});
canvas.addEventListener('pointerup', e => { drag = null; save(); });
canvas.addEventListener('pointercancel', () => { drag = null; });

document.getElementById('addRoom').onclick = () => {
  const name = prompt('Room name', 'Room ' + (rooms.length + 1)) || 'Room';
  const w = prompt('Width (' + unitsEl.value + ')', '12') || 12;
  const l = prompt('Length (' + unitsEl.value + ')', '14') || 14;
  addRoom(name, w, l);
};

['input','change'].forEach(ev => {
  unitsEl.addEventListener(ev, () => { redraw(); save(); });
  tileWEl.addEventListener(ev, () => { redraw(); save(); });
  tileLEl.addEventListener(ev, () => { redraw(); save(); });
  wasteEl.addEventListener(ev, () => { redraw(); save(); });
});

document.getElementById('png').onclick = () => {
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = 'flooring-layout.png';
  a.click();
};

document.getElementById('csv').onclick = () => {
  const c = calc();
  let csv = 'Room,Width,Length,Area,Tiles\n';
  rooms.forEach(r => {
    const area = r.w * r.l;
    const tiles = Math.ceil(area / c.ta * (1 + (+wasteEl.value||0)/100));
    csv += `"${r.name}",${r.w},${r.l},${area.toFixed(2)},${tiles}\n`;
  });
  csv += `\nTotal,,,${c.totalArea.toFixed(2)},${c.totalTiles}\n`;
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tile-list.csv';
  a.click();
};

document.getElementById('copy').onclick = () => {
  const c = calc();
  const text = `Flooring estimate (${unitsEl.value}): total area ${c.totalArea.toFixed(1)} ${unitsEl.value}², tiles ${c.totalTiles} (waste ${wasteEl.value}%). ` +
    c.lines.map(l => `${l.name} ${l.tiles}`).join(', ');
  navigator.clipboard.writeText(text).then(() => alert('Copied'));
};

document.getElementById('clear').onclick = () => {
  if (confirm('Clear all rooms?')) { rooms = []; renderList(); redraw(); save(); }
};

window.addEventListener('resize', redraw);
load();
renderList();
redraw();
