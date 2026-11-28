// Natural system problems ("I need a client onboarding system that runs itself") are not a skill prefix.
// This composes one card from the packs Verse already has. Nothing is sent. Hours come from time-saved and stay labelled estimates.
import { estimateFor } from '../skills/time-saved.js';
import { suggestMonitors } from '../skills/monitor-pack.js';

export const ASKS = [
  'I need a client onboarding system that runs itself.',
  'Turn weekly client reports into something I never have to think about.',
  'I keep forgetting invoices.',
  'Build me a way to track project delivery.',
  'Our support process is chaos.',
];

const norm = (t) => String(t || '').trim().replace(/[?!.]+$/, '').replace(/\s+/g, ' ').toLowerCase();

const SHAPE = [
  [/\bi need\b.*\bonboarding\b.*\b(?:system|runs itself|run itself)\b/, 'onboarding'],
  [/\bturn\b.*\breports?\b.*\bnever have to\b/, 'reports'],
  [/\b(?:keep forgetting|forgetting)\b.*\binvoices?\b/, 'invoices'],
  [/\bbuild me a way to track\b.*\b(?:project|delivery)\b/, 'delivery'],
  [/\bsupport\b.*\bprocess\b.*\bchaos\b/, 'support'],
];

const PACKS = {
  onboarding: {
    title: 'Client onboarding',
    steps: ['Capture the new client', 'Send the welcome sequence', 'Collect what only the client knows', 'Watch for a stalled step', 'Hand off a running welcome'],
    automations: ['Intake capture', 'Welcome sequence', 'Stall nudge'],
    next: 'Ask for the kickoff pack when the first client is named.',
  },
  reports: {
    title: 'Weekly client reports',
    steps: ['Gather the week’s facts', 'Draft the client report', 'Send it on the same weekday', 'File the copy'],
    automations: ['Scheduled report', 'Status digest'],
    next: 'Ask for the delivery pack when the weekday is chosen.',
  },
  invoices: {
    title: 'Invoice reminders',
    steps: ['List what is unpaid', 'Send the first reminder', 'Send a second if it is still open', 'Mark it paid or escalate'],
    automations: ['Reminder sequence', 'Overdue nudge'],
    next: 'Ask for the monitor pack when the reminder gap is chosen.',
  },
  delivery: {
    title: 'Project delivery tracker',
    steps: ['Name the project', 'List the milestones', 'Post the delivery status', 'Flag a late milestone'],
    automations: ['Delivery status card', 'Late-milestone alert'],
    next: 'Ask for the delivery dashboard when a project is named.',
  },
  support: {
    title: 'Support process',
    steps: ['Catch the ticket', 'Sort the queue', 'Reply or escalate', 'Close it with a note'],
    automations: ['Ticket routing', 'Unanswered-age alert'],
    next: 'Ask for the process map when the queues are named.',
  },
};

/** which of the five problem shapes this is, or ''. Pure. */
export function kindOf(text) {
  const t = norm(text);
  for (const [re, kind] of SHAPE) if (re.test(t)) return kind;
  return '';
}

/** a natural system problem, not an explicit "process map" or "package this idea" ask. Pure. */
export function isSystemNeed(text) {
  const t = norm(text);
  if (!t || t.length > 180) return false;
  if (/^(?:process map|map the process|show the process map|package this|pack this|handoff pack|delivery package|system design|design the system|design a system|design systems)\b/.test(t)) return false;
  return !!kindOf(t);
}

/** one connected card: steps, automations, monitors, a labelled estimate, and a next step. Pure. */
export function compose(text) {
  const kind = kindOf(text) || 'onboarding';
  const pack = PACKS[kind];
  const estimate = estimateFor('time saved for ' + pack.title);
  const monitors = suggestMonitors(pack.title + ' ' + text);
  return { kind, subject: norm(text), ...pack, monitors, estimate };
}

/** the card HTML. esc is the page escaper. Pure given esc. */
export function renderSystem(text, esc) {
  const e = typeof esc === 'function' ? esc : (s) => String(s == null ? '' : s);
  const card = compose(text);
  const lis = (xs) => xs.map((x) => '<li>' + e(x) + '</li>').join('');
  const est = card.estimate;
  const id = card.kind;
  const flow = [['process', 'Process'], ['automations', 'Automations Verse owns'], ['monitoring', 'Monitoring'], ['estimate', 'Time saved (estimate)'], ['next', 'Next']];
  const sec = (key, label, body) => '<h3 data-system="' + e(id) + '" data-artifact="' + key + '">' + e(label) + '</h3>' + body;
  const links = flow.slice(0, -1).map((a, i) => '<a data-system="' + e(id) + '" data-from="' + a[0] + '" data-to="' + flow[i + 1][0] + '">' + e(a[1]) + ' → ' + e(flow[i + 1][1]) + '</a>').join(' ');
  return '<article data-system="' + e(id) + '"><h2>' + e(card.title) + '</h2>'
    + '<p class="sub">For: ' + e(card.subject) + '</p>'
    + sec('process', 'Process', '<ol>' + lis(card.steps) + '</ol>')
    + sec('automations', 'Automations Verse owns', '<ul>' + lis(card.automations) + '</ul>')
    + sec('monitoring', 'Monitoring', '<ul>' + lis(card.monitors) + '</ul>')
    + sec('estimate', 'Time saved (estimate)', '<p>Estimate: about ' + e(String(est.hoursPerWeek)) + ' hours a week. ' + e(est.basis) + '</p><p class="sub">' + e(est.note) + '</p>')
    + sec('next', 'Next', '<p>' + e(card.next) + '</p>')
    + '<nav data-system="' + e(id) + '">' + links + '</nav>'
    + '<div class="src">Source: Verse packs already on the stage (process map, automations, monitors, time-saved). The hours are an estimate, not a measurement.</div></article>';
}
