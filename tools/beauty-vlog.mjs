#!/usr/bin/env node
// Daily glow-up: before/, after/, script.md -> 1080x1920, 30–45s. The stars beat is a tease; the reveal
// zooms into the real fix, then pulls back to a full-frame side-by-side. Does not upload or post.
//   node tools/beauty-vlog.mjs render <folder> [--out film.mp4] [--no-voice]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { W, H, SAFE, captionCheck } from './video-gate.mjs';
import { padExpr, BED_LUFS } from './shorts.mjs';
import { shapeVoice } from './show-pipe.mjs';
import { CTA } from '../void-live-deploy/lib/show-pipe.js';

export const MIN_S = 30, MAX_S = 45, FPS = 30, XF = 0.45;
export const SIGNATURE = 'Signature move. Just more stars in the sky.';
const pickFont = (a, b) => (fs.existsSync(a) ? a : b);
const BODY = pickFont('/usr/share/fonts/truetype/macos/Inter-Regular.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf');
const LABEL = pickFont('/usr/share/fonts/truetype/macos/Inter-Medium.ttf', BODY);
const ORDER = ['hook', 'before', 'change', 'stars', 'reveal', 'end'];
const FLOOR = { hook: 4.2, before: 5, change: 5.6, stars: 4.6, reveal: 9, end: 3.6 };
const KEYS = { hook: 'hook', before: 'before', change: 'change', changed: 'change', why: 'change', stars: 'stars', signature: 'stars', after: 'after', reveal: 'after', highlight: 'highlight', fix: 'highlight', box: 'box' };
export const ROBOT_AF = 'aresample=24000,asetrate=18720,aresample=24000,atempo=1.2821,highpass=f=160,lowpass=f=6200,aecho=0.8:0.9:55|120:0.14|0.06,acompressor=threshold=-18dB:ratio=2.2:attack=8:release=140';
const TEASE = new Set('just more star stars starry sky signature move look up the a an in of and'.split(' '));

const run = (cmd, args, opt = {}) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 << 20, ...opt });
const ff = (args) => { const r = run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]); if (r.status !== 0) throw new Error(String(r.stderr || r.stdout).slice(-700)); };
const dur = (f) => parseFloat(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).stdout) || 0;
const have = (cmd) => run('which', [cmd]).status === 0;

