/** Sudoku: a real 9 by 9 puzzle with exactly one solution, made on this device from a seed. Pure (no DOM). */
export const id = 'sudoku', N = 9, CELL = 36, W = 9 * 36, H = 9 * 36;

/** a small seeded random number source (mulberry32), so a seed always makes the same puzzle */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const box = (i) => Math.floor(Math.floor(i / 9) / 3) * 3 + Math.floor((i % 9) / 3);
/** the digits a cell may take in a grid (0 is empty), as a bitmask over 1..9 */
function allowed(g, i) {
  let used = 0; const r = Math.floor(i / 9), c = i % 9, b = box(i);
  for (let k = 0; k < 81; k++) if (g[k] && k !== i && (Math.floor(k / 9) === r || k % 9 === c || box(k) === b)) used |= 1 << g[k];
  return ~used & 0x3fe;
}
/** the number of solutions, counting no further than `cap` (2 is enough to tell one from many). Fills g with the first found when fill. */
export function countSolutions(grid, cap = 2, fill = false, rand = null) {
  const g = grid.slice(); let n = 0, first = null;
  const go = () => {
    let best = -1, bestMask = 0, bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const m = allowed(g, i), cnt = popcount(m);
      if (cnt === 0) return;
      if (cnt < bestCount) { best = i; bestMask = m; bestCount = cnt; if (cnt === 1) break; }
    }
    if (best < 0) { n++; if (!first) first = g.slice(); return; }
    const digits = []; for (let d = 1; d <= 9; d++) if (bestMask & (1 << d)) digits.push(d);
    if (rand) for (let k = digits.length - 1; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); [digits[k], digits[j]] = [digits[j], digits[k]]; }
    for (const d of digits) { g[best] = d; go(); g[best] = 0; if (n >= cap) return; }
  };
  go();
  if (fill && first) for (let i = 0; i < 81; i++) grid[i] = first[i];
  return n;
}
function popcount(m) { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; }

/** { given, answer }: given has 0 for each blank. Clues are taken away one at a time, kept only while the puzzle stays unique. */
export function create(seed = 1, clues = 32) {
  const rand = rng(seed), answer = new Array(81).fill(0);
  countSolutions(answer, 1, true, rand);
  const given = answer.slice(), order = [...Array(81).keys()];
  for (let k = 80; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); [order[k], order[j]] = [order[j], order[k]]; }
  let left = 81;
  for (const i of order) {
    if (left <= clues) break;
    const keep = given[i]; given[i] = 0;
    if (countSolutions(given, 2) !== 1) given[i] = keep; else left--;
  }
  return { given, answer };
}
/** the cells whose digit repeats in their row, column or box. Pure. */
export function conflicts(board) {
  const bad = new Set();
  for (let i = 0; i < 81; i++) for (let k = i + 1; k < 81; k++) {
    if (!board[i] || board[i] !== board[k]) continue;
    if (Math.floor(i / 9) === Math.floor(k / 9) || i % 9 === k % 9 || box(i) === box(k)) { bad.add(i); bad.add(k); }
  }
  return bad;
}
/** solved when every cell is filled and nothing repeats. Pure. */
export const solved = (board) => board.every((d) => d >= 1 && d <= 9) && conflicts(board).size === 0;
export const how = 'Tap a square, then a digit (or type 1 to 9; arrows move, Backspace clears). Each row, column and 3 by 3 box holds 1 to 9 once.';
