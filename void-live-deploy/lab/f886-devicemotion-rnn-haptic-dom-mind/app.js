const N = 10;
const H = 8;
const cards = [];
let bestFitness = -Infinity;
let bestGenome = null;
const channel = new BroadcastChannel('f886-genome');

function randn() { return (Math.random()*2-1)*0.3; }
function makeGenome() {
  return {
    Wh: Array.from({length:H*H}, randn),
    Wx: Array.from({length:H*4}, randn),
    Wo: Array.from({length:4*H}, randn),
    bh: Array.from({length:H}, randn),
    bo: Array.from({length:4}, ()=>0)
  };
}
function elman(g, input, h) {
  const nh = new Array(H).fill(0);
  for (let i=0; i<H; i++) {
    let s = g.bh[i];
    for (let j=0; j<H; j++) s += g.Wh[i*H+j] * h[j];
    for (let j=0; j<4; j++) s += g.Wx[i*4+j] * input[j];
    nh[i] = Math.tanh(s);
  }
  const out = new Array(4).fill(0);
  for (let i=0; i<4; i++) {
    let s = g.bo[i];
    for (let j=0; j<H; j++) s += g.Wo[i*H+j] * nh[j];
    out[i] = Math.tanh(s);
  }
  return {h: nh, out};
}
function transfer(src, dst) {
  const t = 0.4;
  for (let k of ['Wh','Wx','Wo','bh','bo']) {
    for (let i=0; i<src[k].length; i++) {
      dst[k][i] = dst[k][i]*(1-t) + src[k][i]*t + randn()*0.05;
    }
  }
}

function createCards() {
  const stage = document.getElementById('stage');
  stage.innerHTML = '';
  cards.length = 0;
  for (let i=0; i<N; i++) {
    const el = document.createElement('div');
    el.className = 'card';
    el.textContent = 'A'+(i+1);
    el.style.left = (Math.random()*70+10)+'%';
    el.style.top = (Math.random()*70+10)+'%';
    const card = {
      el, x: Math.random()*window.innerWidth, y: Math.random()*window.innerHeight,
      vx:0, vy:0, fitness: 1, genome: makeGenome(), h: Array(H).fill(0), lastInput: [0,0,0,0]
    };
    el.addEventListener('pointerdown', () => reward(card));
    stage.appendChild(el);
    cards.push(card);
  }
}

function reward(card) {
  card.fitness += 2;
  card.el.classList.add('rewarded');
  setTimeout(() => card.el.classList.remove('rewarded'), 400);
  const lr = 0.02;
  for (let i=0; i<H; i++) card.genome.bh[i] += lr * card.lastInput[0] * card.h[i];
  if (card.fitness > bestFitness) { bestFitness = card.fitness; bestGenome = structuredClone(card.genome); }
  updateStatus();
}

let lastAx=0, lastAy=0, lastAz=0;
function onMotion(e) {
  const a = e.accelerationIncludingGravity || e.acceleration || {};
  lastAx = (a.x||0)/10; lastAy = (a.y||0)/10; lastAz = (a.z||0)/10;
}
function onPointer(e) {
  lastAx = (e.movementX||0)/40; lastAy = (e.movementY||0)/40; lastAz = 0;
}

function step() {
  const w = window.innerWidth, h = window.innerHeight;
  for (const c of cards) {
    const input = [lastAx, lastAy, lastAz, Math.hypot(lastAx,lastAy)];
    c.lastInput = input;
    const res = elman(c.genome, input, c.h);
    c.h = res.h;
    c.vx = res.out[0] * 4;
    c.vy = res.out[1] * 4;
    c.x += c.vx; c.y += c.vy;
    if (c.x < 20) c.x = 20; if (c.x > w-90) c.x = w-90;
    if (c.y < 20) c.y = 20; if (c.y > h-70) c.y = h-70;
    c.el.style.transform = `translate(${c.x}px,${c.y}px)`;
    const vib = Math.abs(res.out[2]);
    if (vib > 0.6 && navigator.vibrate && Math.random()<0.1) {
      try { navigator.vibrate(Math.floor(vib*80)); } catch (e) { console.debug("lab f886-devicemotion-rnn-haptic-dom-mind:", e); }
    }
  }
  for (let i=0; i<cards.length; i++) {
    for (let j=i+1; j<cards.length; j++) {
      const a=cards[i], b=cards[j];
      const dx=a.x-b.x, dy=a.y-b.y;
      if (dx*dx+dy*dy < 3600) {
        if (a.fitness > b.fitness) { transfer(a.genome, b.genome); b.fitness *= 0.95; }
        else if (b.fitness > a.fitness) { transfer(b.genome, a.genome); a.fitness *= 0.95; }
      }
    }
  }
  requestAnimationFrame(step);
}

function updateStatus() {
  document.getElementById('status').textContent = `Best fitness: ${bestFitness.toFixed(1)} | Cards: ${N} | Offline`;
}

document.getElementById('perm').onclick = async () => {
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    try {
      const p = await DeviceMotionEvent.requestPermission();
      if (p === 'granted') window.addEventListener('devicemotion', onMotion);
    } catch(e) { console.warn(e); }
  } else {
    window.addEventListener('devicemotion', onMotion);
  }
  document.getElementById('status').textContent = 'Motion enabled (or pointer fallback)';
};
window.addEventListener('pointermove', onPointer);

document.getElementById('seal').onclick = async () => {
  if (!bestGenome) return;
  try {
    const db = await new Promise((res,rej) => {
      const r = indexedDB.open('verse-f886', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('genomes');
      r.onsuccess = () => res(r.result);
      r.onerror = rej;
    });
    const tx = db.transaction('genomes','readwrite');
    tx.objectStore('genomes').put({genome: bestGenome, fitness: bestFitness, t: Date.now()}, 'best');
    await new Promise(r => tx.oncomplete = r);
    channel.postMessage({type:'genome', genome: bestGenome, fitness: bestFitness});
    document.getElementById('status').textContent = 'Sealed to IndexedDB + broadcast';
  } catch(e) {
    document.getElementById('status').textContent = 'Seal failed (private mode?) — session only';
  }
};
channel.onmessage = (ev) => {
  if (ev.data.type === 'genome' && ev.data.fitness > bestFitness) {
    bestFitness = ev.data.fitness;
    bestGenome = ev.data.genome;
    let min = cards[0];
    for (const c of cards) if (c.fitness < min.fitness) min = c;
    transfer(bestGenome, min.genome);
    updateStatus();
  }
};

document.getElementById('reset').onclick = () => { createCards(); bestFitness = -Infinity; bestGenome = null; updateStatus(); };

createCards();
requestAnimationFrame(step);
updateStatus();

(async () => {
  try {
    const db = await new Promise(res => {
      const r = indexedDB.open('verse-f886', 1);
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    });
    if (!db) return;
    const tx = db.transaction('genomes','readonly');
    const req = tx.objectStore('genomes').get('best');
    req.onsuccess = () => {
      if (req.result) {
        bestGenome = req.result.genome;
        bestFitness = req.result.fitness || 1;
        transfer(bestGenome, cards[0].genome);
        updateStatus();
      }
    };
  } catch (e) { console.debug("lab f886-devicemotion-rnn-haptic-dom-mind:", e); }
})();
