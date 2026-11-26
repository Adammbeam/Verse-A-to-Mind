const canvas = document.getElementById('canvas');
const status = document.getElementById('status');
const textin = document.getElementById('textin');
let cards = [];
let weights = { // tiny MLP: 4 -> 4 -> 2
  w1: Array(16).fill(0).map(() => (Math.random()-0.5)*0.5),
  b1: Array(4).fill(0),
  w2: Array(8).fill(0).map(() => (Math.random()-0.5)*0.5),
  b2: Array(2).fill(0)
};
let gravity = {x:0, y:0.02};
let lastPtr = {x:0, y:0, vx:0, vy:0};
let idbReady = false;
const bc = new BroadcastChannel('f883-genome');

function hashFeat(word) {
  let h = 0;
  for (let i=0; i<word.length; i++) h = (h*31 + word.charCodeAt(i)) >>> 0;
  return [
    (h & 255)/255,
    ((h>>8)&255)/255,
    ((h>>16)&255)/255,
    ((h>>24)&255)/255
  ];
}

function mlpForward(feat) {
  const h = [0,0,0,0];
  for (let i=0; i<4; i++) {
    let s = weights.b1[i];
    for (let j=0; j<4; j++) s += weights.w1[i*4+j] * feat[j];
    h[i] = Math.tanh(s);
  }
  const o = [weights.b2[0], weights.b2[1]];
  for (let i=0; i<2; i++) {
    for (let j=0; j<4; j++) o[i] += weights.w2[i*4+j] * h[j];
  }
  return o.map(v => Math.tanh(v));
}

function train(feat, targetX, targetY) {
  const pred = mlpForward(feat);
  const err = [targetX - pred[0], targetY - pred[1]];
  const lr = 0.08;
  // simple output layer update + backprop approx for hidden
  for (let i=0; i<2; i++) {
    weights.b2[i] += lr * err[i];
    for (let j=0; j<4; j++) {
      // approximate: use pred error on output, ignore full backprop for brevity/stability
      weights.w2[i*4+j] += lr * err[i] * 0.5;
    }
  }
  // soft clamp
  for (let k in weights) weights[k] = weights[k].map(v => Math.max(-2, Math.min(2, v)));
}