export function parseScript(md) {
  const out = { hook: '', before: '', change: '', stars: '', after: '', highlight: '', box: null };
  let key = null, sawBox = false;
  for (const line of String(md || '').split(/\n/)) {
    const h = line.match(/^#{1,3}\s*([A-Za-z][A-Za-z -]{0,24})\s*$/) || line.match(/^([A-Za-z][A-Za-z -]{0,24})\s*:\s*(.*)$/);
    const name = h && KEYS[h[1].toLowerCase().trim()];
    if (name) {
      key = name; if (name === 'box') sawBox = true;
      if (h[2] && h[2].trim() && name !== 'box') out[name] = (out[name] ? out[name] + ' ' : '') + h[2].trim();
      if (h[2] && h[2].trim() && name === 'box') out.box = (out.box ? out.box + ' ' : '') + h[2].trim();
      continue;
    }
    if (!key || !line.trim()) continue;
    if (key === 'box') out.box = (out.box ? out.box + ' ' : '') + line.trim();
    else out[key] = (out[key] ? out[key] + ' ' : '') + line.trim();
  }
  for (const k of ['hook', 'before', 'change', 'stars', 'after', 'highlight']) out[k] = String(out[k] || '').replace(/\s+/g, ' ').trim();
  if (!out.stars) out.stars = SIGNATURE;
  if (sawBox) { const n = String(out.box || '').trim().split(/[\s,]+/).map(Number); out.box = n.length === 4 && n.every((x) => Number.isFinite(x) && x >= 0 && x <= 1) ? n : null; }
  else out.box = null;
  return out;
}

export function isTease(s) {
  const rest = String(s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w && !TEASE.has(w));
  return rest.length < 2;
}

export function scriptIssues(s) {
  const bad = [];
  if (!s || !s.hook || s.hook.split(/\s+/).length > 16) bad.push('hook');
  if (!s || !s.before) bad.push('before');
  if (!s || !s.change || isTease(s.change)) bad.push('change');
  if (!s || !s.after || isTease(s.after)) bad.push('after');
  if (!s || !s.highlight || isTease(s.highlight)) bad.push('highlight');
  if (s && s.highlight && s.after && !s.after.toLowerCase().includes(s.highlight.toLowerCase())) bad.push('after does not name the fix');
  if (s && s.stars && s.highlight && s.stars.toLowerCase().includes(s.highlight.toLowerCase()) && /change|fix|progress/i.test(s.stars)) bad.push('stars beat claims the fix');
  if (s && /stars?.{0,24}(is|are) the (fix|change|progress|glow)/i.test(s.after || '')) bad.push('reveal treats stars as the change');
  return bad;
}

export function planEpisode(script, voiceSecs = []) {
  const voice = { hook: voiceSecs[0] || 0, before: voiceSecs[1] || 0, change: voiceSecs[2] || 0, stars: voiceSecs[3] || 0, reveal: voiceSecs[4] || 0, end: 0 };
  const beats = ORDER.map((id) => ({ id, d: +Math.max(FLOOR[id], voice[id] ? voice[id] + 0.55 : 0).toFixed(2) }));
  const sum = () => beats.reduce((a, b) => a + b.d, 0);
  for (let i = 0; i < 40 && sum() < MIN_S; i++) { const b = beats.find((x) => x.id === 'reveal'); b.d = +(b.d + 0.2).toFixed(2); }
  for (let i = 0; i < 90 && sum() > MAX_S; i++) {
    const b = beats.filter((x) => x.d > +(Math.max(voice[x.id] + 0.5, 2.2)).toFixed(2)).sort((a, c) => c.d - a.d)[0];
    if (!b) break;
    b.d = +(b.d - 0.12).toFixed(2);
  }
  const total = +sum().toFixed(2);
  if (total < MIN_S - 0.05 || total > MAX_S + 0.05) return { error: 'cut is ' + total + 's', beats, total };
  let at = 0;
  for (const b of beats) { b.from = +at.toFixed(2); b.to = +(at + b.d).toFixed(2); at = b.to; }
  return { beats, total: +at.toFixed(2) };
}

function sentences(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean);
}
function wrapLines(sentence, maxChars) {
  const lines = []; let cur = '';
  for (const w of sentence.split(/\s+/).filter(Boolean)) {
    if (cur && (cur + ' ' + w).length > maxChars) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) lines.push(cur);
  return lines;
}
function phrases(text) {
  const out = [], emit = (s) => { const lines = wrapLines(s, 24); if (lines.length) out.push(lines.slice(0, 2).join('\n')); };
  for (const s of sentences(text)) {
    if (wrapLines(s, 24).length <= 2) { emit(s); continue; }
    const bits = s.replace(/[.!?]+$/, '').split(/,\s+/).map((b) => b.trim()).filter(Boolean);
    if (bits.length < 2) { emit(s); continue; }
    let cur = '';
    const flush = () => { if (!cur) return; let p = cur.replace(/,$/, ''); p = p[0].toUpperCase() + p.slice(1); if (!/[.!?]$/.test(p)) p += '.'; emit(p); cur = ''; };
    for (const bit of bits) { const next = cur ? cur + ', ' + bit : bit; if (wrapLines(next, 24).length <= 2) cur = next; else { flush(); cur = bit; } }
    flush();
  }
  return out;
}
function metrics(text, size) {
  const lines = String(text).split('\n');
  return { w: Math.max(...lines.map((l) => l.length), 1) * size * 0.52, h: lines.length * size * 1.22 };
}
function place(text, size, y, from, to, lane, font) {
  const m = metrics(text, size);
  let yy = y + m.h > SAFE.y1 ? SAFE.y1 - m.h : y;
  if (yy < SAFE.y0) yy = SAFE.y0;
  let x = lane === 'left' ? 84 : lane === 'right' ? 624 : SAFE.x0 + (SAFE.x1 - SAFE.x0 - m.w) / 2;
  x = Math.max(SAFE.x0, Math.min(x, SAFE.x1 - m.w));
  return { text, raw: text.replace(/\n/g, ' '), size, x: Math.round(x), y: Math.round(yy), w: Math.round(m.w), h: Math.round(m.h), box: true, rect: true, font: font || BODY, from: +(+from).toFixed(2), to: +(+to).toFixed(2) };
}
function spread(text, y, from, to) {
  const parts = phrases(text);
  if (!parts.length) return [];
  const span = (to - from) / parts.length;
  return parts.map((p, i) => {
    const wide = Math.max(...p.split('\n').map((l) => l.length));
    const end = i + 1 < parts.length && span > 0.5 ? from + (i + 1) * span - 0.08 : from + (i + 1) * span;
    return place(p, wide > 18 ? 64 : 72, y, from + i * span, end, 'full');
  });
}

