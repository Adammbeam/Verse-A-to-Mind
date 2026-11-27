// /quiz/: one question at a time, a reason after each pick, the score, then the misses.
import { DOWN, scoreOf } from '/lib/subject-quiz.js';

const $ = (id) => document.getElementById(id);
const form = $('setup'), status = $('status'), card = $('card'), stem = $('stem'), choices = $('choices'), why = $('why'), next = $('next'), end = $('end'), score = $('score'), retry = $('retry'), again = $('again');
let round = [], picks = [], at = 0, locked = false;

function say(text) { status.hidden = !text; status.textContent = text || ''; }

function show() {
  const q = round[at];
  locked = false;
  card.hidden = false;
  end.hidden = true;
  stem.textContent = (at + 1) + ' of ' + round.length + '. ' + q.q;
  why.hidden = true;
  why.textContent = '';
  next.hidden = true;
  choices.replaceChildren();
  q.choices.forEach((text, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'choice';
    b.textContent = text;
    b.addEventListener('click', () => pick(i, b));
    choices.append(b);
  });
}

function pick(i, button) {
  if (locked) return;
  locked = true;
  const q = round[at];
  picks[at] = i;
  const right = i === q.answer;
  for (const b of choices.querySelectorAll('button')) b.disabled = true;
  button.classList.add(right ? 'good' : 'bad');
  if (!right) choices.children[q.answer].classList.add('good');
  why.hidden = false;
  why.textContent = (right ? 'Right. ' : 'Not this one. ') + q.why;
  next.hidden = false;
  next.textContent = at + 1 < round.length ? 'Next question' : 'See the score';
}

function finish() {
  const s = scoreOf(round, picks);
  card.hidden = true;
  end.hidden = false;
  score.textContent = s.correct + ' of ' + s.total + ' right.';
  retry.hidden = s.missed.length === 0;
  retry.textContent = s.missed.length === 1 ? 'Retry the one you missed' : 'Retry the ' + s.missed.length + ' you missed';
  retry.onclick = () => { round = s.missed; picks = []; at = 0; show(); };
}

next.addEventListener('click', () => { if (at + 1 < round.length) { at += 1; show(); } else finish(); });
again.addEventListener('click', () => { end.hidden = true; form.hidden = false; say(''); });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const subject = $('subject').value, notes = $('notes').value, difficulty = $('difficulty').value;
  say('Writing the questions…');
  $('go').disabled = true;
  try {
    const res = await fetch('/api/subject-quiz', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subject, notes, difficulty }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.questions || !data.questions.length) { say(data.error || DOWN); return; }
    round = data.questions; picks = []; at = 0;
    form.hidden = true;
    say('');
    show();
  } catch (_) { say(DOWN); }
  finally { $('go').disabled = false; }
});

const params = new URLSearchParams(location.search);
if (params.get('subject')) $('subject').value = params.get('subject');
if (params.get('difficulty')) $('difficulty').value = params.get('difficulty');
