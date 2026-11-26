/**
 * fortune skill — a random fortune cookie message.
 * "fortune", "fortune cookie", "give me a fortune".
 */
const FORTUNES = [
  'A pleasant surprise is waiting for you.',
  'Your hard work will soon pay off.',
  'Good things come to those who wait.',
  'A new opportunity will present itself soon.',
  'You will find success in unexpected places.',
  'Today is a good day to try something new.'
];

export function isFortune(text) {
  const t = String(text || '').trim().replace(/[?!.]+$/, '');
  return /^(?:fortune(?: cookie)?|give me a fortune)\b(?!\s+500)/i.test(t);
}

function run(text, api) {
  const { showPage, esc } = api;
  const msg = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
  showPage(el => {
    el.innerHTML = `<h2>Fortune</h2><p>${esc(msg)}</p><p class="sub">A random fortune cookie message.</p>`;
  });
  return 'fortune';
}

export default {
  name: 'fortune',
  examples: ['fortune', 'fortune cookie', 'give me a fortune'],
  nearMisses: ['fortune 500', 'what is fortune'],
  match(lower, text) { return isFortune(text || lower); },
  run,
  suite() { return { ok: isFortune('fortune') && isFortune('give me a fortune') && !isFortune('fortune 500') }; }
};
