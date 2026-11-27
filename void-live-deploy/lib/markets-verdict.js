// A plain reading of one ticker from the daily closes the quote already has: Buy, Sell, or Watch.
// Every reason names a number that was measured (the recent move, the 50- and 200-session averages, the usual daily move,
// where the price sits in the last year, and a trailing price-to-earnings figure only when a filing gives earnings).
// When there are not enough closes, or the filings do not answer, the reading says so. It never fills a gap with a guess.
// This is a reading of the past. It is not financial advice, a forecast, or an order. Pure: no network, no clock.
import { fmtPrice } from './markets.js';

export const VERDICT_DISCLAIMER = 'Not financial advice. This is a reading of past prices, and of past earnings only when a free filing answered. It does not say what the price will do next. Verse does not trade and does not hold your money.';
export const NEED = 50; // sessions before a 50-session average, a recent move and a usual daily move can all be measured
export const SMA_SHORT = 50;
export const SMA_LONG = 200;
export const TREND_LONG = 63; // about three months of sessions
export const TREND_SHORT = 21; // about one month of sessions
export const VOL_N = 60;
export const TREND_BAND = 8; // percent: a move inside this is too small to call up or down
export const VOL_WILD = 2.5; // percent: usual daily move above this keeps the reading a Watch
export const NEAR_HIGH = 3; // percent under the 52-week high: too close to call Buy
export const NEAR_LOW = 8; // percent over the 52-week low: too close to call Sell
export const PE_CHEAP = 15;
export const PE_RICH = 35;
const DAY = 86400000;
const YEAR = 366 * DAY;

const pct1 = (n) => Math.abs(n).toFixed(1) + '%';
const way = (n) => (n >= 0 ? 'up ' : 'down ') + pct1(n);
const avg = (rows, n) => {
  if (rows.length < n) return null;
  let s = 0;
  for (let i = rows.length - n; i < rows.length; i++) s += rows[i].c;
  return s / n;
};
/** percent change from the close `sessions` ago to `price`, or null when that close is not in the series. Pure. */
function move(rows, sessions, price) {
  if (rows.length <= sessions) return null;
  const then = rows[rows.length - 1 - sessions].c;
  if (!(then > 0) || !(price > 0)) return null;
  return { then, pct: (price / then - 1) * 100 };
}
/** how far a typical day moves, as the average size of the last daily percent changes, or null under 30 changes. Pure. */
function usualMove(rows) {
  const rets = [];
  for (let i = Math.max(1, rows.length - VOL_N); i < rows.length; i++) if (rows[i - 1].c > 0) rets.push(Math.abs((rows[i].c / rows[i - 1].c - 1) * 100));
  if (rets.length < 30) return null;
  return rets.reduce((a, b) => a + b, 0) / rets.length;
}
/** high, low and whether a year of closes is really there. The live price is included, so a print above the old high counts. Pure. */
function yearRange(rows, price) {
  const last = rows[rows.length - 1].t, cut = last - YEAR;
  let hi = price, lo = price, oldest = last;
  for (const r of rows) {
    if (r.t < cut) continue;
    hi = Math.max(hi, r.h != null ? r.h : r.c, r.c);
    lo = Math.min(lo, r.l != null ? r.l : r.c, r.c);
    if (r.t < oldest) oldest = r.t;
  }
  if (!(hi > 0) || !(lo > 0) || last - oldest <= 330 * DAY) return null;
  return { hi, lo, underHigh: (hi - price) / hi * 100, overLow: (price - lo) / lo * 100 };
}

const unavailable = (say) => ({ call: 'unavailable', label: 'Unavailable', reasons: [], say, disclaimer: VERDICT_DISCLAIMER });

