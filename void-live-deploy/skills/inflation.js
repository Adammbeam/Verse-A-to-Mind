export const CPI_U = {
  1913: 9.9, 1914: 10.0, 1915: 10.1, 1916: 10.9, 1917: 12.8, 1918: 15.1, 1919: 17.3, 1920: 20.0,
  1921: 17.9, 1922: 16.8, 1923: 17.1, 1924: 17.1, 1925: 17.5, 1926: 17.7, 1927: 17.4, 1928: 17.1,
  1929: 17.1, 1930: 16.7, 1931: 15.2, 1932: 13.7, 1933: 13.0, 1934: 13.4, 1935: 13.7, 1936: 13.9,
  1937: 14.4, 1938: 14.1, 1939: 13.9, 1940: 14.0, 1941: 14.7, 1942: 16.3, 1943: 17.3, 1944: 17.6,
  1945: 18.0, 1946: 19.5, 1947: 22.3, 1948: 24.1, 1949: 23.8, 1950: 24.1, 1951: 26.0, 1952: 26.5,
  1953: 26.7, 1954: 26.9, 1955: 26.8, 1956: 27.2, 1957: 28.1, 1958: 28.9, 1959: 29.1, 1960: 29.6,
  1961: 29.9, 1962: 30.2, 1963: 30.6, 1964: 31.0, 1965: 31.5, 1966: 32.4, 1967: 33.4, 1968: 34.8,
  1969: 36.7, 1970: 38.8, 1971: 40.5, 1972: 41.8, 1973: 44.4, 1974: 49.3, 1975: 53.8, 1976: 56.9,
  1977: 60.6, 1978: 65.2, 1979: 72.6, 1980: 82.4, 1981: 90.9, 1982: 96.5, 1983: 99.6, 1984: 103.9,
  1985: 107.6, 1986: 109.6, 1987: 113.6, 1988: 118.3, 1989: 124.0, 1990: 130.7, 1991: 136.2,
  1992: 140.3, 1993: 144.5, 1994: 148.2, 1995: 152.4, 1996: 156.9, 1997: 160.5, 1998: 163.0,
  1999: 166.6, 2000: 172.2, 2001: 177.1, 2002: 179.9, 2003: 184.0, 2004: 188.9, 2005: 195.3,
  2006: 201.6, 2007: 207.3, 2008: 215.3, 2009: 214.5, 2010: 218.1, 2011: 224.9, 2012: 229.6,
  2013: 233.0, 2014: 236.7, 2015: 237.0, 2016: 240.0, 2017: 245.1, 2018: 251.1, 2019: 255.7,
  2020: 258.8, 2021: 271.0, 2022: 292.7, 2023: 304.7, 2024: 313.7, 2025: 321.5,
};

export const LATEST_YEAR = 2025;
export const FIRST_YEAR = 1913;

export function inflationAsk(text) {
  const t = String(text || '').trim().toLowerCase().replace(/[?!.]+$/, '').replace(/\s+/g, ' ');
  if (!t || t.length > 80) return null;
  if (/^(?:what is|define|why does|explain|causes of)\b/.test(t)) return null;
  if (/\b(cosmic|universe|balloon|tire|tyre)\b/.test(t)) return null;

  if (/^(?:open\s+)?(?:a\s+|the\s+)?inflation\s+(?:calculator|chart|tool)$/.test(t)) {
    return { amount: 100, from: 1990, to: LATEST_YEAR };
  }

  let m = t.match(/(?:inflation\s+(?:calculator\s+)?|worth\s+|value\s+of\s+)?\$?(\d[\d,]*(?:\.\d+)?)\s+(?:dollars?\s+)?(?:in|from)\s+(19\d{2}|20[0-2]\d)(?:\s+(?:to|in|until|vs)\s+(19\d{2}|20[0-2]\d|today|now))?/);
  if (m && (/inflation|worth|value|buying power|purchasing power|today|in\s+20/.test(t) || /^\$?\d/.test(t))) {
    const amount = parseFloat(m[1].replace(/,/g, ''));
    const from = Math.min(LATEST_YEAR, Math.max(FIRST_YEAR, +m[2]));
    const to = m[3] && /^\d{4}$/.test(m[3]) ? Math.min(LATEST_YEAR, Math.max(FIRST_YEAR, +m[3])) : LATEST_YEAR;
    if (Number.isFinite(amount) && amount >= 0 && CPI_U[from] && CPI_U[to]) {
      return { amount, from, to };
    }
  }

  m = t.match(/inflation\s+(?:rate\s+)?(?:from|between)\s+(19\d{2}|20[0-2]\d)\s+(?:to|and)\s+(19\d{2}|20[0-2]\d|today|now)/);
  if (m) {
    const from = Math.min(LATEST_YEAR, Math.max(FIRST_YEAR, +m[1]));
    const to = /^\d{4}$/.test(m[2]) ? Math.min(LATEST_YEAR, Math.max(FIRST_YEAR, +m[2])) : LATEST_YEAR;
    if (CPI_U[from] && CPI_U[to]) return { amount: 100, from, to };
  }

  return null;
}

