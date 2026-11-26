const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const agentsDiv = document.getElementById('agents');
let W = canvas.width = innerWidth, H = canvas.height = innerHeight;
window.onresize = () => { W = canvas.width = innerWidth; H = canvas.height = innerHeight; };

let agents = [];
let particles = [];
let nextId = 1;
const N_PARTICLES = 400;

// Tiny MLP: 4 inputs (dx,dy to nearest energy, dx,dy to nearest agent), 6 hidden, 2 outputs (vx,vy)
function createMLP() {
  return {
    w1: Array(6).fill(0).map(() => Array(4).fill(0).map(() => (Math.random()-0.5)*0.5)),
    b1: Array(6).fill(0).map(() => (Math.random()-0.5)*0.2),
    w2: Array(2).fill(0).map(() => Array(6).fill(0).map(() => (Math.random()-0.5)*0.5)),
    b2: Array(2).fill(0).map(() => (Math.random()-0.5)*0.2)
  };
}
function sigmoid(x) { return 1/(1+Math.exp(-x)); }
function forward(mlp, inp) {
  const h = mlp.b1.map((b,i) => sigmoid(b + mlp.w1[i].reduce((s,w,j)=>s+w*inp[j],0)));
  return mlp.b2.map((b,i) => b + mlp.w2[i].reduce((s,w,j)=>s+w*h[j],0));
}
function cloneMLP(mlp, mutate=0.05) {
  const c = JSON.parse(JSON.stringify(mlp));
  const mutateArr = a => a.forEach((v,i) => { if (Array.isArray(v)) mutateArr(v); else if (Math.random()<0.3) a[i] += (Math.random()-0.5)*mutate; });
  mutateArr(c.w1); mutateArr(c.b1); mutateArr(c.w2); mutateArr(c.b2);
  return c;
}

function spawnAgent(x=W/2+Math.random()*100-50, y=H/2+Math.random()*100-50, mlp=null) {
  const id = nextId++;
  const el = document.createElement('div');
  el.className = 'agent';
  el.innerHTML = `<div class="id">A${id}</div><div class="energy">E:0</div>`;
  el.style.left = x+'px'; el.style.top = y+'px';
  agentsDiv.appendChild(el);
  const agent = { id, x, y, vx:0, vy:0, energy:0, mlp: mlp || createMLP(), el };
  agents.push(agent);
  makeDraggable(agent);
  return agent;
}

function makeDraggable(agent) {
  let dragging = false, ox=0, oy=0;
  agent.el.addEventListener('pointerdown', e => {
    dragging = true; agent.el.classList.add('dragging');
    ox = e.clientX - agent.x; oy = e.clientY - agent.y;
    e.preventDefault();
  });
  window.addEventListener('pointermove', e => {
    if (!dragging) return;
    agent.x = e.clientX - ox; agent.y = e.clientY - oy;
    agent.el.style.left = agent.x+'px'; agent.el.style.top = agent.y+'px';
    // Check transfer on release proximity
  });
  window.addEventListener('pointerup', e => {
    if (!dragging) return;
    dragging = false; agent.el.classList.remove('dragging');
    // Genome transfer if overlapping another
    for (const other of agents) {
      if (other === agent) continue;
      const dx = agent.x - other.x, dy = agent.y - other.y;
      if (Math.hypot(dx,dy) < 80) {
        // Transfer: copy mutated genome from dragged to other, or bidirectional
        other.mlp = cloneMLP(agent.mlp, 0.08);
        agent.mlp = cloneMLP(agent.mlp, 0.03); // slight self-mutate
        agent.el.style.borderColor = '#f80';
        other.el.style.borderColor = '#0f8';
        setTimeout(()=>{ agent.el.style.borderColor='#4af'; other.el.style.borderColor='#4af'; }, 600);
        document.getElementById('info').textContent = `Genome transferred A${agent.id} → A${other.id}`;
        break;
      }
    }
  });
}

function spawnParticles(n=50, x=W/2, y=H/2) {
  for (let i=0; i<n; i++) {
    particles.push({
      x: x + (Math.random()-0.5)*80,
      y: y + (Math.random()-0.5)*80,
      vx: (Math.random()-0.5)*1,
      vy: (Math.random()-0.5)*1,
      life: 300 + Math.random()*200
    });
  }
}