/** price / earnings when both are positive finite numbers, else null. Pure. */
export function trailingPe(price, eps) {
  if (!(price > 0) || !(eps > 0) || !Number.isFinite(price) || !Number.isFinite(eps)) return null;
  return price / eps;
}
/** CIK for a ticker in the SEC company_tickers.json object, or null. Pure. */
export function cikOf(json, ticker) {
  const want = String(ticker || '').toUpperCase();
  if (!want || !json || typeof json !== 'object') return null;
  for (const row of Object.values(json)) {
    if (!row || String(row.ticker || '').toUpperCase() !== want) continue;
    const n = Number(row.cik_str);
    if (Number.isInteger(n) && n > 0) return n;
  }
  return null;
}
/** latest annual diluted earnings per share from a companyconcept JSON (a 10-K FY fact about a year long), or null. Pure. */
export function annualEps(json) {
  const list = json && json.units && (json.units['USD/shares'] || json.units.pure);
  if (!Array.isArray(list)) return null;
  let best = null;
  for (const row of list) {
    if (!row || row.form !== '10-K' || row.fp !== 'FY' || !Number.isFinite(row.val)) continue;
    const start = Date.parse(row.start), end = Date.parse(row.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const days = (end - start) / DAY;
    if (days < 300 || days > 380) continue;
    if (!best || end > best.end) best = { end, val: row.val };
  }
  return best ? best.val : null;
}

/**
 * The reading. `rows` are daily bars { t, c, h, l }, oldest first. `extra`: { kind, price, eps, filing: 'asked'|'skip' }.
 * { call: 'buy'|'sell'|'watch'|'unavailable', label, reasons (3 to 5, each with a number), say, disclaimer }. Pure.
 */
export function verdictOf(raw, extra = {}) {
  const kind = extra.kind || 'stock';
  if (kind === 'fx') return unavailable('A currency pair has a rate, not a share reading. Nothing here is a buy or a sell.');
  const rows = (raw || []).filter((r) => r && Number.isFinite(r.t) && Number.isFinite(r.c) && r.c > 0).slice().sort((a, b) => a.t - b.t);
  if (rows.length < NEED) return unavailable('Not enough daily prices came back (' + rows.length + ' sessions; a reading needs ' + NEED + '). No trend, average or volatility number is guessed.');
  const last = rows[rows.length - 1].c;
  const price = Number.isFinite(extra.price) && extra.price > 0 ? extra.price : last;
  const long = move(rows, TREND_LONG, price), short = move(rows, TREND_SHORT, price), trendMove = long || short;
  const trend = !trendMove ? 0 : trendMove.pct >= TREND_BAND ? 1 : trendMove.pct <= -TREND_BAND ? -1 : 0;
  const s50 = avg(rows, SMA_SHORT), s200 = avg(rows, SMA_LONG);
  let ma = 0;
  if (s50 != null && s200 != null) {
    if (price > s50 && price > s200 && s50 > s200) ma = 1;
    else if (price < s50 && price < s200 && s50 < s200) ma = -1;
  } else if (s50 != null) {
    if (price > s50) ma = 1;
    else if (price < s50) ma = -1;
  }
  const vol = usualMove(rows), wild = vol != null && vol > VOL_WILD;
  const yr = yearRange(rows, price);
  const nearHigh = !!(yr && yr.underHigh <= NEAR_HIGH), nearLow = !!(yr && yr.overLow <= NEAR_LOW);
  const eps = Number.isFinite(extra.eps) ? extra.eps : null;
  const pe = trailingPe(price, eps);
  let call = 'watch';
  if (trend > 0 && ma > 0) call = 'buy';
  else if (trend < 0 && ma < 0) call = 'sell';
  const rich = pe != null && pe > PE_RICH, cheap = pe != null && pe < PE_CHEAP;
  const blockedBuy = call === 'buy' && (wild || nearHigh || rich);
  const blockedSell = call === 'sell' && (wild || nearLow || cheap);
  if (blockedBuy || blockedSell) call = 'watch';

  const reasons = [];
  if (long && short) reasons.push('Over the last ' + TREND_LONG + ' sessions the price went from ' + fmtPrice(long.then) + ' to ' + fmtPrice(price) + ', ' + way(long.pct) + '. Over the last ' + TREND_SHORT + ' sessions it went from ' + fmtPrice(short.then) + ' to ' + fmtPrice(price) + ', ' + way(short.pct) + '.');
  else if (trendMove) reasons.push('Over the last ' + (long ? TREND_LONG : TREND_SHORT) + ' sessions the price went from ' + fmtPrice(trendMove.then) + ' to ' + fmtPrice(price) + ', ' + way(trendMove.pct) + '. The other window needs more daily prices than came back.');
  else reasons.push('The recent move cannot be measured from these ' + rows.length + ' sessions.');
  if (s50 != null && s200 != null) {
    const place = price > s50 && price > s200 ? 'above both' : price < s50 && price < s200 ? 'below both' : price === s50 && price === s200 ? 'level with both' : 'between them';
    const order = s50 > s200 ? 'above' : s50 < s200 ? 'below' : 'level with';
    reasons.push('The last price is ' + fmtPrice(price) + '. The average of the last ' + SMA_SHORT + ' sessions is ' + fmtPrice(s50) + ' and the average of the last ' + SMA_LONG + ' sessions is ' + fmtPrice(s200) + '. The ' + SMA_SHORT + '-session average is ' + order + ' the ' + SMA_LONG + '-session average, and the price is ' + place + '.');
  } else if (s50 != null) reasons.push('The last price is ' + fmtPrice(price) + '. The average of the last ' + SMA_SHORT + ' sessions is ' + fmtPrice(s50) + ', and the price is ' + (price > s50 ? 'above' : price < s50 ? 'below' : 'level with') + ' it. The ' + SMA_LONG + '-session average needs more daily prices than came back (' + rows.length + ' sessions are here).');
  if (vol != null) reasons.push('A typical day moves the price about ' + pct1(vol) + ' (the usual size of the last ' + Math.min(VOL_N, rows.length - 1) + ' daily changes).' + (wild ? ' That is a wide daily move, so this stays a Watch rather than a Buy or a Sell.' : ''));
  if (yr) reasons.push('The 52-week high is ' + fmtPrice(yr.hi) + ' and the low is ' + fmtPrice(yr.lo) + '. The price is ' + pct1(yr.underHigh) + ' under the high and ' + pct1(yr.overLow) + ' over the low.' + (nearHigh && blockedBuy ? ' That is close to the high, so this stays a Watch rather than a Buy.' : '') + (nearLow && blockedSell ? ' That is close to the low, so this stays a Watch rather than a Sell.' : ''));
  reasons.push(valuationLine(kind, extra.filing, price, eps, pe, blockedBuy && rich, blockedSell && cheap));
  const label = { buy: 'Buy', sell: 'Sell', watch: 'Watch' }[call];
  return { call, label, reasons: reasons.slice(0, 5), say: '', disclaimer: VERDICT_DISCLAIMER };
}

function valuationLine(kind, filing, price, eps, pe, richBlocked, cheapBlocked) {
  if (kind === 'index') return 'An index is not a company, so there is no earnings multiple in this reading.';
  if (kind === 'crypto') return 'A coin is not a company, so there is no earnings multiple in this reading.';
  if (pe != null) {
    const head = 'Trailing price to earnings is ' + pe.toFixed(1) + ' (the price ' + fmtPrice(price) + ' divided by annual diluted earnings per share ' + fmtPrice(eps) + ' from the free US filings). ';
    if (richBlocked) return head + 'That is above ' + PE_RICH + ', so this stays a Watch rather than a Buy.';
    if (cheapBlocked) return head + 'That is under ' + PE_CHEAP + ', so this stays a Watch rather than a Sell.';
    const band = pe > PE_RICH ? 'above ' + PE_RICH : pe < PE_CHEAP ? 'under ' + PE_CHEAP : 'between ' + PE_CHEAP + ' and ' + PE_RICH;
    return head + 'That sits ' + band + '.';
  }
  if (eps != null && eps <= 0) return 'The latest annual diluted earnings per share in the free US filings is ' + fmtPrice(eps) + ', so there is no positive price-to-earnings multiple. Valuation is left out of the call.';
  if (filing === 'asked') return 'No price-to-earnings number came back from the free filings, so valuation is left out of this reading.';
  return 'No earnings figure was requested with this quote, so valuation is left out of this reading.';
}
