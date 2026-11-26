const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let W = canvas.width = innerWidth, H = canvas.height = innerHeight;
addEventListener('resize', () => { W = canvas.width = innerWidth; H = canvas.height = innerHeight; });

const GW = 96, GH = 54;
const field = new Float32Array(GW * GH);
const sources = [
  { x: 0.3, y: 0.4, freq: 0.08, amp: 1.2, phase: 0 },
  { x: 0.7, y: 0.6, freq: 0.11, amp: 1.0, phase: 1.2 },
  { x: 0.5, y: 0.2, freq: 0.09, amp: 0.8, phase: 2.1 },
  { x: 0.4, y: 0.8, freq: 0.13, amp: 1.1, phase: 0.5 }
];

// Elman RNN
const IN = 6, HID = 8, OUT = 12;
let Wih = Array.from({length: HID}, () => Array.from({length: IN}, () => (Math.random()-0.5)*0.4));
let Whh = Array.from({length: HID}, () => Array.from({length: HID}, () => (Math.random()-0.5)*0.3));
let Who = Array.from({length: OUT}, () => Array.from({length: HID}, () => (Math.random()-0.5)*0.5));
let h = new Array(HID).fill(0);
let lr = 0.012;

function tanh(x) { return Math.tanh(x); }
function rnnStep(input) {
  const newH = new Array(HID).fill(0);
  for (let i = 0; i < HID; i++) {
    let s = 0;
    for (let j = 0; j < IN; j++) s += Wih[i][j] * input[j];
    for (let j = 0; j < HID; j++) s += Whh[i][j] * h[j];
    newH[i] = tanh(s);
  }
  h = newH;
  const out = new Array(OUT).fill(0);
  for (let i = 0; i < OUT; i++) {
    let s = 0;
    for (let j = 0; j < HID; j++) s += Who[i][j] * h[j];
    out[i] = tanh(s);
  }
  return out;
}

function updateWeights(reward) {
  // simple delta on output and a bit of recurrent
  for (let i = 0; i < OUT; i++) {
    for (let j = 0; j < HID; j++) Who[i][j] += lr * reward * h[j] * (Math.random()-0.5);
  }
  for (let i = 0; i < HID; i++) {
    for (let j = 0; j < HID; j++) Whh[i][j] += lr * 0.3 * reward * h[j] * h[i];
  }
}

// Inputs
let ptr = { x: 0.5, y: 0.5, vx: 0, vy: 0 };
let orient = { b: 0, g: 0 };
let micE = 0;
let t = 0;
addEventListener('pointermove', e => {
  const nx = e.clientX / W, ny = e.clientY / H;
  ptr.vx = (nx - ptr.x) * 8; ptr.vy = (ny - ptr.y) * 8;
  ptr.x = nx; ptr.y = ny;
});
if (window.DeviceOrientationEvent) {
  addEventListener('deviceorientation', e => {
    orient.b = (e.beta || 0) / 90;
    orient.g = (e.gamma || 0) / 90;
  });
}

// Mic
let analyser;
document.getElementById('mic').onclick = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ac = new AudioContext();
    analyser = ac.createAnalyser();
    analyser.fftSize = 256;
    ac.createMediaStreamSource(stream).connect(analyser);
    document.getElementById('status').textContent = 'mic + orient active';
  } catch { document.getElementById('status').textContent = 'mic denied'; }
};

