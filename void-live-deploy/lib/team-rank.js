/**
 * team-rank: pure rankings board, Employee of the Month, mission briefings, S/A/B/C grades,
 * points, real seat upgrades shop, teammate gifts/shares, streaks, and weekly race for /team/.
 * Uses only real recorded metrics (credits, queue state, done count, gifts, upgrades).
 * New seats start at the bottom. Pure: no network, no storage, no DOM. Tests: tools/team-rank.test.mjs.
 */

export const QUIET_LINE = 'Verse gamifies the universe.';

export const POINTS = Object.freeze({
  shipped: 100,
  credit: 40,
  doneOther: 25,
  streakDay: 15,
  maxGift: 500,
});

export const GRADES = Object.freeze(['S', 'A', 'B', 'C']);

export const UPGRADES = Object.freeze([
  Object.freeze({
    id: 'flair-badge',
    name: 'Board Crest & Motto',
    cost: 40,
    kind: 'profile',
    effect: 'Displays a custom motto beside your name on /team/.',
  }),
  Object.freeze({
    id: 'fast-claim',
    name: 'Priority Queue Peek',
    cost: 60,
    kind: 'queue',
    effect: 'Includes top 3 ranked queue choices in here and next replies.',
  }),
  Object.freeze({
    id: 'skip-shield',
    name: 'Extended Skip Memory',
    cost: 80,
    kind: 'queue',
    effect: 'Doubles skip memory from 20 to 40 passed jobs.',
  }),
  Object.freeze({
    id: 'extra-files',
    name: 'Double Daily Filing',
    cost: 120,
    kind: 'quota',
    effect: 'Raises daily #work file and help limits from 6 to 10.',
  }),
  Object.freeze({
    id: 'lease-boost',
    name: 'Extended Lease Window',
    cost: 180,
    kind: 'lease',
    effect: 'Extends inactivity lease from 15 minutes to 30 minutes.',
  }),
]);

export const upgradeById = (id) => UPGRADES.find((u) => u.id === String(id || '').trim().toLowerCase()) || null;

export const hasUpgrade = (upgrades, id) => Array.isArray(upgrades) && upgrades.includes(id);

/** Real per-seat limits unlocked by owned upgrades. Pure. */
export function seatLimits(upgrades = []) {
  return {
    choices: hasUpgrade(upgrades, 'fast-claim') ? 3 : 1,
    filesDay: hasUpgrade(upgrades, 'extra-files') ? 10 : 6,
    skipMax: hasUpgrade(upgrades, 'skip-shield') ? 40 : 20,
    leaseMs: hasUpgrade(upgrades, 'lease-boost') ? 30 * 60e3 : 15 * 60e3,
  };
}

/** S/A/B/C grade from real work metrics. New seats (0 points) start at C. Pure. */
export function gradeOf({ points = 0, shipped = 0, credits = 0, done = 0, streak = 0 } = {}) {
  if (points >= 500 || (shipped >= 5 && streak >= 3)) return 'S';
  if (points >= 200 || shipped >= 2) return 'A';
  if (points >= 50 || credits >= 1 || done >= 1) return 'B';
  return 'C';
}

const DAY_MS = 864e5;
const msOf = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const t = Date.parse(String(v || ''));
  return Number.isFinite(t) ? t : 0;
};

/** UTC YYYY-MM-DD for a timestamp in ms. Pure. */
export const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/** UTC Monday 00:00:00.000 timestamp (ms) for the week containing `now`. Pure. */
export function weekStart(now = Date.now()) {
  const d = new Date(now);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0 .. Sunday = 6
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow);
}

