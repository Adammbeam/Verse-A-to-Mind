/**
 * sudoku skill: "play sudoku", "sudoku", "new sudoku puzzle". A real 9 by 9 puzzle with one solution (skills/sudoku-rules.js), made on this
 * device, in the arcade card (skills/arcade-card.js). 2026-11-25: "play sudoku" fell to a model answer saying it could not play.
 * Nothing is sent anywhere. Contract: { name, examples, nearMisses, match(lower, text), run(text, api) }
 */
import * as G from './sudoku-rules.js';
import { arcadeCard } from './arcade-card.js';
import { asked } from '../lib/studio-play.js';

export function sudokuOf(text) { return asked(text, ['sudoku', 'sudoku puzzle', 'a sudoku']); }

function mount(th, stageApi) {
  const c = arcadeCard(th, stageApi, { cls: 'sudoku', title: 'Sudoku', sub: 'one solution · made on this device', w: G.W, h: G.H });
  const pad = document.createElement('div'); pad.className = 'sudoku-pad'; pad.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:6px';
  for (const d of [1, 2, 3, 4, 5, 6, 7, 8, 9, 0]) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'g-btn'; b.textContent = d ? String(d) : '✕'; b.setAttribute('aria-label', d ? 'Put ' + d : 'Clear');
    b.style.cssText = 'min-width:28px;padding:4px 6px'; b.addEventListener('pointerdown', (e) => e.stopPropagation()); b.addEventListener('click', () => put(d)); pad.append(b);
  }
  c.el.insertBefore(pad, c.status);
  let s, cell, t0, done;
  const fresh = () => { const p = G.create((Math.random() * 2 ** 31) >>> 0); s = { given: p.given, board: p.given.slice() }; cell = s.given.findIndex((d) => !d); t0 = Date.now(); done = false; c.why.textContent = G.how; c.status.textContent = ''; };
  const put = (d) => {
    if (done || cell < 0 || s.given[cell]) return;
    s.board[cell] = d;
    if (G.solved(s.board)) { done = true; const sec = Math.round((Date.now() - t0) / 1000); c.status.textContent = 'Solved in ' + Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0') + '. New game for another.'; }
    else c.status.textContent = s.board.filter((x) => !x).length + ' squares left';
  };
  c.cv.addEventListener('pointerdown', (e) => { const p = c.local(e); const r = Math.floor(p.y / G.CELL), k = Math.floor(p.x / G.CELL); if (r >= 0 && r < 9 && k >= 0 && k < 9) cell = r * 9 + k; c.el.focus(); });
  c.el.addEventListener('keydown', (e) => {
    const mv = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -9, ArrowDown: 9 }[e.key];
    if (mv) { cell = ((cell < 0 ? 0 : cell) + mv + 81) % 81; e.preventDefault(); return; }
    if (/^[1-9]$/.test(e.key)) { put(+e.key); e.preventDefault(); } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') { put(0); e.preventDefault(); }
  });
  c.again.addEventListener('click', fresh);
  fresh();
  c.start((dt, g) => {
    const bad = G.conflicts(s.board);
    g.fillStyle = '#07060f'; g.fillRect(0, 0, G.W, G.H);
    for (let i = 0; i < 81; i++) {
      const r = Math.floor(i / 9), k = i % 9;
      g.fillStyle = i === cell ? '#2b2152' : '#12101c'; g.fillRect(k * G.CELL + 1, r * G.CELL + 1, G.CELL - 2, G.CELL - 2);
      if (s.board[i]) { g.fillStyle = bad.has(i) ? '#ff6b6b' : s.given[i] ? '#f4f1ea' : '#9fb6ff'; g.font = (s.given[i] ? '600 ' : '') + '18px sans-serif'; g.fillText(String(s.board[i]), k * G.CELL + 13, r * G.CELL + 25); }
    }
    g.strokeStyle = '#8a7fd0'; g.lineWidth = 2;
    for (let j = 0; j <= 9; j += 3) { g.beginPath(); g.moveTo(j * G.CELL, 0); g.lineTo(j * G.CELL, G.H); g.moveTo(0, j * G.CELL); g.lineTo(G.W, j * G.CELL); g.stroke(); }
  });
}

function run(text, api) {
  if (!sudokuOf(text)) return 'none';
  const existing = Object.values(api.stage.things()).find((t) => t.kind === 'sudoku');
  if (existing) { if (api.stage.center) api.stage.center(existing.id); else api.stage.render(); return 'sudoku'; }
  api.summon('sudoku', { x: Math.max(10, Math.round(innerWidth / 2 - 175)), y: 40 });
  api.say('Sudoku');
  return 'sudoku';
}

export default {
  name: 'sudoku',
  sudokuOf,
  examples: ['play sudoku', 'sudoku', 'new sudoku puzzle', "let's play sudoku"],
  nearMisses: ['how to solve sudoku', 'who invented sudoku', 'sudoku rules', 'nine grid'],
  match(lower, text) { return sudokuOf(text || lower); },
  run,
  stageKinds: { sudoku: { mount } },
};