export function captionsFor(script, beats) {
  const say = { hook: script.hook, before: script.before, change: script.change, stars: script.stars, reveal: script.after, end: CTA };
  const out = [];
  for (const b of beats) {
    if (b.id !== 'reveal') { out.push(...spread(say[b.id], b.id === 'end' ? 860 : 1200, b.from, b.to)); continue; }
    const d = b.d, t0 = b.from, lines = phrases(say.reveal);
    const fix = lines.find((p) => script.highlight && p.toLowerCase().includes(script.highlight.toLowerCase())) || lines[lines.length - 1] || '';
    const wide = [[t0, t0 + d * 0.22], [t0 + d * 0.88, b.to]];
    if (fix) out.push(place(fix, 64, 1224, t0 + d * 0.40, t0 + d * 0.72, 'full'));
    for (const [a, z] of wide) { out.push(place('BEFORE', 64, 220, a, z, 'left', LABEL)); out.push(place('AFTER', 64, 220, a, z, 'right', LABEL)); }
  }
  return out;
}

export function shotsOf(dir) {
  try { return fs.readdirSync(dir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort().map((f) => path.join(dir, f)); }
  catch { return []; }
}

function writeStars(file) {
  const w = 1080, h = 3840, body = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) { body[i * 3] = 8; body[i * 3 + 1] = 7; body[i * 3 + 2] = 24; }
  let s = 0x5eed27;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const dot = (x, y, r, g, b) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 3; body[i] = r; body[i + 1] = g; body[i + 2] = b; };
  for (let n = 0; n < 520; n++) {
    const x = (rnd() * w) | 0, y = (rnd() * h) | 0, br = 160 + ((rnd() * 95) | 0);
    dot(x, y, br, Math.max(0, br - (rnd() > 0.85 ? 30 : 0)), Math.min(255, br + 28));
    if (br > 220) { dot(x - 1, y, br - 50, br - 50, br); dot(x + 1, y, br - 50, br - 50, br); dot(x, y - 1, br - 50, br - 50, br); dot(x, y + 1, br - 50, br - 50, br); }
  }
  fs.writeFileSync(file, Buffer.concat([Buffer.from('P6\n' + w + ' ' + h + '\n255\n'), body]));
}

function shapeSpoken(raw, file) {
  const robot = file.replace(/\.wav$/, '.robot.wav');
  ff(['-i', raw, '-af', ROBOT_AF, robot]);
  try { shapeVoice(robot, file, 'Verse'); } catch { fs.copyFileSync(robot, file); }
  return fs.existsSync(file) ? file : null;
}
function sayLocal(text, file) {
  const raw = file.replace(/\.wav$/, '.raw.wav');
  let ok = false;
  const model = process.env.PIPER_VOICE;
  if (model && fs.existsSync(model)) {
    const [cmd, ...args] = (process.env.PIPER || 'python3 -m piper').split(/\s+/).filter(Boolean);
    ok = run(cmd, [...args, '-m', model, '--length-scale', '1.08', '-f', raw], { input: text }).status === 0 && fs.existsSync(raw);
  }
  if (!ok && have('espeak-ng')) ok = run('espeak-ng', ['-v', 'en-us+m3', '-p', '18', '-s', '132', '-w', raw, text]).status === 0 && fs.existsSync(raw);
  return ok ? shapeSpoken(raw, file) : null;
}
async function sayLine(text, file) {
  const local = sayLocal(text, file);
  if (local) return local;
  try {
    const r = await fetch('https://a-to-mind.com/api/rapvoice?t=' + encodeURIComponent(String(text).slice(0, 280)), { signal: AbortSignal.timeout(20000) });
    if (!r.ok || !/audio/.test(r.headers.get('content-type') || '')) return null;
    const raw = file.replace(/\.wav$/, '.bin');
    fs.writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
    return shapeSpoken(raw, file);
  } catch { return null; }
}

