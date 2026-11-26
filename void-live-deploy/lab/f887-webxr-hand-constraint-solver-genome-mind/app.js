const N = 18;
const ITERS = 10;
const scene = document.getElementById('scene');
const status = document.getElementById('status');
const masses = [];
const constraints = [];
let bestFitness = -Infinity;
let bestGenome = null;
const dbName = 'verse-f887-constraint';
const bc = new BroadcastChannel('f887-genome');

function rand(a,b){ return a + Math.random()*(b-a); }
function tanh(x){ return Math.tanh(x); }

class MLP {
  constructor(w) {
    this.w = w || Array.from({length:16}, ()=>rand(-0.4,0.4));
  }
  forward(dx,dy,dz,res) {
    // tiny: 4 inputs -> 4 hidden -> 1 out
    let h = [0,0,0,0];
    for(let i=0;i<4;i++) h[i] = tanh(this.w[i]*dx + this.w[4+i]*dy + this.w[8+i]*dz + this.w[12+i]*res);
    return tanh(h[0]*0.6 + h[1]*0.3 + h[2]*0.4 + h[3]*0.2);
  }
  clone(){ return new MLP([...this.w]); }
  mutate(rate=0.15){ const m=this.clone(); for(let i=0;i<m.w.length;i++) if(Math.random()<rate) m.w[i]+=rand(-0.25,0.25); return m; }
}

function init() {
  scene.innerHTML = '';
  masses.length = 0; constraints.length = 0;
  for(let i=0;i<N;i++){
    const el = document.createElement('div');
    el.className = 'mass';
    scene.appendChild(el);
    const m = {
      el, x: rand(-120,120), y: rand(-80,80), z: rand(-60,60),
      ox:0, oy:0, oz:0, fitness: 1, mlp: new MLP(), id: i
    };
    masses.push(m);
  }
  // sparse constraints
  for(let i=0;i<N;i++){
    for(let k=0;k<2;k++){
      const j = (i + 1 + Math.floor(Math.random()*4)) % N;
      if(i!==j) constraints.push({a:i, b:j, rest: rand(40,90)});
    }
  }
  status.textContent = `Agents: ${N} | Constraints: ${constraints.length} | Ready`;
}

function solve() {
  for(let iter=0;iter<ITERS;iter++){
    for(const c of constraints){
      const A = masses[c.a], B = masses[c.b];
      let dx = B.x - A.x, dy = B.y - A.y, dz = B.z - A.z;
      let dist = Math.hypot(dx,dy,dz) || 0.01;
      const biasA = A.mlp.forward(dx*0.01, dy*0.01, dz*0.01, 0.1);
      const biasB = B.mlp.forward(-dx*0.01, -dy*0.01, -dz*0.01, 0.1);
      const target = c.rest * (1 + (biasA+biasB)*0.15);
      const diff = (target - dist) / dist * 0.5;
      const cx = dx*diff, cy=dy*diff, cz=dz*diff;
      A.x -= cx; A.y -= cy; A.z -= cz;
      B.x += cx; B.y += cy; B.z += cz;
    }
  }
}

let hand = {x:0, y:0, z:0, active:false};
let pointer = {x:0, y:0};

function updateVisuals() {
  const cx = window.innerWidth/2, cy = window.innerHeight/2;
  for(const m of masses){
    m.el.style.transform = `translate3d(${cx + m.x}px, ${cy + m.y}px, ${m.z}px)`;
    m.el.className = 'mass' + (m.fitness > 3 ? ' high' : '');
    m.el.title = `F:${m.fitness.toFixed(1)}`;
  }
}

function step() {
  // inject hand/pointer as temporary rest bias via residual
  if(hand.active || pointer.x){
    const hx = hand.active ? hand.x : (pointer.x - window.innerWidth/2)*0.3;
    const hy = hand.active ? hand.y : (pointer.y - window.innerHeight/2)*0.3;
    for(const m of masses){
      const dx = hx - m.x, dy = hy - m.y;
      if(Math.hypot(dx,dy) < 80){
        m.mlp.w[0] += dx*0.0002; // tiny online adaptation
      }
    }
  }
  solve();
  // simple claim competition
  for(let i=0;i<masses.length;i++){
    for(let j=i+1;j<masses.length;j++){
      const A=masses[i], B=masses[j];
      const d = Math.hypot(A.x-B.x, A.y-B.y, A.z-B.z);
      if(d < 28 && A.fitness !== B.fitness){
        const winner = A.fitness > B.fitness ? A : B;
        const loser = A.fitness > B.fitness ? B : A;
        // transfer genome
        for(let k=0;k<loser.mlp.w.length;k++){
          if(Math.random()<0.4) loser.mlp.w[k] = winner.mlp.w[k] + rand(-0.1,0.1);
        }
        loser.fitness *= 0.7;
        winner.fitness += 0.3;
        if(winner.fitness > bestFitness){ bestFitness = winner.fitness; bestGenome = winner.mlp.clone(); }
      }
    }
  }
  updateVisuals();
  requestAnimationFrame(step);
}

scene.addEventListener('pointermove', e => { pointer.x = e.clientX; pointer.y = e.clientY; });
scene.addEventListener('click', e => {
  // reward nearest
  let best = null, bd = 1e9;
  const px = e.clientX - window.innerWidth/2, py = e.clientY - window.innerHeight/2;
  for(const m of masses){
    const d = Math.hypot(m.x-px, m.y-py);
    if(d < bd){ bd=d; best=m; }
  }
  if(best && bd<60){ best.fitness += 1.5; status.textContent = `Rewarded agent ${best.id} → ${best.fitness.toFixed(1)}`; }
});

document.getElementById('seal').onclick = async () => {
  if(!bestGenome) return;
  const req = indexedDB.open(dbName, 1);
  req.onupgradeneeded = () => req.result.createObjectStore('genomes');
  req.onsuccess = () => {
    const tx = req.result.transaction('genomes','readwrite');
    tx.objectStore('genomes').put({w: bestGenome.w, f: bestFitness, t: Date.now()}, 'best');
    status.textContent = `Sealed fitness ${bestFitness.toFixed(1)}`;
    bc.postMessage({type:'genome', w: bestGenome.w, f: bestFitness});
  };
};

document.getElementById('reset').onclick = init;

bc.onmessage = e => {
  if(e.data.type === 'genome' && e.data.f > bestFitness){
    bestGenome = new MLP(e.data.w);
    bestFitness = e.data.f;
    // inject into a random agent
    const m = masses[Math.floor(Math.random()*N)];
    m.mlp = bestGenome.mutate(0.05);
    m.fitness = bestFitness * 0.8;
    status.textContent = `Received genome f=${bestFitness.toFixed(1)}`;
  }
};

// WebXR attempt (graceful)
if(navigator.xr){
  navigator.xr.isSessionSupported('immersive-vr').then(ok => {
    if(ok) status.textContent += ' | WebXR available (hand tracking optional)';
  }).catch(()=>{});
}

// DeviceOrientation fallback residual
window.addEventListener('deviceorientation', e => {
  if(e.beta) hand = {x: (e.gamma||0)*2, y: (e.beta||0)*2, z:0, active:true};
});

init();
step();
status.textContent = 'Pointer or tilt to influence constraints. Click spheres to reward.';
