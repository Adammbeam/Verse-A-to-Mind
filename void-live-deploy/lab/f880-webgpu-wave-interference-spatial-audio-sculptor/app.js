const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const status = document.getElementById('status');
let W = 0, H = 0, GW = 160, GH = 100;
let u = new Float32Array(GW * GH);
let uPrev = new Float32Array(GW * GH);
let sources = [];
let focus = null; // {x,y,w,h}
let dragging = null;
let drawingFocus = false;
let focusStart = null;
let audioCtx = null;
let started = false;

function resize() {
  W = cv.width = window.innerWidth;
  H = cv.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

function cellX(px) { return Math.max(0, Math.min(GW-1, Math.floor(px / W * GW))); }
function cellY(py) { return Math.max(0, Math.min(GH-1, Math.floor(py / H * GH))); }
function pxX(cx) { return (cx + 0.5) / GW * W; }
function pxY(cy) { return (cy + 0.5) / GH * H; }

function addSource(x, y, freq = 220 + Math.random()*300) {
  const s = { x, y, freq, amp: 0.8, phase: Math.random()*Math.PI*2, osc:null, gain:null, panner:null };
  sources.push(s);
  if (audioCtx) attachAudio(s);
  save();
  return s;
}

function attachAudio(s) {
  if (!audioCtx) return;
  s.osc = audioCtx.createOscillator();
  s.gain = audioCtx.createGain();
  s.panner = audioCtx.createPanner();
  s.panner.panningModel = 'HRTF';
  s.panner.distanceModel = 'inverse';
  s.osc.type = 'sine';
  s.osc.frequency.value = s.freq;
  s.gain.gain.value = s.amp * 0.15;
  s.osc.connect(s.gain);
  s.gain.connect(s.panner);
  s.panner.connect(audioCtx.destination);
  s.osc.start();
  updatePanner(s);
}

function updatePanner(s) {
  if (!s.panner || !audioCtx) return;
  const nx = (s.x / W - 0.5) * 4;
  const ny = (0.5 - s.y / H) * 3;
  s.panner.positionX.value = nx;
  s.panner.positionY.value = ny;
  s.panner.positionZ.value = 0.2;
}

function startAudio() {
  if (started) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  sources.forEach(attachAudio);
  started = true;
  status.textContent = 'Audio live · ' + sources.length + ' sources';
}

function stepWave() {
  const c2 = 0.12;
  const damp = 0.992;
  const next = new Float32Array(GW * GH);
  for (let y = 1; y < GH-1; y++) {
    for (let x = 1; x < GW-1; x++) {
      const i = y*GW + x;
      const lap = u[i-1] + u[i+1] + u[i-GW] + u[i+GW] - 4*u[i];
      next[i] = (2*u[i] - uPrev[i] + c2 * lap) * damp;
    }
  }
  // inject sources
  sources.forEach(s => {
    const cx = cellX(s.x), cy = cellY(s.y);
    const i = cy*GW + cx;
    next[i] += Math.sin(performance.now()*0.001 * s.freq * 0.01 + s.phase) * s.amp * 0.4;
  });
  uPrev.set(u);
  u.set(next);
}

function render() {
  const img = ctx.createImageData(W, H);
  const d = img.data;
  for (let py = 0; py < H; py += 2) {
    for (let px = 0; px < W; px += 2) {
      const cx = cellX(px), cy = cellY(py);
      const a = Math.max(-1, Math.min(1, u[cy*GW + cx]));
      const r = a > 0 ? Math.floor(40 + a*200) : 20;
      const b = a < 0 ? Math.floor(40 - a*200) : 20;
      const g = 30 + Math.abs(a)*80;
      const idx = (py*W + px)*4;
      d[idx] = r; d[idx+1] = g; d[idx+2] = b; d[idx+3] = 255;
      if (px+1 < W) { d[idx+4]=r; d[idx+5]=g; d[idx+6]=b; d[idx+7]=255; }
    }
  }
  ctx.putImageData(img, 0, 0);
  // sources
  sources.forEach((s, i) => {
    ctx.beginPath();
    ctx.arc(s.x, s.y, 8, 0, Math.PI*2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#8af';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#000';
    ctx.font = '10px sans-serif';
    ctx.fillText(Math.round(s.freq)+'Hz', s.x+10, s.y);
  });
  // focus
  if (focus) {
    ctx.strokeStyle = '#8f8';
    ctx.lineWidth = 1;
    ctx.strokeRect(focus.x, focus.y, focus.w, focus.h);
  }
}

function scoreFocus() {
  if (!focus) return 0;
  let sum = 0, n = 0;
  const x0 = cellX(focus.x), y0 = cellY(focus.y);
  const x1 = cellX(focus.x + focus.w), y1 = cellY(focus.y + focus.h);
  for (let y = Math.max(0,y0); y < Math.min(GH,y1); y++) {
    for (let x = Math.max(0,x0); x < Math.min(GW,x1); x++) {
      sum += Math.abs(u[y*GW + x]);
      n++;
    }
  }
  return n ? sum / n : 0;
}

function harmonize() {
  if (!focus || sources.length === 0) { status.textContent = 'Draw a focus rect first'; return; }
  status.textContent = 'Harmonizing...';
  let best = sources.map(s => ({...s}));
  let bestScore = scoreFocus();
  for (let r = 0; r < 30; r++) {
    const trial = sources.map(s => ({
      x: Math.max(20, Math.min(W-20, s.x + (Math.random()-0.5)*40)),
      y: Math.max(20, Math.min(H-20, s.y + (Math.random()-0.5)*40)),
      freq: Math.max(80, Math.min(800, s.freq + (Math.random()-0.5)*40)),
      amp: s.amp, phase: s.phase
    }));
    // temporarily apply
    const old = sources.map(s => ({x:s.x, y:s.y, freq:s.freq}));
    trial.forEach((t,i) => { sources[i].x=t.x; sources[i].y=t.y; sources[i].freq=t.freq; if(sources[i].osc) sources[i].osc.frequency.value=t.freq; updatePanner(sources[i]); });
    for (let k=0;k<8;k++) stepWave();
    const sc = scoreFocus();
    if (sc > bestScore) {
      bestScore = sc;
      best = trial;
    } else {
      old.forEach((o,i) => { sources[i].x=o.x; sources[i].y=o.y; sources[i].freq=o.freq; if(sources[i].osc) sources[i].osc.frequency.value=o.freq; updatePanner(sources[i]); });
    }
  }
  // apply best
  best.forEach((t,i) => { sources[i].x=t.x; sources[i].y=t.y; sources[i].freq=t.freq; if(sources[i].osc) sources[i].osc.frequency.value=t.freq; updatePanner(sources[i]); });
  save();
  status.textContent = 'Harmonized · score ' + bestScore.toFixed(3);
}

function save() {
  try {
    localStorage.setItem('verse-f880-sources', JSON.stringify(sources.map(s => ({x:s.x,y:s.y,freq:s.freq,amp:s.amp,phase:s.phase}))));
  } catch (e) { console.debug("lab f880-webgpu-wave-interference-spatial-audio-sculptor:", e); }
}

function load() {
  try {
    const raw = localStorage.getItem('verse-f880-sources');
    if (raw) {
      const arr = JSON.parse(raw);
      arr.forEach(s => addSource(s.x, s.y, s.freq));
      status.textContent = 'Restored ' + sources.length + ' sources';
    }
  } catch (e) { console.debug("lab f880-webgpu-wave-interference-spatial-audio-sculptor:", e); }
}

cv.addEventListener('pointerdown', e => {
  const rect = cv.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  // check source hit
  for (let i = sources.length-1; i>=0; i--) {
    const s = sources[i];
    if (Math.hypot(s.x-x, s.y-y) < 16) { dragging = i; return; }
  }
  // start focus
  drawingFocus = true;
  focusStart = {x,y};
  focus = {x,y,w:0,h:0};
});

cv.addEventListener('pointermove', e => {
  const rect = cv.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  if (dragging !== null) {
    sources[dragging].x = x;
    sources[dragging].y = y;
    updatePanner(sources[dragging]);
    save();
  } else if (drawingFocus && focusStart) {
    focus.x = Math.min(focusStart.x, x);
    focus.y = Math.min(focusStart.y, y);
    focus.w = Math.abs(x - focusStart.x);
    focus.h = Math.abs(y - focusStart.y);
  }
});

cv.addEventListener('pointerup', e => {
  if (dragging === null && !drawingFocus) {
    const rect = cv.getBoundingClientRect();
    addSource(e.clientX - rect.left, e.clientY - rect.top);
  }
  dragging = null;
  drawingFocus = false;
  if (focus && (focus.w < 10 || focus.h < 10)) focus = null;
});

document.getElementById('add').onclick = () => addSource(W/2 + (Math.random()-0.5)*200, H/2 + (Math.random()-0.5)*150);
document.getElementById('harm').onclick = harmonize;
document.getElementById('clear').onclick = () => { sources.forEach(s => { if(s.osc) try{s.osc.stop();}catch (e) { console.debug("lab f880-webgpu-wave-interference-spatial-audio-sculptor:", e); } }); sources = []; focus=null; save(); status.textContent='Cleared'; };
document.getElementById('audio').onclick = startAudio;

load();
function loop() {
  stepWave();
  render();
  requestAnimationFrame(loop);
}
loop();