function step() {
  // Agents policy
  for (const a of agents) {
    // Find nearest energy and nearest other agent
    let nearE = {d:1e9, dx:0, dy:0}, nearA = {d:1e9, dx:0, dy:0};
    for (const p of particles) {
      const dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx,dy)+1;
      if (d < nearE.d) nearE = {d, dx:dx/d, dy:dy/d};
    }
    for (const o of agents) {
      if (o===a) continue;
      const dx = o.x - a.x, dy = o.y - a.y, d = Math.hypot(dx,dy)+1;
      if (d < nearA.d) nearA = {d, dx:dx/d, dy:dy/d};
    }
    const inp = [nearE.dx, nearE.dy, nearA.dx, nearA.dy];
    const out = forward(a.mlp, inp);
    a.vx = Math.max(-2, Math.min(2, out[0]));
    a.vy = Math.max(-2, Math.min(2, out[1]));
    a.x += a.vx; a.y += a.vy;
    // Bounds
    a.x = Math.max(20, Math.min(W-110, a.x));
    a.y = Math.max(20, Math.min(H-90, a.y));
    a.el.style.left = a.x+'px'; a.el.style.top = a.y+'px';
    // Collect energy
    for (let i=particles.length-1; i>=0; i--) {
      const p = particles[i];
      if (Math.hypot(p.x-a.x, p.y-a.y) < 40) {
        a.energy += 1;
        particles.splice(i,1);
      }
    }
    a.el.querySelector('.energy').textContent = 'E:'+a.energy;
  }
  // Particles: simple movement + decay (WebGPU would accelerate this; Canvas2D fallback)
  for (let i=particles.length-1; i>=0; i--) {
    const p = particles[i];
    // Mild attraction to agents (foraging field)
    let ax=0, ay=0;
    for (const a of agents) {
      const dx = a.x - p.x, dy = a.y - p.y, d2 = dx*dx+dy*dy+100;
      ax += dx / d2 * 20; ay += dy / d2 * 20;
    }
    p.vx += ax*0.05; p.vy += ay*0.05;
    p.vx *= 0.98; p.vy *= 0.98;
    p.x += p.vx; p.y += p.vy;
    p.life--;
    if (p.life<=0 || p.x<0 || p.x>W || p.y<0 || p.y>H) particles.splice(i,1);
  }
  // Draw
  ctx.fillStyle = 'rgba(10,10,18,0.3)';
  ctx.fillRect(0,0,W,H);
  ctx.fillStyle = '#6cf';
  for (const p of particles) {
    ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI*2); ctx.fill();
  }
  requestAnimationFrame(step);
}

// WebGPU path (optional enhancement for particle kernel)
async function tryWebGPU() {
  if (!navigator.gpu) return;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return;
    const device = await adapter.requestDevice();
    document.getElementById('status').textContent += ' • WebGPU compute ready (particle kernel)';
    // In full version: compute shader for particle update. Here we note availability; Canvas2D is primary for reliability.
  } catch (e) { console.debug("lab f889-webgpu-foraging-swarm-genome-transfer-mind:", e); }
}

// IndexedDB seal
let db;
const req = indexedDB.open('F889Swarm', 1);
req.onupgradeneeded = e => {
  db = e.target.result;
  db.createObjectStore('genomes', {keyPath: 'id'});
};
req.onsuccess = e => { db = e.target.result; };
function seal() {
  if (!db) return;
  const tx = db.transaction('genomes','readwrite');
  const store = tx.objectStore('genomes');
  store.clear();
  agents.forEach(a => store.put({id: a.id, mlp: a.mlp, energy: a.energy, x:a.x, y:a.y}));
  document.getElementById('info').textContent = 'Genomes sealed to IndexedDB';
}
function loadSealed() {
  if (!db) return;
  const tx = db.transaction('genomes','readonly');
  const store = tx.objectStore('genomes');
  const req = store.getAll();
  req.onsuccess = () => {
    agents.forEach(a => a.el.remove());
    agents = [];
    req.result.forEach(g => {
      const a = spawnAgent(g.x, g.y, g.mlp);
      a.energy = g.energy;
      a.el.querySelector('.energy').textContent = 'E:'+a.energy;
    });
    document.getElementById('info').textContent = 'Loaded sealed genomes';
  };
}

document.getElementById('addAgent').onclick = () => spawnAgent();
document.getElementById('addEnergy').onclick = () => spawnParticles(80, Math.random()*W, Math.random()*H);
document.getElementById('seal').onclick = seal;
document.getElementById('load').onclick = loadSealed;

// Init
for (let i=0; i<3; i++) spawnAgent(200+i*120, 200);
spawnParticles(100);
tryWebGPU();
step();
