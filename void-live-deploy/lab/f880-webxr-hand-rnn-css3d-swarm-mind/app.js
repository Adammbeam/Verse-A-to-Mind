const N = 28;
const scene = document.getElementById('scene');
const attractorEl = document.getElementById('attractor');
const statusEl = document.getElementById('status');
let particles = [];
let attractors = [{x: 0, y: 0, z: 0}];
let pointer = {x: 0, y: 0};
let orient = {a: 0, b: 0, g: 0};
let bestGenome = null;
const channel = new BroadcastChannel('f880-genome');

function randn() { return (Math.random()*2-1) * 0.5; }
function tanh(x) { return Math.tanh(x); }

class Elman {
  constructor(w) {
    this.h = 6; this.in = 4; this.out = 3;
    this.wih = w?.wih || Array.from({length: this.h * this.in}, randn);
    this.whh = w?.whh || Array.from({length: this.h * this.h}, randn);
    this.who = w?.who || Array.from({length: this.out * this.h}, randn);
    this.hstate = new Float32Array(this.h);
  }
  step(inp) {
    const nh = new Float32Array(this.h);
    for (let i = 0; i < this.h; i++) {
      let s = 0;
      for (let j = 0; j < this.in; j++) s += this.wih[i*this.in + j] * inp[j];
      for (let j = 0; j < this.h; j++) s += this.whh[i*this.h + j] * this.hstate[j];
      nh[i] = tanh(s);
    }
    this.hstate = nh;
    const o = [];
    for (let i = 0; i < this.out; i++) {
      let s = 0;
      for (let j = 0; j < this.h; j++) s += this.who[i*this.h + j] * this.hstate[j];
      o.push(tanh(s) * 0.15);
    }
    return o;
  }
  clone() { return new Elman({wih: [...this.wih], whh: [...this.whh], who: [...this.who]}); }
  mutate(rate=0.05) {
    const m = (a) => a.map(v => v + (Math.random()-0.5)*rate);
    return new Elman({wih: m(this.wih), whh: m(this.whh), who: m(this.who)});
  }
  serialize() { return {wih: this.wih, whh: this.whh, who: this.who}; }
}

function createParticle(i) {
  const el = document.createElement('div');
  el.className = 'thought';
  el.style.setProperty('--h', (i * 37) % 360);
  el.textContent = '•';
  scene.appendChild(el);
  return {
    el, x: (Math.random()-0.5)*600, y: (Math.random()-0.5)*400, z: (Math.random()-0.5)*300,
    vx: 0, vy: 0, vz: 0, rnn: new Elman(), fitness: 0, id: i
  };
}

function init() {
  particles.forEach(p => p.el.remove());
  particles = Array.from({length: N}, (_,i) => createParticle(i));
  loadGenome();
}

function loadGenome() {
  const req = indexedDB.open('verse-f880', 1);
  req.onupgradeneeded = e => e.target.result.createObjectStore('genomes');
  req.onsuccess = e => {
    const db = e.target.result;
    const tx = db.transaction('genomes', 'readonly');
    const g = tx.objectStore('genomes').get('best');
    g.onsuccess = () => {
      if (g.result) {
        bestGenome = g.result;
        particles.forEach(p => p.rnn = new Elman(bestGenome).mutate(0.02));
        statusEl.textContent = 'loaded sealed';
      }
    };
  };
}

function seal() {
  particles.sort((a,b) => b.fitness - a.fitness);
  bestGenome = particles[0].rnn.serialize();
  const req = indexedDB.open('verse-f880', 1);
  req.onsuccess = e => {
    const db = e.target.result;
    const tx = db.transaction('genomes', 'readwrite');
    tx.objectStore('genomes').put(bestGenome, 'best');
  };
  channel.postMessage({type: 'genome', data: bestGenome});
  statusEl.textContent = 'sealed & broadcast';
}

channel.onmessage = e => {
  if (e.data.type === 'genome') {
    bestGenome = e.data.data;
    particles.forEach(p => { if (Math.random() < 0.4) p.rnn = new Elman(bestGenome).mutate(0.03); });
    statusEl.textContent = 'adopted foreign genome';
  }
};

function update() {
  const cx = window.innerWidth/2, cy = window.innerHeight/2;
  attractors[0].x = pointer.x - cx;
  attractors[0].y = pointer.y - cy;
  attractors[0].z = orient.b * 2;
  attractorEl.style.left = pointer.x + 'px';
  attractorEl.style.top = pointer.y + 'px';

  for (const p of particles) {
    const ax = attractors[0].x - p.x, ay = attractors[0].y - p.y, az = attractors[0].z - p.z;
    const dist = Math.hypot(ax, ay, az) + 1;
    p.vx += ax / dist * 0.08;
    p.vy += ay / dist * 0.08;
    p.vz += az / dist * 0.08;
    for (const q of particles) {
      if (q === p) continue;
      const dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z;
      const d2 = dx*dx + dy*dy + dz*dz + 100;
      const f = 80 / d2;
      p.vx += dx * f; p.vy += dy * f; p.vz += dz * f;
    }
    const inp = [ax/400, ay/300, az/200, Math.hypot(p.vx,p.vy,p.vz)];
    const bias = p.rnn.step(inp);
    p.vx += bias[0]; p.vy += bias[1]; p.vz += bias[2];
    p.vx *= 0.92; p.vy *= 0.92; p.vz *= 0.92;
    p.x += p.vx; p.y += p.vy; p.z += p.vz;
    if (Math.abs(p.x) > 500) p.vx *= -0.5;
    if (Math.abs(p.y) > 350) p.vy *= -0.5;
    if (Math.abs(p.z) > 250) p.vz *= -0.5;
    p.fitness = p.fitness * 0.99 + (1 / dist) * 0.01;
    p.el.style.transform = `translate3d(${p.x + cx - 14}px, ${p.y + cy - 14}px, ${p.z}px) rotateY(${p.vx*2}deg)`;
  }
  requestAnimationFrame(update);
}

scene.addEventListener('pointermove', e => { pointer.x = e.clientX; pointer.y = e.clientY; });
scene.addEventListener('click', e => {
  let best = particles[0], bd = 1e9;
  for (const p of particles) {
    const d = Math.hypot(p.x - (e.clientX - window.innerWidth/2), p.y - (e.clientY - window.innerHeight/2));
    if (d < bd) { bd = d; best = p; }
  }
  best.fitness += 2;
  best.rnn = best.rnn.mutate(0.1);
  statusEl.textContent = 'rewarded cluster';
});

if (window.DeviceOrientationEvent) {
  window.addEventListener('deviceorientation', e => {
    orient.a = e.alpha || 0; orient.b = e.beta || 0; orient.g = e.gamma || 0;
  });
}

async function tryXR() {
  if (!navigator.xr) return;
  try {
    const session = await navigator.xr.requestSession('inline', { optionalFeatures: ['hand-tracking'] });
    statusEl.textContent = 'WebXR inline';
    session.end();
  } catch(e) { statusEl.textContent = 'pointer + orient'; }
}
tryXR();

document.getElementById('seal').onclick = seal;
document.getElementById('reset').onclick = init;

init();
update();