export function adjustInflation(amount, from, to) {
  const a = CPI_U[from], b = CPI_U[to];
  if (!a || !b || !Number.isFinite(amount)) return null;
  const adjusted = amount * (b / a);
  const pct = ((b - a) / a) * 100;
  return { adjusted, pct, cpiFrom: a, cpiTo: b };
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);

function run(text, api) {
  const q = inflationAsk(text);
  if (!q) return 'none';

  const years = Object.keys(CPI_U).map(Number).sort((a, b) => b - a);
  const el = api.showPage((p) => {
    const opts = (sel) => years.map((y) => `<option value="${y}"${y === sel ? ' selected' : ''}>${y}</option>`).join('');
    p.innerHTML = '<h2>US inflation calculator</h2>'
      + '<div id="inf-big" style="font-size:36px;font-weight:300;line-height:1.15;margin:6px 0 4px"></div>'
      + '<p id="inf-sub" class="sub" style="margin:0 0 10px"></p>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:8px 0">'
      + '<input id="inf-amt" type="number" step="any" min="0" value="' + esc(q.amount) + '" aria-label="Amount in dollars" style="width:110px;padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:inherit;font:inherit">'
      + '<select id="inf-from" aria-label="Start year" style="padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:inherit;font:inherit">' + opts(q.from) + '</select>'
      + '<span>to</span>'
      + '<select id="inf-to" aria-label="End year" style="padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:inherit;font:inherit">' + opts(q.to) + '</select>'
      + '</div>'
      + '<div class="src">US Bureau of Labor Statistics CPI-U annual averages (1982–84 = 100, 1913–2025)</div>';
  });

  const amtEl = el && el.querySelector && el.querySelector('#inf-amt');
  const fromEl = el && el.querySelector && el.querySelector('#inf-from');
  const toEl = el && el.querySelector && el.querySelector('#inf-to');
  const bigEl = el && el.querySelector && el.querySelector('#inf-big');
  const subEl = el && el.querySelector && el.querySelector('#inf-sub');
  if (!amtEl || !fromEl || !toEl || !bigEl || !subEl) return 'inflation';

  const update = () => {
    const amt = parseFloat(amtEl.value);
    const from = +fromEl.value, to = +toEl.value;
    const res = adjustInflation(Number.isFinite(amt) && amt >= 0 ? amt : 0, from, to);
    if (!res) return;
    bigEl.textContent = money(res.adjusted);
    const sign = res.pct >= 0 ? '+' : '';
    subEl.textContent = `${money(Number.isFinite(amt) && amt >= 0 ? amt : 0)} in ${from} equals ${money(res.adjusted)} in ${to} (${sign}${res.pct.toFixed(1)}% · CPI ${res.cpiFrom} → ${res.cpiTo})`;
  };

  amtEl.addEventListener('input', update);
  fromEl.addEventListener('change', update);
  toEl.addEventListener('change', update);
  update();
  return 'inflation';
}

export default {
  name: 'inflation',
  examples: ['inflation calculator 100 in 1990', '$100 in 1980 today', 'inflation from 1995 to 2020', 'inflation calculator'],
  nearMisses: ['what is inflation', 'cosmic inflation theory', 'why does inflation happen', 'tire inflation pressure'],
  match(lower, text) { return !!inflationAsk(text || lower); },
  run,
};
