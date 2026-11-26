const N = 12; // portals
const SEQ = 8;
const DIM = 4;
const HEADS = 2;
const portals = [];
let fitness = 1.0;
let weights = { Wq: randomMat(DIM, DIM), Wk: randomMat(DIM, DIM), Wv: randomMat(DIM, DIM), Wo: randomMat(DIM, DIM) };
let buffer = Array(SEQ).fill(null).map(() => [0, 0, 0, 0]);
let bufIdx = 0;
let orient = { beta: 0, gamma: 0 };
let pointer = { x: 0, y: 0, vx: 0, vy: 0 };
let modeOrient = false;

function randomMat(r, c) {
  const m = [];
  for (let i = 0; i < r; i++) {
    const row = [];
    for (let j = 0; j < c; j++) row.push((Math.random() - 0.5) * 0.4);
    m.push(row);
  }
  return m;
}
function matMul(A, B) { // A (m x k), B (k x n)
  const m = A.length, k = A[0].length, n = B[0].length;
  const C = Array(m).fill(0).map(() => Array(n).fill(0));
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++)
      for (let t = 0; t < k; t++) C[i][j] += A[i][t] * B[t][j];
  return C;
}
function vecMul(M, v) {
  return M.map(row => row.reduce((s, w, i) => s + w * v[i], 0));
}
function softmax(xs) {
  const m = Math.max(...xs);
  const ex = xs.map(x => Math.exp(x - m));
  const s = ex.reduce((a, b) => a + b, 0);
  return ex.map(e => e / s);
}

// Create portals
for (let i = 0; i < N; i++) {
  const el = document.createElement('div');
  el.className = 'portal';
  el.textContent = 'P' + i;
  el.style.left = (80 + Math.random() * (innerWidth - 160)) + 'px';
  el.style.top = (80 + Math.random() * (innerHeight - 160)) + 'px';
  document.body.appendChild(el);
  portals.push({ el, x: parseFloat(el.style.left), y: parseFloat(el.style.top), vx: 0, vy: 0, id: i });
  el.addEventListener('pointerdown', e => { e.preventDefault(); rewardPortal(i); });
  makeDraggable(el, portals[i]);
}
function makeDraggable(el, p) {
  let dx, dy;
  el.addEventListener('pointerdown', e => {
    dx = e.clientX - p.x; dy = e.clientY - p.y;
    const move = ev => { p.x = ev.clientX - dx; p.y = ev.clientY - dy; };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  });
}

window.addEventListener('deviceorientation', e => {
  if (e.beta != null) { orient.beta = e.beta; orient.gamma = e.gamma; modeOrient = true; }
});
window.addEventListener('pointermove', e => {
  pointer.vx = e.clientX - pointer.x; pointer.vy = e.clientY - pointer.y;
  pointer.x = e.clientX; pointer.y = e.clientY;
});

function pushBuffer() {
  const b = modeOrient ? orient.beta / 90 : pointer.vx / 20;
  const g = modeOrient ? orient.gamma / 90 : pointer.vy / 20;
  buffer[bufIdx] = [b, g, Math.sin(Date.now() / 1000), fitness * 0.1];
  bufIdx = (bufIdx + 1) % SEQ;
}

function computeAttentionForces() {
  const embeds = buffer.map(v => v.slice()); // already dim 4
  const Qs = embeds.map(e => vecMul(weights.Wq, e));
  const Ks = embeds.map(e => vecMul(weights.Wk, e));
  // Simplified: use last Q against all K for global bias, then pairwise from portal positions
  const lastQ = Qs[SEQ - 1] || Qs[0];
  const scores = Ks.map(k => lastQ.reduce((s, q, i) => s + q * k[i], 0) / Math.sqrt(DIM));
  const attn = softmax(scores);
  // Map attention to portal forces (cycle through portals)
  for (let i = 0; i < N; i++) {
    const a = attn[i % SEQ];
    const target = portals[(i + 1) % N];
    const dx = target.x - portals[i].x;
    const dy = target.y - portals[i].y;
    const dist = Math.hypot(dx, dy) + 1;
    const force = (a - 0.5) * 80 / dist;
    portals[i].vx += (dx / dist) * force * 0.15;
    portals[i].vy += (dy / dist) * force * 0.15;
    // Weak centering
    portals[i].vx += (innerWidth / 2 - portals[i].x) * 0.0008;
    portals[i].vy += (innerHeight / 2 - portals[i].y) * 0.0008;
  }
}

