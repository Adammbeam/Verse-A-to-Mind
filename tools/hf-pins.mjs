// A pinned outside dataset, vendored next to its licence. `node tools/hf-pins.mjs` checks the pins offline and is the
// check a build runs; `node tools/hf-pins.mjs --refresh` is the clearly labelled optional refresh that fetches one fixed
// commit from huggingface.co, verifies its bytes, and rewrites the small derived file. Nothing on the site fetches it.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(resolve(root, f), 'utf8');
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const readPin = () => JSON.parse(read('data/hf-pins.json'));

/** The small fixed set of airport rows Verse keeps from the pinned CSV, in a stable order. */
const CODES = ['LHR','JFK','LIS','CDG','SIN','SFO','NRT','SYD','DXB','AMS','FRA','MAD','FCO','YYZ','ORD','LAX','HND','ICN','BKK','GRU','EZE','CPT','JNB','DEL'];
const HEAD = '"code","time_zone_id","name","city_code","country_id","location","elevation","url","icao","city","county","state"';

/** A minimal quoted-CSV reader: the source has quoted names and commas inside quotes. */
export function cells(line) {
  const out = []; let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted; }
    else if (c === ',' && !quoted) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** Reduce the pinned CSV to the rows the page and the check use, with the source's own license written into the file. */
export function derive(text, d, hash) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (lines.shift() !== HEAD) throw new Error('the pinned CSV changed its columns');
  const byCode = new Map(lines.map((line) => { const c = cells(line); return [c[0], { code: c[0], tz: c[1], name: c[2], city: c[9] || c[3], country: c[4], icao: c[8] }]; }));
  const airports = CODES.map((code) => byCode.get(code));
  const missing = CODES.filter((code, i) => !airports[i]);
  if (missing.length) throw new Error('the pinned CSV lost: ' + missing.join(', '));
  return {
    v: 1,
    source: d.id + ' (' + d.url + ')',
    author: d.author,
    license: d.license,
    licenseSource: d.licenseSource,
    pin: d.commit,
    pinFile: d.file,
    pinSha256: hash,
    fields: ['code', 'name', 'city', 'country', 'tz', 'icao'],
    note: 'A small fixed set of codes copied from the pinned dataset; no request is made to huggingface.co at runtime.',
    airports,
  };
}

/** Everything that can be checked without a network. Returns a list of problems; empty means the pins are sound. */
export function verify(pin = readPin()) {
  const problems = [];
  if (pin.library.license !== 'Apache-2.0' || !/^https:\/\/github\.com\/huggingface\/datasets$/.test(pin.library.url))
    problems.push('the datasets library pin needs its Apache-2.0 licence and source URL');
  if (!pin.datasets.length) problems.push('no pinned dataset');
  for (const d of pin.datasets) {
    if (!/^[0-9a-f]{40}$/.test(d.commit)) problems.push(d.id + ': bad commit pin');
    if (!d.license || !d.licenseSource || !d.licenseFile) problems.push(d.id + ': no licence beside the pin');
    else if (!/MIT|Apache-2\.0|CC0|CC-BY|Unlicense/.test(d.license)) problems.push(d.id + ': unrecognised dataset licence ' + d.license);
    else if (!read(d.licenseFile).includes(d.license)) problems.push(d.id + ': the licence file does not name ' + d.license);
    let data;
    try { data = JSON.parse(read(d.derived)); } catch (e) { problems.push(d.id + ': no vendored data: ' + e.message); continue; }
    if (sha256(readFileSync(resolve(root, d.derived))) !== d.derivedSha256) problems.push(d.id + ': the vendored data changed without a new pin');
    if (data.pin !== d.commit || data.pinFile !== d.file || data.pinSha256 !== d.fileSha256)
      problems.push(d.id + ': the data does not name the pinned source bytes');
    if (data.license !== d.license || data.author !== d.author || data.source !== d.id + ' (' + d.url + ')')
      problems.push(d.id + ': the data does not carry its own licence and attribution');
    if (!Array.isArray(data.airports) || data.airports.length !== CODES.length || data.airports.some((a, i) => a.code !== CODES[i]))
      problems.push(d.id + ': the vendored rows are not the fixed set');
  }
  return problems;
}

/** Optional refresh: network, at the pinned commit only, and it refuses a file whose bytes do not match the pin. */
export async function refresh() {
  const pin = readPin();
  const notes = [];
  for (const d of pin.datasets) {
    const url = d.url.replace(/https:\/\/huggingface\.co\/datasets\//, 'https://huggingface.co/datasets/') + '/resolve/' + d.commit + '/' + d.file;
    const res = await fetch(url);
    if (!res.ok) throw new Error(d.id + ': ' + res.status + ' fetching ' + url);
    const bytes = Buffer.from(await res.arrayBuffer());
    const hash = sha256(bytes);
    if (hash !== d.fileSha256) throw new Error(d.id + ': pinned sha256 ' + d.fileSha256 + ' did not match ' + hash + ' — refusing to refresh from changed bytes');
    const text = derive(bytes.toString('utf8'), d, hash);
    const out = JSON.stringify(text) + '\n';
    writeFileSync(resolve(root, d.derived), out);
    notes.push(d.id + ': refreshed ' + text.airports.length + ' rows into ' + d.derived + ' — update derivedSha256 to ' + sha256(out));
  }
  return notes;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--refresh')) {
    refresh().then((notes) => { for (const n of notes) console.log('hf-pins ' + n); }, (e) => { console.error('hf-pins refresh failed: ' + e.message); process.exit(1); });
  } else {
    const problems = verify();
    if (problems.length) { for (const p of problems) console.error('hf-pins: ' + p); process.exit(1); }
    console.log('hf-pins: ' + readPin().datasets.length + ' dataset pin(s), source and licence vendored, no network needed');
  }
}
