// A subject quiz: one set of multiple-choice questions from a subject or pasted notes.
// Pure. The page is /quiz/. The model call is functions/api/subject-quiz.js. Nothing is stored.

export const DOWN = 'The quiz model is down. Try again in a moment.';
export const DIFFICULTIES = Object.freeze(['easy', 'medium', 'hard']);
export const ROUND = 5;

/** plain text, tags and control characters gone, cut to max. Pure. */
export function clean(s, max) {
  return String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** { subject, notes, difficulty } or { error }. A subject, or a short paste of notes, and a known difficulty. Pure. */
export function askOf(body) {
  const b = body && typeof body === 'object' ? body : {};
  const subject = clean(b.subject, 160);
  const notes = clean(b.notes, 6000);
  const difficulty = DIFFICULTIES.includes(b.difficulty) ? b.difficulty : '';
  if (!subject && notes.length < 20) return { error: 'Type a subject, or paste at least a few lines of notes.' };
  if (!difficulty) return { error: 'Pick a difficulty.' };
  return { subject: subject || 'these notes', notes, difficulty };
}

/** the chat the model is given. Notes, when present, are the only source. Pure. */
export function promptOf(ask) {
  const depth = { easy: 'plain words, one idea each', medium: 'a careful reader', hard: 'a precise distinction, still four fair choices' };
  const source = ask.notes
    ? 'Ask only from the notes below. Do not add a fact that is not in them.\n\nNotes:\n' + ask.notes
    : 'Ask from ordinary knowledge of the subject. If you are not sure of a fact, do not ask it.';
  return [
    { role: 'system', content: 'You write a short quiz and nothing else. Reply with one JSON object and no markdown: {"questions":[{"q":"...","choices":["...","...","...","..."],"answer":0,"why":"..."}]}. Exactly ' + ROUND + ' questions. Each question has exactly four different choices. answer is the index of the right choice, 0 to 3. why is one sentence. No trick questions and no "all of the above".' },
    { role: 'user', content: 'Subject: ' + ask.subject + '\nDifficulty: ' + ask.difficulty + ' (' + depth[ask.difficulty] + ').\n' + source },
  ];
}

/** the reply text, Workers AI or an OpenAI-shaped chat body. Pure. */
export function textOf(out) {
  if (!out) return '';
  if (typeof out === 'string') return out;
  const choice = out.choices && out.choices[0] && out.choices[0].message && out.choices[0].message.content;
  const nested = out.result && (typeof out.result === 'string' ? out.result : out.result.response);
  return String(out.response || choice || nested || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

/** questions the model actually gave: four different choices, a real index, a reason. At most ROUND. Pure. */
export function questionsFrom(text) {
  const raw = String(text || '');
  const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  let data; try { data = JSON.parse(raw.slice(start, end + 1)); } catch (_) { return []; }
  const list = Array.isArray(data) ? data : data.questions;
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    const q = clean(item && item.q, 240), why = clean(item && item.why, 280);
    const choices = Array.isArray(item && item.choices) ? item.choices.map((c) => clean(c, 120)).filter(Boolean).slice(0, 4) : [];
    const answer = Number(item && item.answer);
    if (!q || !why || choices.length !== 4 || new Set(choices.map((c) => c.toLowerCase())).size !== 4) continue;
    if (!Number.isInteger(answer) || answer < 0 || answer > 3) continue;
    out.push({ q, choices, answer, why });
    if (out.length === ROUND) break;
  }
  return out;
}

/** correct count, and the questions whose pick was not the answer. Pure. */
export function scoreOf(questions, picks) {
  const list = questions || [], chose = picks || [];
  const missed = list.filter((q, i) => chose[i] !== q.answer);
  return { correct: list.length - missed.length, total: list.length, missed };
}
