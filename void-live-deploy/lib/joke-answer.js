// A joke asked of /api/answer (a widget, a bot, the visitor pass) is told by the joke skill's own sources, not read from the 7-day answer
// cache or written by the model: 2026-11-25, "tell me a joke" got a cached article about a song. Tongue twisters and knock-knock
// jokes come from skills/joke.js's own lists; any other joke from icanhazdadjoke (no key), on a topic when the ask names one.
import skill, { isTwister, isKnock, jokeTopic, aboutTopic, KNOCK, TWISTERS } from '../skills/joke.js';

const clean = (ask) => String(ask || '').trim().replace(/[?!.]+$/, '');
/** whether the joke skill answers this ask: the skill's own match, so the page and the API agree (a riddle is skills/riddle.js's). Pure. */
export function isJokeAsk(ask) { const t = clean(ask); return !!t && !!skill.match(t.toLowerCase(), t); }

const pick = (list, rnd) => list[Math.floor(rnd() * list.length) % list.length];
const out = (answer, sources = []) => ({ answer, sources, at: new Date().toISOString(), route: 'skill', skill: 'joke', source: 'skill:joke' });

/** the reply for a joke ask, or null when it is not one. The service's failure is said plainly, never a made-up joke. */
export async function jokeAnswer(ask, { fetch: f = fetch, rnd = Math.random } = {}) {
  const t = clean(ask);
  if (!isJokeAsk(t)) return null;
  if (isTwister(t)) return out(pick(TWISTERS, rnd) + ' Say it three times fast.');
  if (isKnock(t)) { const [who, line] = pick(KNOCK, rnd); return out(`Knock knock.\nWho's there?\n${who}.\n${who} who?\n${line}`); }
  const topic = jokeTopic(t), said = jokeTopic(t, true);
  try {
    if (topic) {
      const j = await f('https://icanhazdadjoke.com/search?limit=30&term=' + encodeURIComponent(topic), { headers: { accept: 'application/json', 'user-agent': 'Verse (https://a-to-mind.com)' } }).then((r) => r.json());
      const list = aboutTopic(j && j.results, topic);
      if (!list.length) return out(`icanhazdadjoke has no joke about ${said}. Ask "tell me a joke" for one on anything.`, [{ title: 'icanhazdadjoke search', url: 'https://icanhazdadjoke.com/search?term=' + encodeURIComponent(topic) }]);
      const k = pick(list, rnd);
      return out(k.joke, [{ title: 'icanhazdadjoke', url: 'https://icanhazdadjoke.com/j/' + encodeURIComponent(k.id || '') }]);
    }
    const j = await f('https://icanhazdadjoke.com/', { headers: { accept: 'application/json', 'user-agent': 'Verse (https://a-to-mind.com)' } }).then((r) => r.json());
    if (!j || !j.joke) throw new Error('no joke');
    return out(j.joke, [{ title: 'icanhazdadjoke', url: 'https://icanhazdadjoke.com/j/' + encodeURIComponent(j.id || '') }]);
  } catch (_) {
    return { ...out(null), note: "the joke service didn't answer just now" };
  }
}