const enc = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p'];
function pushClip(img, frames, out) {
  const z = '1+0.07*on/' + frames;
  ff(['-loop', '1', '-i', img, '-vf', "scale=2160:3840:force_original_aspect_ratio=increase,crop=2160:3840,zoompan=z='" + z + "':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=" + frames + ':s=' + W + 'x' + H + ':fps=' + FPS + ',format=yuv420p', '-frames:v', String(frames), ...enc, out]);
}
function starClip(ppm, frames, out) {
  ff(['-loop', '1', '-i', ppm, '-vf', "scale=1080:3840,zoompan=z='1.04':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*on/" + frames + "':d=" + frames + ':s=' + W + 'x' + H + ':fps=' + FPS + ',format=yuv420p', '-frames:v', String(frames), ...enc, out]);
}
function endClip(frames, out) {
  ff(['-f', 'lavfi', '-i', 'color=c=0x090814:s=' + W + 'x' + H + ':r=' + FPS, '-frames:v', String(frames), '-vf', 'drawbox=x=160:y=790:w=760:h=3:color=0xE8C872', ...enc, out]);
}
function splitClip(before, after, frames, box, out, beatDur) {
  const b = box || [0.1, 0.32, 0.8, 0.3];
  const probe = (f) => run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', f]).stdout.split(',').map(Number);
  const iw = probe(after)[0] || 1, ih = probe(after)[1] || 1, sh = Math.min(H, Math.round(540 * ih / iw)), top = Math.round((H - sh) / 2);
  const rw = Math.max(80, b[2] * 540), rh = Math.max(80, b[3] * sh);
  const cx = (540 + (b[0] + b[2] / 2) * 540).toFixed(1), cy = (top + (b[1] + b[3] * 0.32) * sh).toFixed(1);
  const zmax = Math.min(3.5, Math.max(1.8, Math.max(W / rw, (H * 0.72) / rh))).toFixed(2);
  const A = Math.round(beatDur * FPS * 0.22), B = Math.round(beatDur * FPS * 0.40), C = Math.round(beatDur * FPS * 0.72), E = Math.round(beatDur * FPS * 0.88);
  const ease = (p, q) => '(0.5-0.5*cos(3.1416*(on-' + p + ')/' + Math.max(1, q - p) + '))';
  const z = 'if(lt(on\\,' + A + ')\\,1\\,if(lt(on\\,' + B + ')\\,1+(' + zmax + '-1)*' + ease(A, B) + '\\,if(lt(on\\,' + C + ')\\,' + zmax + '\\,if(lt(on\\,' + E + ')\\,' + zmax + '-(' + zmax + '-1)*' + ease(C, E) + '\\,1))))';
  const blur = 'scale=540:' + H + ':force_original_aspect_ratio=increase,crop=540:' + H + ',boxblur=22:2,eq=brightness=-0.15,setsar=1,format=yuv420p';
  const sharp = 'scale=540:-1,setsar=1,format=yuv420p';
  const half = (i, B, S, o) => '[' + i + ':v]' + blur + B + ';[' + i + ':v]' + sharp + S + ';' + B + S + 'overlay=(W-w)/2:(H-h)/2' + o;
  const fc = half(0, '[Lb]', '[Ls]', '[L]') + ';' + half(1, '[Rb]', '[Rs]', '[R]') + ';[L][R]hstack=inputs=2,drawbox=x=538:y=0:w=4:h=' + H + ':color=0xE4C56A@0.9,scale=2160:3840:flags=lanczos,zoompan=z=\'' + z + '\':x=\'max(0\\,min(iw-iw/zoom\\,' + cx + '*2-iw/zoom/2))\':y=\'max(0\\,min(ih-ih/zoom\\,' + cy + '*2-ih/zoom/2))\':d=' + frames + ':s=' + W + 'x' + H + ':fps=' + FPS + ',format=yuv420p[v]';
  ff(['-loop', '1', '-i', before, '-loop', '1', '-i', after, '-filter_complex', fc, '-map', '[v]', '-frames:v', String(frames), '-r', String(FPS), ...enc, out]);
}

