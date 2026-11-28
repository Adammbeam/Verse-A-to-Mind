// A system problem is a pain in a domain. The wording is not listed. Nothing is sent.
import { estimateFor } from '../skills/time-saved.js';
import { suggestMonitors } from '../skills/monitor-pack.js';
const norm = (t) => String(t || '').trim().replace(/[?!.]+$/, '').replace(/\s+/g, ' ').toLowerCase();

const PAIN = /\b(?:need|needs|want|forget|forgetting|forgot|mess|messy|chaos|chaotic|drowning|out of control|without|on its own|stall|stalling|slip|slips|never|chore|themselves|living|losing|feels|pile|piles|piling|babysit|chasing|remember|happen|build|track|tracking)\b/;
const DOMAIN = [
  [/\binvoices?\b|\bunpaid\b|\bbills?\b|\bbilling\b|hasn'?t paid|have not paid/, 'invoices'],
  [/\bweekly\b.{0,48}\b(?:reports?|updates?|notes|summaries)\b|\bclient reports?\b|\bcustomer summaries\b|\bstatus notes\b/, 'reports'],
  [/\bonboard|\bnew clients?\b|\bclient setup\b|\bwelcome\b|\bnew accounts?\b/, 'onboarding'],
  [/\bmilestones?\b|\bproject delivery\b|\bprojects?\b.{0,24}\bon time\b|\bhandoff progress\b|\btrack projects?\b/, 'delivery'],
  [/\bsupports?\b|\btickets?\b|\bcustomer help\b|\bcustomer problems\b/, 'support'],
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
    steps: ['Inbound Tickets', 'Priority Routing', 'Owner Assignment', 'SLA Monitor', 'Operations Dashboard', 'Weekly Support Report'],
    automations: ['Auto-triage', 'Escalation alerts', 'SLA reminders'],
    next: 'Name the queue owner, then turn the SLA reminders on.',
    surprise: 'Escalation Risk Monitor',
  },
};

export function domainOf(text) {
  const t = norm(text);
  for (const [re, kind] of DOMAIN) if (re.test(t)) return kind;
  return '';
}

export function kindOf(text) {
  const t = norm(text);
  if (!PAIN.test(t)) return '';
  return domainOf(t);
}

export function isSystemNeed(text) {
  const t = norm(text);
  if (!t || t.length > 180) return false;
  if (/^(?:process map|map the process|show the process map|package this|pack this|handoff pack|delivery package|system design|design the system|design a system|design systems)\b/.test(t)) return false;
  return !!kindOf(t);
}

export function compose(text) {
  const kind = kindOf(text) || domainOf(text) || 'onboarding';
  const pack = PACKS[kind];
  const estimate = estimateFor('time saved for ' + pack.title);
  const monitors = suggestMonitors(pack.title + ' ' + text);
  return { kind, subject: norm(text), ...pack, monitors, estimate };
}

export function renderSystem(text, esc) {
  const e = typeof esc === 'function' ? esc : (s) => String(s == null ? '' : s);
  const card = compose(text);
  const lis = (xs) => xs.map((x) => '<li>' + e(x) + '</li>').join('');
  const est = card.estimate;
  const id = card.kind;
  const flows = {
    onboarding: [['intake', 'Process'], ['welcome-sequence', 'Automations Verse owns'], ['stall-watch', 'Monitoring'], ['onboarding-hours', 'Time saved (estimate)'], ['client-handoff', 'Next']],
    reports: [['week-gather', 'Process'], ['draft', 'Automations Verse owns'], ['weekday-send', 'Monitoring'], ['report-file', 'Time saved (estimate)'], ['status-digest', 'Next']],
    invoices: [['unpaid-list', 'Process'], ['reminder', 'Automations Verse owns'], ['overdue-nudge', 'Monitoring'], ['invoice-hours', 'Time saved (estimate)'], ['escalate', 'Next']],
    delivery: [['milestones', 'Process'], ['status-board', 'Automations Verse owns'], ['late-flag', 'Monitoring'], ['tracker', 'Time saved (estimate)'], ['delivery-next', 'Next']],
    support: [['ticket-intake', 'Process'], ['queue-sort', 'Automations Verse owns'], ['ticket-routing', 'Monitoring'], ['unanswered', 'Time saved (estimate)'], ['close-note', 'Next']],
  };
  const flow = flows[id] || flows.onboarding;
  const sec = (key, label, body) => '<h3 data-system="' + e(id) + '" data-artifact="' + key + '">' + e(label) + '</h3>' + body;
  const bodies = [
    '<ol>' + lis(card.steps) + '</ol>',
    '<ul>' + lis(card.automations) + '</ul>',
    '<ul>' + lis(card.monitors) + '</ul>',
    '<p>Estimate: about ' + e(String(est.hoursPerWeek)) + ' hours a week. ' + e(est.basis) + '</p><p class="sub">' + e(est.note) + '</p>',
    '<p>' + e(card.next) + '</p>',
  ];
  const links = flow.slice(0, -1).map((a, i) => '<a data-system="' + e(id) + '" data-from="' + a[0] + '" data-to="' + flow[i + 1][0] + '">' + e(a[1]) + ' → ' + e(flow[i + 1][1]) + '</a>').join(' ');
  const surprise = card.surprise
    ? sec('escalation-risk', card.surprise, '<p>One extra watch on the queue most likely to breach.</p>')
      + '<a data-system="' + e(id) + '" data-from="' + flow[flow.length - 1][0] + '" data-to="escalation-risk">' + e(flow[flow.length - 1][1]) + ' → ' + e(card.surprise) + '</a>'
    : '';
  return '<article data-system="' + e(id) + '"><h2>' + e(card.title) + '</h2>'
    + '<p class="sub">For: ' + e(card.subject) + '</p>'
    + flow.map((a, i) => sec(a[0], a[1], bodies[i])).join('')
    + surprise
    + '<nav data-system="' + e(id) + '">' + links + '</nav>'
    + '<div class="src">Source: Verse packs already on the stage (process map, automations, monitors, time-saved). The hours are an estimate, not a measurement.</div></article>';
}

const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function fallbackSystem(ask) {
  if (!domainOf(ask)) return '';
  return renderSystem(ask, escHtml);
}