// Portals
const portals = [];
for (let i = 0; i < 4; i++) {
  const el = document.createElement('div');
  el.className = 'portal';
  el.innerHTML = `<div>src ${i}</div><div class="h">h:0.00</div>`;
  document.body.appendChild(el);
  portals.push({ el, idx: i, dragging: false });
  el.addEventListener('pointerdown', e => { portals[i].dragging = true; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointerup', () => portals[i].dragging = false);
  el.addEventListener('pointermove', e => {
    if (!portals[i].dragging) return;
    sources[i].x = (e.clientX) / W;
    sources[i].y = (e.clientY) / H;
  });
  el.addEventListener('click', () => {
    updateWeights(1.2);
    el.style.boxShadow = '0 0 20px #0f8';
    setTimeout(() => el.style.boxShadow = '', 300);
  });
}

// Wave step
function stepWave(dt) {
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      let v = 0;
      const px = x / GW, py = y / GH;
      for (const s of sources) {
        const dx = px - s.x, dy = py - s.y;
        const d = Math.hypot(dx, dy) * 12;
        v += s.amp * Math.sin(d * s.freq * 40 - t * s.freq * 8 + s.phase);
      }
      field[y * GW + x] = v * 0.6 + field[y * GW + x] * 0.4;
    }
  }
  t += dt;
}

// Render
function render() {
  const img = ctx.createImageData(W, H);
  const data = img.data;
  for (let py = 0; py < H; py += 2) {
    for (let px = 0; px < W; px += 2) {
      const gx = Math.floor(px / W * GW), gy = Math.floor(py / H * GH);
      const v = field[gy * GW + gx];
      const n = (v + 2) / 4;
      const r = Math.floor(40 + n * 80);
      const g = Math.floor(60 + n * 120);
      const b = Math.floor(140 + n * 100);
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const i = ((py+dy) * W + (px+dx)) * 4;
        if (i < data.length) { data[i] = r; data[i+1] = g; data[i+2] = b; data[i+3] = 255; }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

// Main loop
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (analyser) {
    const buf = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(buf);
    micE = buf.reduce((a,b)=>a+b,0) / buf.length / 255;
  }

  const input = [
    Math.tanh(ptr.vx), Math.tanh(ptr.vy),
    orient.b, orient.g,
    micE, Math.sin(t * 0.3)
  ];
  const out = rnnStep(input);
  for (let i = 0; i < 4; i++) {
    if (!portals[i].dragging) {
      sources[i].x = Math.max(0.05, Math.min(0.95, sources[i].x + out[i*3] * 0.008));
      sources[i].y = Math.max(0.05, Math.min(0.95, sources[i].y + out[i*3+1] * 0.008));
    }
    sources[i].freq = 0.07 + (out[i*3+2] + 1) * 0.04;
    sources[i].amp = 0.7 + (Math.sin(t + i) * 0.3);
  }

  stepWave(dt);
  render();

  portals.forEach((p, i) => {
    const s = sources[i];
    const gx = Math.floor(s.x * GW), gy = Math.floor(s.y * GH);
    const dens = field[gy * GW + gx] || 0;
    const scale = 0.8 + Math.abs(dens) * 0.4;
    const hue = 200 + dens * 40;
    p.el.style.left = (s.x * W - 45) + 'px';
    p.el.style.top = (s.y * H - 35) + 'px';
    p.el.style.transform = `scale(${scale})`;
    p.el.style.filter = `hue-rotate(${hue}deg) brightness(${1 + dens*0.2})`;
    p.el.querySelector('.h').textContent = `h:${h[0].toFixed(2)}`;
  });

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Seal
document.getElementById('seal').onclick = async () => {
  try {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('verse-f885', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('genomes');
      r.onsuccess = () => res(r.result);
      r.onerror = rej;
    });
    const tx = db.transaction('genomes', 'readwrite');
    tx.objectStore('genomes').put({ Wih, Whh, Who, h }, 'rnn');
    document.getElementById('status').textContent = 'sealed';
  } catch { document.getElementById('status').textContent = 'seal failed (memory)'; }
};

// Load previous if any
(async () => {
  try {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('verse-f885', 1);
      r.onsuccess = () => res(r.result);
      r.onerror = rej;
    });
    const tx = db.transaction('genomes', 'readonly');
    const req = tx.objectStore('genomes').get('rnn');
    req.onsuccess = () => {
      if (req.result) {
        ({ Wih, Whh, Who, h } = req.result);
        document.getElementById('status').textContent = 'genome restored';
      }
    };
  } catch (e) { console.debug("lab f885-webgpu-rnn-wave-portal-mind:", e); }
})();