function step() {
  pushBuffer();
  computeAttentionForces();
  for (const p of portals) {
    p.vx *= 0.92; p.vy *= 0.92;
    p.x += p.vx; p.y += p.vy;
    p.x = Math.max(20, Math.min(innerWidth - 90, p.x));
    p.y = Math.max(20, Math.min(innerHeight - 70, p.y));
    p.el.style.left = p.x + 'px';
    p.el.style.top = p.y + 'px';
    p.el.style.transform = `scale(${1 + Math.min(0.3, Math.hypot(p.vx, p.vy) * 0.05)})`;
  }
  drawOverlay();
  requestAnimationFrame(step);
}
function drawOverlay() {
  const cv = document.getElementById('cv');
  cv.width = innerWidth; cv.height = innerHeight;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  // Simple attention lines between high-attn pairs
  ctx.strokeStyle = 'rgba(100,180,255,0.25)';
  ctx.lineWidth = 1;
  for (let i = 0; i < N; i++) {
    const j = (i + 3) % N;
    ctx.beginPath();
    ctx.moveTo(portals[i].x + 36, portals[i].y + 26);
    ctx.lineTo(portals[j].x + 36, portals[j].y + 26);
    ctx.stroke();
  }
}

function rewardPortal(id) {
  fitness += 0.5;
  portals[id].el.classList.add('rewarded');
  setTimeout(() => portals[id].el.classList.remove('rewarded'), 600);
  // Hebbian: boost Wq/Wk a bit based on current buffer
  const scale = 0.02;
  for (let r = 0; r < DIM; r++)
    for (let c = 0; c < DIM; c++) {
      weights.Wq[r][c] += scale * (Math.random() - 0.3);
      weights.Wk[r][c] += scale * (Math.random() - 0.3);
    }
  document.getElementById('status').textContent = `fitness ${fitness.toFixed(1)} | mode ${modeOrient ? 'orient' : 'pointer'}`;
}
document.getElementById('reward').onclick = () => rewardPortal(Math.floor(Math.random() * N));

// Persistence
const IDB_KEY = 'verse-f889-attn';
const bc = new BroadcastChannel('f889-genome');
bc.onmessage = e => {
  if (e.data && e.data.fitness > fitness) {
    weights = e.data.weights;
    fitness = e.data.fitness;
    document.getElementById('status').textContent = 'adopted higher genome';
  }
};
async function seal() {
  try {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('verse-f889', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('genomes');
      r.onsuccess = () => res(r.result);
      r.onerror = rej;
    });
    const tx = db.transaction('genomes', 'readwrite');
    tx.objectStore('genomes').put({ weights, fitness }, IDB_KEY);
    bc.postMessage({ weights, fitness });
    document.getElementById('status').textContent = 'sealed & broadcast';
  } catch (err) { console.warn(err); }
}
document.getElementById('seal').onclick = seal;
document.addEventListener('keydown', e => { if (e.key === 's' || e.key === 'S') seal(); if (e.key === 'r' || e.key === 'R') rewardPortal(0); });

// Load
(async () => {
  try {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('verse-f889', 1);
      r.onsuccess = () => res(r.result);
      r.onerror = rej;
    });
    const tx = db.transaction('genomes', 'readonly');
    const req = tx.objectStore('genomes').get(IDB_KEY);
    req.onsuccess = () => {
      if (req.result) { weights = req.result.weights; fitness = req.result.fitness || 1; }
    };
  } catch (e) { console.debug("lab f889-orientation-attention-portal-mind:", e); }
  document.getElementById('status').textContent = `ready | fitness ${fitness.toFixed(1)}`;
  requestAnimationFrame(step);
})();