export async function renderEpisode(folder, outFile, { voice = true } = {}) {
  const script = parseScript(fs.readFileSync(path.join(folder, 'script.md'), 'utf8'));
  const issues = scriptIssues(script);
  if (issues.length) throw new Error(issues.join('; '));
  const before = shotsOf(path.join(folder, 'before')), after = shotsOf(path.join(folder, 'after'));
  if (!before.length || !after.length) throw new Error('need screenshots in before/ and after/');
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'glow-'));
  try {
    const lines = [script.hook, script.before, script.change, script.stars, script.after];
    const wavs = [];
    for (let i = 0; i < lines.length; i++) wavs.push(voice ? await sayLine(lines[i], path.join(dir, 'v' + i + '.wav')) : null);
    const plan = planEpisode(script, wavs.map((w) => (w ? dur(w) : 0)));
    if (plan.error) throw new Error(plan.error);
    const captions = captionsFor(script, plan.beats);
    const checked = captionCheck(captions);
    if (!checked.ok) throw new Error(checked.detail);
    const ppm = path.join(dir, 'stars.ppm'); writeStars(ppm);
    const framesOf = (i) => Math.ceil(+(plan.beats[i].d + (i < plan.beats.length - 1 ? XF : 0)).toFixed(3) * FPS - 1e-6);
    const clips = plan.beats.map((b, i) => {
      const frames = framesOf(i), file = path.join(dir, 'c' + i + '.mp4');
      if (b.id === 'stars') starClip(ppm, frames, file);
      else if (b.id === 'reveal') splitClip(before[0], after[0], frames, script.box, file, b.d);
      else if (b.id === 'end') endClip(frames, file);
      else pushClip(before[Math.min(i, before.length - 1)], frames, file);
      return file;
    });
    const esc = (s) => s.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, '\u2019');
    let chain = '', last = '[0:v]', off = 0;
    for (let i = 1; i < clips.length; i++) {
      off += plan.beats[i - 1].d;
      chain += last + '[' + i + ':v]xfade=transition=' + (plan.beats[i].id === 'reveal' ? 'wipeleft' : 'fade') + ':duration=' + XF + ':offset=' + off.toFixed(3) + '[x' + i + '];';
      last = '[x' + i + ']';
    }
    const draws = captions.map((c, i) => {
      const tf = path.join(dir, 't' + i + '.txt'); fs.writeFileSync(tf, c.text);
      return 'drawtext=fontfile=' + (c.font || BODY) + ':textfile=' + esc(tf) + ':fontsize=' + c.size + ':fontcolor=white:shadowcolor=black@0.75:shadowx=0:shadowy=3:line_spacing=18:x=' + c.x + ':y=' + c.y + ":enable='between(t\\," + c.from + '\\,' + c.to + ")'";
    }).join(',');
    chain += last + draws + ',format=yuv420p[vout]';
    const T = plan.total;
    const args = clips.flatMap((c) => ['-i', c]);
    const bed = "aevalsrc='" + padExpr('calm') + "':s=48000:d=" + T + ',lowpass=f=1600,afade=t=in:d=0.5,afade=t=out:st=' + (T - 1.1).toFixed(2) + ':d=1.1,aformat=channel_layouts=stereo,loudnorm=I=' + BED_LUFS + ':TP=-6:LRA=5';
    args.push('-f', 'lavfi', '-i', bed);
    const voiced = wavs.map((w, i) => (w ? { w, i } : null)).filter(Boolean);
    voiced.forEach((v) => args.push('-i', v.w));
    const bedI = clips.length;
    if (voiced.length) {
      const parts = voiced.map((v, k) => '[' + (bedI + 1 + k) + ':a]aresample=48000,aformat=channel_layouts=stereo,adelay=' + Math.round((plan.beats[v.i].from + 0.16) * 1000) + '|' + Math.round((plan.beats[v.i].from + 0.16) * 1000) + ',apad,atrim=duration=' + T + '[va' + k + ']');
      const mix = parts.join(';') + ';' + voiced.map((_, k) => '[va' + k + ']').join('') + 'amix=inputs=' + voiced.length + ':normalize=0:duration=first,asplit[vo][sc];[' + bedI + ':a][sc]sidechaincompress=threshold=0.03:ratio=8:release=300[duck];[vo][duck]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=7[aout]';
      args.push('-filter_complex', chain + ';' + mix, '-map', '[vout]', '-map', '[aout]');
    } else args.push('-filter_complex', chain, '-map', '[vout]', '-map', bedI + ':a');
    fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
    args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-t', String(T), path.resolve(outFile));
    ff(args);
    return { file: path.resolve(outFile), total: T, voice: voiced.length === lines.length, captions: captions.length, highlight: script.highlight };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : ''; };
  const folder = process.argv[3];
  if (process.argv[2] !== 'render' || !folder) { console.error('usage: node tools/beauty-vlog.mjs render <folder> [--out film.mp4]'); process.exit(2); }
  const meta = await renderEpisode(path.resolve(folder), arg('--out') || path.join(folder, 'glow.mp4'), { voice: !process.argv.includes('--no-voice') });
  console.log(meta.total.toFixed(1) + 's ' + (meta.voice ? 'voiced ' : 'silent ') + meta.captions + ' captions ' + meta.file);
}