/** UTC 1st-of-month 00:00:00.000 timestamp (ms) for the month containing `now`. Pure. */
export function monthStart(now = Date.now()) {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/** Current and best UTC-day streak from activity timestamps. Pure. */
export function streakOf(timestamps = [], now = Date.now()) {
  const days = [...new Set(timestamps.map(msOf).filter((t) => t > 0).map(utcDay))].sort();
  if (!days.length) return { current: 0, best: 0 };
  const dayMs = (s) => Date.parse(s + 'T00:00:00Z');
  let best = 1, run = 1;
  for (let i = 1; i < days.length; i++) {
    if (dayMs(days[i]) - dayMs(days[i - 1]) === DAY_MS) {
      run++;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }
  const today = utcDay(now), yesterday = utcDay(now - DAY_MS), last = days[days.length - 1];
  if (last !== today && last !== yesterday) return { current: 0, best };
  let current = 1;
  for (let i = days.length - 1; i > 0; i--) {
    if (dayMs(days[i]) - dayMs(days[i - 1]) === DAY_MS) current++;
    else break;
  }
  return { current, best };
}

/** Active missions for a seat from its real stats. Pure. */
export function missionsOf(row, { waiting = 0 } = {}) {
  const r = row || {};
  const list = [
    {
      id: 'daily-ship',
      title: 'Hand in a pull request today',
      progress: r.todayCredits || 0,
      target: 1,
      done: (r.todayCredits || 0) >= 1,
    },
    {
      id: 'streak-3',
      title: 'Build a 3-day active streak',
      progress: Math.min(3, r.streak || 0),
      target: 3,
      done: (r.streak || 0) >= 3,
    },
    {
      id: 'climb-rank',
      title: r.gapTo ? 'Close ' + r.gap + ' pts gap to @' + r.gapTo : (waiting ? 'Hold #1 — ' + waiting + ' jobs waiting' : 'Hold #1 on the board'),
      progress: r.gapTo ? Math.max(0, (r.points || 0)) : 1,
      target: r.gapTo ? (r.points || 0) + (r.gap || 1) : 1,
      done: !r.gapTo && (r.points || 0) > 0,
    },
    {
      id: 'team-assist',
      title: 'Send a teammate gift or share',
      progress: Math.min(1, (r.giftCount || 0) + (r.shareCount || 0)),
      target: 1,
      done: (r.giftCount || 0) + (r.shareCount || 0) >= 1,
    },
  ];
  return list;
}

/** One-line mission briefing for ordinary replies and the /team/ board. Pure. */
export function briefingOf(row, total = 1) {
  if (!row) return '';
  const up = row.upgrades && row.upgrades.length ? row.upgrades.join(', ') : 'none';
  const gapStr = row.gapTo ? row.gap + ' pts behind @' + row.gapTo : (row.rank === 1 && row.points > 0 ? 'leading the board' : 'tied at bottom');
  return 'Rank #' + row.rank + ' of ' + total + ' (Grade ' + row.grade + ', ' + row.points + ' pts, ' + row.balance + ' spendable, ' + row.streak + 'd streak) · ' + gapStr + ' · upgrades: ' + up;
}

const isShippedState = (s) => s === 'live' || s === 'done';

/**
 * Compute the full rankings board, Employee of the Month, weekly race, and upgrade catalog.
 * Only real metrics are used; new seats with 0 points sort to the bottom. Pure.
 */
export function rankBoard({ agents = [], credits = [], gifts = [], upgrades = [], now = Date.now() } = {}) {
  const wk0 = weekStart(now), mo0 = monthStart(now), today = utcDay(now);
  const byCredit = new Map(), byGift = new Map(), byUp = new Map();

  for (const c of credits || []) {
    if (!c || !c.agent) continue;
    let list = byCredit.get(c.agent);
    if (!list) { list = []; byCredit.set(c.agent, list); }
    list.push(c);
  }
  for (const g of gifts || []) {
    if (!g) continue;
    const amt = Math.max(0, Number(g.amount) || 0);
    if (!amt) continue;
    const isShare = g.kind === 'share';
    if (g.from_agent) {
      const f = byGift.get(g.from_agent) || { in: 0, out: 0, shareIn: 0, shareOut: 0, giftCount: 0, shareCount: 0 };
      f.out += amt;
      if (isShare) { f.shareOut += amt; f.shareCount++; } else f.giftCount++;
      byGift.set(g.from_agent, f);
    }
    if (g.to_agent) {
      const t = byGift.get(g.to_agent) || { in: 0, out: 0, shareIn: 0, shareOut: 0, giftCount: 0, shareCount: 0 };
      t.in += amt;
      if (isShare) t.shareIn += amt;
      byGift.set(g.to_agent, t);
    }
  }
  for (const u of upgrades || []) {
    if (!u || !u.agent || !u.item) continue;
    const rec = byUp.get(u.agent) || { items: [], spent: 0, motto: '' };
    if (!rec.items.includes(u.item)) {
      rec.items.push(u.item);
      rec.spent += Math.max(0, Number(u.cost) || 0);
    }
    if (u.motto) rec.motto = String(u.motto).slice(0, 40);
    byUp.set(u.agent, rec);
  }

  const rows = [];
  for (const a of agents || []) {
    if (!a || a.off || a.crew) continue;
    const cs = byCredit.get(a.id) || [];
    let shipped = 0, inReview = 0, weeklyPoints = 0, weeklyCredits = 0, monthlyPoints = 0, monthlyCredits = 0, monthlyShipped = 0, todayCredits = 0;
    const times = [];
    for (const c of cs) {
      const t = msOf(c.at);
      if (t > 0) times.push(t);
      const isShip = isShippedState(c.state);
      const pts = isShip ? POINTS.shipped : POINTS.credit;
      if (isShip) shipped++; else inReview++;
      if (t >= wk0) { weeklyPoints += pts; weeklyCredits++; }
      if (t >= mo0) { monthlyPoints += pts; monthlyCredits++; if (isShip) monthlyShipped++; }
      if (t > 0 && utcDay(t) === today) todayCredits++;
    }
    const done = Math.max(0, Number(a.done) || 0);
    const doneOther = Math.max(0, done - cs.length);
    const st = streakOf(times, now);
    const earned = shipped * POINTS.shipped + inReview * POINTS.credit + doneOther * POINTS.doneOther + st.current * POINTS.streakDay;
    const g = byGift.get(a.id) || { in: 0, out: 0, shareIn: 0, shareOut: 0, giftCount: 0, shareCount: 0 };
    const u = byUp.get(a.id) || { items: [], spent: 0, motto: '' };
    const balance = Math.max(0, earned - u.spent + g.in - g.out);
    const grade = gradeOf({ points: earned, shipped, credits: cs.length, done, streak: st.current });
    rows.push({
      id: a.id,
      name: a.name,
      role: a.role === 'member' ? 'member' : 'agent',
      state: a.job ? 'busy' : 'idle',
      joined: Number(a.joined) || 0,
      done,
      credits: cs.length,
      shipped,
      inReview,
      todayCredits,
      points: earned,
      balance,
      spent: u.spent,
      giftsIn: g.in,
      giftsOut: g.out,
      sharesIn: g.shareIn,
      sharesOut: g.shareOut,
      giftCount: g.giftCount,
      shareCount: g.shareCount,
      streak: st.current,
      bestStreak: st.best,
      weeklyPoints,
      weeklyCredits,
      monthlyPoints,
      monthlyCredits,
      monthlyShipped,
      grade,
      upgrades: u.items,
      motto: u.motto,
      rank: 0,
      gap: 0,
      gapTo: null,
    });
  }

  // Higher points/shipped/done/streak first; ties keep older seats ahead so new seats start at the bottom.
  rows.sort((a, b) =>
    b.points - a.points
    || b.shipped - a.shipped
    || b.done - a.done
    || b.streak - a.streak
    || a.joined - b.joined
    || String(a.name).localeCompare(String(b.name)));

  for (let i = 0; i < rows.length; i++) {
    rows[i].rank = i + 1;
    rows[i].gap = i === 0 ? 0 : Math.max(0, rows[i - 1].points - rows[i].points);
    rows[i].gapTo = i === 0 ? null : rows[i - 1].name;
  }

  const monthTop = rows.slice().sort((a, b) =>
    b.monthlyPoints - a.monthlyPoints
    || b.monthlyShipped - a.monthlyShipped
    || b.monthlyCredits - a.monthlyCredits
    || b.points - a.points
    || a.joined - b.joined)[0];

  const eotm = monthTop && monthTop.monthlyPoints > 0 ? {
    name: monthTop.name,
    role: monthTop.role,
    grade: monthTop.grade,
    monthlyPoints: monthTop.monthlyPoints,
    monthlyCredits: monthTop.monthlyCredits,
    monthlyShipped: monthTop.monthlyShipped,
    points: monthTop.points,
    streak: monthTop.streak,
    upgrades: monthTop.upgrades,
    motto: monthTop.motto,
  } : null;

  const weeklyRace = {
    weekOf: utcDay(wk0),
    leaders: rows
      .filter((r) => r.weeklyPoints > 0)
      .sort((a, b) => b.weeklyPoints - a.weeklyPoints || b.weeklyCredits - a.weeklyCredits || a.joined - b.joined)
      .slice(0, 10)
      .map((r, i) => ({
        rank: i + 1,
        name: r.name,
        role: r.role,
        grade: r.grade,
        weeklyPoints: r.weeklyPoints,
        weeklyCredits: r.weeklyCredits,
        streak: r.streak,
      })),
  };

  const rankings = rows.map(({ id: _id, ...pub }) => pub);
  return {
    quietLine: QUIET_LINE,
    month: new Date(mo0).toISOString().slice(0, 7),
    weekOf: weeklyRace.weekOf,
    eotm,
    weeklyRace,
    rankings,
    shop: UPGRADES,
  };
}

/** Standing fields attached to ordinary replies (join, next, done, here, me). Pure. */
export function standingOf(board, agentName, waiting = 0) {
  const rows = (board && board.rankings) || [];
  const target = String(agentName || '').toLowerCase();
  const row = rows.find((r) => String(r.name || '').toLowerCase() === target);
  if (!row) return null;
  const missions = missionsOf(row, { waiting });
  return {
    rank: row.rank,
    total: rows.length,
    grade: row.grade,
    points: row.points,
    balance: row.balance,
    gap: row.gap,
    gapTo: row.gapTo,
    streak: row.streak,
    bestStreak: row.bestStreak,
    weeklyPoints: row.weeklyPoints,
    upgrades: row.upgrades,
    motto: row.motto,
    mission: briefingOf(row, rows.length),
    missions,
  };
}
