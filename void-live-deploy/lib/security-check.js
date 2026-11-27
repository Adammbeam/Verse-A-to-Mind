// A public safety check of one site a visitor names (functions/api/security-check.js, /security/check/).
// Bare public hostname only. Private addresses, IP numbers, and odd ports are refused before a request. Redirects are checked again.

export const DOH = 'https://cloudflare-dns.com/dns-query';
export const TIMEOUT_MS = 4000, MAX_HOPS = 3, TXT_CAP = 16000;
const BAD = /\.(?:local|localhost|localdomain|internal|intranet|lan|home|corp|private|invalid|onion|arpa|example|test)$/i;
const BLOCKED = new Set(['localhost', 'metadata', 'metadata.google.internal', 'metadata.google.com', 'metadata.goog']);
const SIX_MONTHS = 15552000;
const UA = 'VerseCheck/1.0 (+https://a-to-mind.com/security/check/)';

export const ITEMS = Object.freeze([
  { id: 'https', name: 'The site answers on HTTPS', means: 'Browsers can open the site on an encrypted address.', fix: 'Serve the site on https and keep that address working.' },
  { id: 'http', name: 'Plain HTTP sends people to HTTPS', means: 'Anyone who types the old http address is sent to the encrypted one.', fix: 'Answer http with a redirect to the same page on https, and do not serve the page over plain HTTP.' },
  { id: 'tls', name: 'The connection is encrypted', means: 'The server completed a TLS handshake, so the page was not sent in the clear.', fix: 'Turn on a certificate from a public authority and serve TLS on port 443.' },
  { id: 'hsts', name: 'Browsers are told to stay on HTTPS', means: 'HSTS asks browsers to remember that this site is HTTPS only, so they do not try plain HTTP later.', fix: 'Send a Strict-Transport-Security header with a max-age of at least six months.' },
  { id: 'csp', name: 'A content policy is set', means: 'Content-Security-Policy tells the browser which scripts, frames and other pieces the page may load.', fix: 'Send a Content-Security-Policy header. A report-only policy only watches; it does not block anything.' },
  { id: 'nosniff', name: 'Browsers are told not to guess file types', means: 'X-Content-Type-Options: nosniff stops a browser from treating a file as a script or a page when the server said it was something else.', fix: 'Send the header X-Content-Type-Options with the value nosniff.' },
  { id: 'frame', name: 'Other sites cannot frame this page', means: 'Frame protection stops another site from putting this page inside a frame and tricking a click.', fix: "Send Content-Security-Policy with frame-ancestors 'none' or 'self', or send X-Frame-Options: DENY or SAMEORIGIN." },
  { id: 'referrer', name: 'The site limits what the next site learns', means: 'Referrer-Policy decides how much of the address is sent when someone follows a link away.', fix: 'Send Referrer-Policy: strict-origin-when-cross-origin, or no-referrer.' },
  { id: 'cookies', name: 'Cookies on the homepage are locked down', means: 'Secure means a cookie is only sent on HTTPS, HttpOnly keeps it out of page scripts, and SameSite limits which sites send it back.', fix: 'Set Secure, HttpOnly and SameSite on every cookie the homepage sends.' },
  { id: 'securitytxt', name: 'A security contact is published', means: 'security.txt is a small file that tells a researcher how to report a hole.', fix: 'Publish /.well-known/security.txt with a Contact line and an Expires date that is still in the future.' },
  { id: 'spf', name: 'Mail servers can see who may send as this domain', means: 'SPF is a DNS text record that lists the servers allowed to send mail for the domain.', fix: 'Publish one TXT record that starts with v=spf1 and ends with -all or ~all. +all means anyone may send.' },
  { id: 'dmarc', name: 'Forged mail can be refused', means: 'DMARC tells receiving mail servers what to do when a message fails the sender check.', fix: 'Publish a TXT record at _dmarc for this domain, starting with v=DMARC1, and set p=quarantine or p=reject. p=none only watches.' },
]);
const row = (id, state, detail) => { const x = ITEMS.find((i) => i.id === id); return { id, name: x.name, state, detail, means: x.means, fix: x.fix }; };
export const normalizeHost = (raw) => String(raw || '').trim().toLowerCase().replace(/\.$/, '');
/** an IPv4 shorthand, a hex or decimal whole address, a dotted address, or an IPv6 literal. Pure. */
export function looksLikeIp(s) { const h = String(s || '').trim().toLowerCase(); if (!h) return false; if (h.startsWith('[') && h.endsWith(']')) return true;
if (/^[0-9a-f:]+$/.test(h) && h.includes(':')) return true; if (/^\d+$/.test(h) || /^0x[0-9a-f]+$/.test(h)) return true;
const parts = h.split('.'); return parts.length >= 2 && parts.length <= 4 && parts.every((p) => /^(?:0x[0-9a-f]+|\d+)$/.test(p)); }
/** why this input is not a bare public hostname, or '' when it is. Pure. */
export function whyNotHost(raw) { const s = normalizeHost(raw); if (!s) return 'Type a domain, like your-site.com.';
if (s.length > 253 || /[\u0000-\u0020\u007f]/.test(String(raw || ''))) return 'Type only the domain, with no address, path or port.';
if (looksLikeIp(s) || looksLikeIp(String(raw || '').trim())) return 'IP addresses are not checked here.'; if (/[/:?#\\@:]/.test(s) || s.includes('://')) return 'Type only the domain, with no address, path or port.';
if (BLOCKED.has(s) || BAD.test(s)) return 'That name is not a public site.'; if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(s)) return 'That is not a public domain name.';
return /^[a-z]{2,24}$/.test(s.split('.').pop()) ? '' : 'That is not a public domain name.'; }
/** four numbers 0-255, or null. Pure. */
export function ipv4Parts(ip) { const p = String(ip || '').split('.'); if (p.length !== 4 || p.some((x) => !/^\d{1,3}$/.test(x) || Number(x) > 255)) return null; return p.map(Number); }
function expandV6(s) { let t = String(s || '').trim().toLowerCase(); const mixed = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(t);
if (mixed) { const p = ipv4Parts(mixed[2]); if (!p) return ''; const hex = p.map((n) => n.toString(16).padStart(2, '0')); t = mixed[1] + hex[0] + hex[1] + ':' + hex[2] + hex[3]; }
const halves = t.split('::'); if (halves.length > 2) return ''; const head = halves[0] ? halves[0].split(':') : [], tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
if (halves.length === 1 && head.length !== 8) return ''; const missing = 8 - head.length - tail.length; if (missing < 0) return '';
const full = [...head, ...Array(missing).fill('0'), ...tail]; if (full.length !== 8 || full.some((x) => !/^[0-9a-f]{1,4}$/.test(x))) return ''; return full.map((x) => x.padStart(4, '0')).join(':'); }
/** true when an address is not a public unicast address Verse may open. Unreadable addresses count as not public. Pure. */
export function isPrivateIp(ip) { const s = String(ip || '').trim().toLowerCase(); if (!s) return true; if (s.includes(':')) {
const full = expandV6(s); if (!full || full === '0000:0000:0000:0000:0000:0000:0000:0000' || full === '0000:0000:0000:0000:0000:0000:0000:0001') return true; if (full.startsWith('0000:0000:0000:0000:0000:ffff:')) {
const g = full.split(':'), hi = parseInt(g[6], 16), lo = parseInt(g[7], 16); return isPrivateIp([(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255].join('.')); } const head = parseInt(full.slice(0, 4), 16);
if ((head & 0xfe00) === 0xfc00 || (head & 0xffc0) === 0xfe80 || (head & 0xffc0) === 0xfec0 || (head & 0xff00) === 0xff00 || full.startsWith('2001:0db8')) return true; return !(head >= 0x2000 && head <= 0x3fff); }
const n = ipv4Parts(s); if (!n) return true; const [a, b, c] = n; if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
if (a === 100 && b >= 64 && b <= 127) return true; if (a === 169 && b === 254) return true;
if (a === 172 && b >= 16 && b <= 31) return true; if (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) return true;
if (a === 198 && (b === 18 || b === 19)) return true; if (a === 198 && b === 51 && c === 100) return true; return a === 203 && b === 0 && c === 113; }
/** why a web address may not be opened. Pure. */
export function whyNotWeb(raw, { https = true } = {}) { let u; try { u = new URL(String(raw || '')); } catch (_) { return 'not an address'; } if (u.username || u.password) return 'no sign-in in the address';
const port = https ? '443' : (u.protocol === 'https:' ? '443' : '80'); if (https ? u.protocol !== 'https:' : u.protocol !== 'https:' && u.protocol !== 'http:') return https ? 'only https' : 'not a web address';
if (u.port && u.port !== port) return 'only the standard port'; return whyNotHost(u.hostname); }
/** one quoted or bare DNS TXT value. Pure. */
export function txtValue(data) { const s = String(data == null ? '' : data).trim(); const parts = [...s.matchAll(/"((?:\\.|[^"\\])*)"/g)].map((m) => m[1].replace(/\\"/g, '"'));
return (parts.length ? parts.join('') : s).replace(/\s+/g, ' ').trim(); }
export function cookieLines(headers) { if (!headers) return []; if (typeof headers.getSetCookie === 'function') return headers.getSetCookie().map((s) => String(s || '').trim()).filter(Boolean);
const one = typeof headers.get === 'function' ? headers.get('set-cookie') : ''; return one ? [String(one)] : []; }
const getH = (headers) => (name) => (!headers || typeof headers.get !== 'function' ? '' : String(headers.get(name) || '').trim());
const days = (s) => { const d = Math.round(Number(s) / 86400); return d === 1 ? '1 day' : d + ' days'; };
export function judgeHeaders(headers) { const get = getH(headers), hsts = get('strict-transport-security'), age = /(?:^|;)\s*max-age\s*=\s*(\d+)/i.exec(hsts), max = age ? Number(age[1]) : 0;
const csp = get('content-security-policy'), report = get('content-security-policy-report-only'); const xfo = get('x-frame-options').split(',')[0].trim().toLowerCase();
const fa = /(?:^|;)\s*frame-ancestors\s+([^;]+)/i.exec(csp), ancestors = fa ? fa[1].trim().toLowerCase().split(/\s+/) : []; const ref = get('referrer-policy').split(',')[0].trim().toLowerCase();
const goodRef = new Set(['no-referrer', 'same-origin', 'strict-origin', 'strict-origin-when-cross-origin', 'no-referrer-when-downgrade']); const weakRef = new Set(['origin', 'origin-when-cross-origin']); return [
!hsts || !age || max <= 0 ? row('hsts', 'fail', 'No HSTS header was sent, so a browser may still try plain HTTP later.') : max < SIX_MONTHS ? row('hsts', 'warn', 'HSTS is set, but browsers are asked to remember it for only ' + days(max) + '. Six months is the usual span.') : row('hsts', 'pass', 'Browsers are told to stay on HTTPS for ' + days(max) + '.'),
csp ? row('csp', 'pass', 'A content policy is set on the homepage.') : report ? row('csp', 'warn', 'Only a report-only content policy is set, so the browser watches and does not block.') : row('csp', 'fail', 'No content policy was sent.'),
get('x-content-type-options').split(',')[0].trim().toLowerCase() === 'nosniff' ? row('nosniff', 'pass', 'The homepage sends X-Content-Type-Options: nosniff.') : row('nosniff', 'fail', 'The homepage does not send X-Content-Type-Options: nosniff.'),
xfo === 'deny' || xfo === 'sameorigin' || (ancestors.length && !ancestors.includes('*')) ? row('frame', 'pass', xfo === 'deny' || xfo === 'sameorigin' ? 'X-Frame-Options is ' + xfo.toUpperCase() + '.' : 'The content policy limits who may frame the page.') : row('frame', 'fail', 'Nothing stops another site from putting this page in a frame.'),
goodRef.has(ref) ? row('referrer', 'pass', 'Referrer-Policy is ' + ref + '.') : weakRef.has(ref) ? row('referrer', 'warn', 'Referrer-Policy is ' + ref + ', so the site name still goes out with every link.') : row('referrer', 'fail', ref ? 'Referrer-Policy is ' + ref + ', which sends the full address.' : 'No Referrer-Policy was sent.'),
]; }
/** cookie flags. Names only: the values are never repeated. Pure. */
export function judgeCookies(lines) { const list = (lines || []).map((s) => String(s || '').trim()).filter(Boolean); if (!list.length) return row('cookies', 'pass', 'The homepage set no cookies.');
const bad = []; let sameOnly = true; for (const line of list) { const name = (line.split('=')[0] || '').trim().replace(/[^\w.-]/g, '').slice(0, 40) || 'a cookie', miss = [];
if (!/(?:^|;)\s*secure\s*(?:;|$)/i.test(line)) miss.push('Secure'); if (!/(?:^|;)\s*httponly\s*(?:;|$)/i.test(line)) miss.push('HttpOnly');
if (!/(?:^|;)\s*samesite\s*=\s*(?:strict|lax|none)\b/i.test(line)) miss.push('SameSite'); if (miss.length) { if (miss.some((m) => m !== 'SameSite')) sameOnly = false; bad.push(name + ' is missing ' + miss.join(', ')); }
} if (!bad.length) return row('cookies', 'pass', (list.length === 1 ? 'The cookie has' : 'All ' + list.length + ' cookies have') + ' Secure, HttpOnly and SameSite.');
return row('cookies', sameOnly ? 'warn' : 'fail', bad.slice(0, 4).join('. ') + (bad.length > 4 ? '. And ' + (bad.length - 4) + ' more.' : '.')); }
/** security.txt body. The contact address is not repeated. Pure. */
export function judgeSecurityTxt(status, body, why) { if (why) return row('securitytxt', 'fail', why);
const text = String(body || ''); if (status !== 200) return row('securitytxt', 'fail', 'No security.txt was published.');
if (/<html[\s>]/i.test(text.slice(0, 800)) || text.includes('\0')) return row('securitytxt', 'fail', 'The security.txt address returned a web page, not a contact file.');
const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const contact = lines.some((l) => /^contact:\s+\S+/i.test(l)), exp = lines.find((l) => /^expires:\s*/i.test(l)), when = exp ? Date.parse(exp.replace(/^expires:\s*/i, '')) : NaN;
if (!contact) return row('securitytxt', 'fail', 'A file is there, but it has no Contact line.');
if (!exp || !Number.isFinite(when)) return row('securitytxt', 'warn', 'A contact is published, but the file has no expiry date.');
if (when < Date.now()) return row('securitytxt', 'fail', 'A contact is published, but the expiry date has passed.');
if (when - Date.now() < 7 * 864e5) return row('securitytxt', 'warn', 'A contact is published, and the expiry date is within a week.');
return row('securitytxt', 'pass', 'A contact and an expiry date in the future are published.'); }
export function judgeSpf(records) { const spf = (records || []).map(txtValue).filter((r) => /^v=spf1(\s|$)/i.test(r)); if (!spf.length) return row('spf', 'fail', 'No SPF record was published.');
if (spf.length > 1) return row('spf', 'warn', 'More than one SPF record was published. Mail servers may ignore them. Keep a single record.');
const r = spf[0].trim(); if (/\+all$/i.test(r)) return row('spf', 'fail', 'The SPF record ends with +all, so anyone may send mail as this domain.');
if (/-all$/i.test(r)) return row('spf', 'pass', 'One SPF record is published and it ends with -all.'); if (/~all$/i.test(r)) return row('spf', 'pass', 'One SPF record is published and it ends with ~all.');
return row('spf', 'warn', 'An SPF record is published, but it does not end with -all or ~all.'); }
export function judgeDmarc(records) { const rows = (records || []).map(txtValue).filter((r) => /^v=DMARC1(\s|;|$)/i.test(r)); if (!rows.length) return row('dmarc', 'fail', 'No DMARC record was published at _dmarc.');
const pol = /(?:^|;)\s*p\s*=\s*(reject|quarantine|none)\b/i.exec(rows[0]); if (!pol) return row('dmarc', 'fail', 'A DMARC record is published, but it names no policy.');
const p = pol[1].toLowerCase(); if (p === 'none') return row('dmarc', 'warn', 'DMARC is set to p=none, so forged mail is watched and still delivered.');
return row('dmarc', 'pass', 'DMARC tells receivers to ' + (p === 'reject' ? 'reject' : 'quarantine') + ' mail that fails the check.'); }
function judgeHttp(http) { if (!http || http.error) return row('http', 'fail', 'Plain HTTP did not answer.');
if (http.status >= 300 && http.status < 400) return whyNotWeb(http.location, { https: true }) ? row('http', 'fail', 'HTTP redirected somewhere other than a normal HTTPS address.') : row('http', 'pass', 'HTTP sends browsers to an HTTPS address.');
if (http.status >= 200 && http.status < 300) return row('http', 'fail', 'The plain HTTP page answered instead of sending browsers to HTTPS.');
return row('http', 'fail', 'Plain HTTP answered ' + http.status + ' and did not redirect to HTTPS.'); }
/** the plain-words scorecard. Pure. */
export function scorecard({ host, at, https, http, txt, spf, dmarc }) { const items = [
!https || !https.tls ? row('https', 'fail', (https && https.why) || 'The site did not answer on HTTPS.') : https.stopped ? row('https', 'fail', https.why || 'The site redirected somewhere Verse will not open.') : https.status >= 500 ? row('https', 'warn', 'The server answered ' + https.status + ' over HTTPS, which is an error.') : https.status >= 400 ? row('https', 'warn', 'The server answered ' + https.status + ' over HTTPS.') : row('https', 'pass', 'The homepage answered ' + https.status + ' on HTTPS.'),
judgeHttp(http),
https && https.tls ? row('tls', 'pass', https.stopped ? 'The server spoke TLS, then sent Verse somewhere it will not open.' : 'The server completed a TLS handshake.') : row('tls', 'fail', 'Verse could not open an encrypted connection to this site.'),
...judgeHeaders(https && https.headers), judgeCookies(https && https.cookies), judgeSecurityTxt(txt && txt.status, txt && txt.body, txt && txt.why), judgeSpf(spf), judgeDmarc(dmarc), ];
const n = (s) => items.filter((r) => r.state === s).length;
return { host, at: at || new Date().toISOString(), summary: n('pass') + ' in place, ' + n('warn') + ' weak, ' + n('fail') + ' missing.', inPlace: n('pass'), weak: n('warn'), missing: n('fail'), items }; }
function abort(ms) { if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; }
async function dnsLookup(name, type, fetchImpl) {
const res = await fetchImpl(DOH + '?name=' + encodeURIComponent(name) + '&type=' + type, { redirect: 'manual', signal: abort(TIMEOUT_MS), headers: { accept: 'application/dns-json' } });
if (!res || res.status !== 200) return null; const text = await res.text(); try { return JSON.parse(text.length > 100000 ? text.slice(0, 100000) : text); } catch (_) { return null; } }
/** public addresses for a hostname. Refuses if any address is not public. */
export async function resolvePublic(name, fetchImpl, depth = 0) { if (whyNotHost(name)) return { ok: false, status: 400, why: 'That name is not a public site.' };
if (depth > 3) return { ok: false, status: 400, why: 'That name did not resolve to a public address.' };
let a, aaaa; try { [a, aaaa] = await Promise.all([dnsLookup(name, 'A', fetchImpl), dnsLookup(name, 'AAAA', fetchImpl)]); }
catch (_) { return { ok: false, status: 502, why: 'The address check did not answer just now. Nothing was opened.' }; }
if (!a && !aaaa) return { ok: false, status: 502, why: 'The address check did not answer just now. Nothing was opened.' }; const answers = [...((a && a.Answer) || []), ...((aaaa && aaaa.Answer) || [])], ips = [];
let cname = ''; for (const rec of answers) { const type = Number(rec && rec.type), data = String((rec && rec.data) || '').replace(/\.$/, '');
if (type === 1 || type === 28) ips.push(data); else if (type === 5 && data) cname = data; } if (!ips.length && cname) return resolvePublic(cname, fetchImpl, depth + 1);
if (!ips.length) return { ok: false, status: 404, why: 'No public address was found for that name.' };
if (ips.some(isPrivateIp)) return { ok: false, status: 400, why: 'That name points at a private network, so Verse will not open it.' }; return { ok: true }; }
async function openOnce(url, fetchImpl) { return fetchImpl(url, { redirect: 'manual', signal: abort(TIMEOUT_MS), headers: { accept: 'text/html,application/xhtml+xml,text/plain,*/*;q=0.1', 'user-agent': UA } }); }
async function readHomepage(host, fetchImpl, known) { let url = 'https://' + host + '/', tls = false; const seen = new Set(known || [host]); for (let hop = 0; hop <= MAX_HOPS; hop++) {
if (whyNotWeb(url, { https: true })) return { tls, stopped: true, why: 'The site redirected somewhere Verse will not open.', headers: null, cookies: [] }; const next = new URL(url).hostname;
if (!seen.has(next)) { const dns = await resolvePublic(next, fetchImpl); if (!dns.ok) return { tls, stopped: true, why: 'The site redirected toward a private or unknown address, so Verse stopped.', headers: null, cookies: [] }; seen.add(next); }
let res; try { res = await openOnce(url, fetchImpl); } catch (_) { return { tls, stopped: false, why: tls ? 'The site stopped answering.' : 'The site did not answer on HTTPS.', headers: null, cookies: [] }; }
tls = true; if (res.status >= 300 && res.status < 400) { const loc = res.headers.get('location'); try { if (res.body && res.body.cancel) await res.body.cancel(); } catch (_) {}
if (!loc) return { tls, stopped: true, why: 'The site redirected nowhere.', headers: null, cookies: [] };
try { url = new URL(loc, url).href; } catch (_) { return { tls, stopped: true, why: 'The site redirected to a bad address.', headers: null, cookies: [] }; }
continue; } try { if (res.body && res.body.cancel) await res.body.cancel(); } catch (_) {} return { tls, stopped: false, status: res.status, headers: res.headers, cookies: cookieLines(res.headers) };
} return { tls, stopped: true, why: 'The site redirected too many times.', headers: null, cookies: [] }; }
async function readHttp(host, fetchImpl) { let res; try { res = await openOnce('http://' + host + '/', fetchImpl); } catch (_) { return { error: true }; }
try { if (res.body && res.body.cancel) await res.body.cancel(); } catch (_) {} let location = '';
if (res.status >= 300 && res.status < 400) { try { location = new URL(res.headers.get('location') || '', 'http://' + host + '/').href; } catch (_) { location = ''; } } return { status: res.status, location }; }
async function readSecurityFile(host, fetchImpl, known) { let last = { status: 0, body: '' }; for (const path of ['/.well-known/security.txt', '/security.txt']) { let url = 'https://' + host + path;
for (let hop = 0; hop <= MAX_HOPS; hop++) { if (whyNotWeb(url, { https: true })) return { status: 0, body: '', why: 'The contact file redirected somewhere Verse will not open.' }; const next = new URL(url).hostname;
if (next !== host && !(known && known.has(next))) { const dns = await resolvePublic(next, fetchImpl); if (!dns.ok) return { status: 0, body: '', why: 'The contact file redirected toward a private or unknown address, so Verse stopped.' }; }
let res; try { res = await openOnce(url, fetchImpl); } catch (_) { return last.status ? last : { status: 0, body: '' }; } if (res.status >= 300 && res.status < 400) {
const loc = res.headers.get('location'); try { if (res.body && res.body.cancel) await res.body.cancel(); } catch (_) {} if (!loc) break; try { url = new URL(loc, url).href; } catch (_) { break; } continue;
} last = { status: res.status, body: res.status === 200 ? (await res.text()).slice(0, TXT_CAP) : '' }; if (res.status === 200) return last; break; } if (last.status === 200) return last;
if (last.status && last.status !== 404 && last.status !== 410) return last; } return last.status ? last : { status: 404, body: '' }; }
async function readTxt(name, fetchImpl) { let json; try { json = await dnsLookup(name, 'TXT', fetchImpl); } catch (_) { return []; } if (!json || !Array.isArray(json.Answer)) return [];
return json.Answer.filter((rec) => Number(rec.type) === 16).map((rec) => txtValue(rec.data)).filter(Boolean); }
/** Check one bare hostname. A refused name never calls fetchImpl. */
export async function inspectHost(raw, fetchImpl = fetch) { const why = whyNotHost(raw); if (why) return { ok: false, status: 400, why };
const host = normalizeHost(raw), dns = await resolvePublic(host, fetchImpl); if (!dns.ok) return dns; const known = new Set([host]); const [https, http, txt, spf, dmarc] = await Promise.all([
readHomepage(host, fetchImpl, known), readHttp(host, fetchImpl), readSecurityFile(host, fetchImpl, known), readTxt(host, fetchImpl), readTxt('_dmarc.' + host, fetchImpl),
]); return { ok: true, status: 200, card: scorecard({ host, https, http, txt, spf, dmarc }) }; }