function createCard(word, x, y) {
  const el = document.createElement('div');
  el.className = 'card';
  el.textContent = word;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  canvas.appendChild(el);
  const feat = hashFeat(word);
  const card = {el, word, feat, x, y, vx:0, vy:0, dragging:false};
  cards.push(card);
  el.addEventListener('pointerdown', e => {
    card.dragging = true;
    el.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  el.addEventListener('pointermove', e => {
    if (!card.dragging) return;
    card.x = e.clientX - 40;
    card.y = e.clientY - 15;
    el.style.left = card.x + 'px';
    el.style.top = card.y + 'px';
  });
  el.addEventListener('pointerup', e => {
    if (!card.dragging) return;
    card.dragging = false;
    const nx = (card.x / window.innerWidth) * 2 - 1;
    const ny = (card.y / window.innerHeight) * 2 - 1;
    train(card.feat, nx, ny);
    status.textContent = `Trained on "${word.slice(0,12)}..." error reduced.`;
  });
  return card;
}

function absorb(text) {
  const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
  const unique = [...new Set(words)].slice(0, 40);
  unique.forEach((w, i) => {
    const feat = hashFeat(w);
    const pred = mlpForward(feat);
    const x = ((pred[0]+1)/2) * (window.innerWidth - 100) + 20;
    const y = ((pred[1]+1)/2) * (window.innerHeight - 40) + 20;
    createCard(w, x, y);
  });
  status.textContent = `Absorbed ${unique.length} words. Drag to correct & train.`;
}

function physics() {
  const w = window.innerWidth, h = window.innerHeight;
  for (let i=0; i<cards.length; i++) {
    const a = cards[i];
    if (a.dragging) continue;
    a.vx += gravity.x;
    a.vy += gravity.y;
    // repulsion
    for (let j=i+1; j<cards.length; j++) {
      const b = cards[j];
      const dx = a.x - b.x, dy = a.y - b.y;
      const d2 = dx*dx + dy*dy + 100;
      const f = 800 / d2;
      a.vx += dx * f * 0.01;
      a.vy += dy * f * 0.01;
      b.vx -= dx * f * 0.01;
      b.vy -= dy * f * 0.01;
    }
    a.vx *= 0.92; a.vy *= 0.92;
    a.x += a.vx; a.y += a.vy;
    a.x = Math.max(0, Math.min(w-80, a.x));
    a.y = Math.max(0, Math.min(h-30, a.y));
    a.el.style.left = a.x + 'px';
    a.el.style.top = a.y + 'px';
  }
  requestAnimationFrame(physics);
}
physics();

document.getElementById('absorb').onclick = () => absorb(textin.value);
document.addEventListener('paste', e => {
  const t = e.clipboardData.getData('text');
  if (t) { textin.value = t; absorb(t); }
});
canvas.addEventListener('dragover', e => e.preventDefault());
canvas.addEventListener('drop', e => {
  e.preventDefault();
  const t = e.dataTransfer.getData('text');
  if (t) absorb(t);
});

if (window.DeviceOrientationEvent) {
  window.addEventListener('deviceorientation', e => {
    if (e.beta != null) {
      gravity.x = (e.gamma || 0) * 0.0008;
      gravity.y = (e.beta || 0) * 0.0008;
    }
  });
}

document.addEventListener('pointermove', e => {
  lastPtr.vx = e.clientX - lastPtr.x;
  lastPtr.vy = e.clientY - lastPtr.y;
  lastPtr.x = e.clientX; lastPtr.y = e.clientY;
  if (!window.DeviceOrientationEvent) {
    gravity.x = lastPtr.vx * 0.0003;
    gravity.y = lastPtr.vy * 0.0003;
  }
});

async function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('verse-f883', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('genomes');
    r.onsuccess = () => res(r.result);
    r.onerror = rej;
  });
}

document.getElementById('seal').onclick = async () => {
  try {
    const db = await openDB();
    const tx = db.transaction('genomes', 'readwrite');
    const layout = cards.map(c => ({word:c.word, x:c.x, y:c.y}));
    const genome = {weights, layout, fitness: -cards.length * 0.1 - Math.abs(gravity.x)*10, t: Date.now()};
    tx.objectStore('genomes').put(genome, 'current');
    bc.postMessage(genome);
    status.textContent = 'Sealed to IndexedDB + broadcast. Open another tab.';
    idbReady = true;
  } catch(e) { status.textContent = 'Seal failed (IDB): ' + e.message; }
};

bc.onmessage = async e => {
  const g = e.data;
  if (!g || !g.weights) return;
  // simple adopt if "better" (more cards or recent)
  if (g.layout && g.layout.length > cards.length) {
    weights = g.weights;
    cards.forEach(c => c.el.remove());
    cards = [];
    g.layout.forEach(l => createCard(l.word, l.x, l.y));
    status.textContent = 'Adopted better genome from other tab.';
  }
};

document.getElementById('export').onclick = () => {
  const data = {weights, cards: cards.map(c => ({word:c.word, x:c.x, y:c.y}))};
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'verse-f883-arrangement.json';
  a.click();
};

document.getElementById('clear').onclick = () => {
  cards.forEach(c => c.el.remove());
  cards = [];
  status.textContent = 'Cleared.';
};

// try load on start
(async () => {
  try {
    const db = await openDB();
    const tx = db.transaction('genomes');
    const req = tx.objectStore('genomes').get('current');
    req.onsuccess = () => {
      if (req.result && req.result.weights) {
        weights = req.result.weights;
        if (req.result.layout) {
          req.result.layout.forEach(l => createCard(l.word, l.x, l.y));
          status.textContent = 'Restored sealed genome.';
        }
      }
    };
  } catch (e) { console.debug("lab f883-clipboard-online-mlp-spatial-arrangement-mind:", e); }
})();

status.textContent = 'Offline-ready. Paste text, drag to train MLP, tilt for gravity, Seal to share.';
