// lib/collectors.mjs — one function per upstream source. Each returns plain data or throws; callers wrap with timed().
// Every function is pure network + parsing; the analytics live in derived.mjs.
import cfg from '../config/hub.config.mjs';
import { fetchJSON, fetchText, fetchRaw, pmap, num, round, pctChange, ymd, daysAgoIso, parseCsv, htmlTables, htmlToText, parseFlowNumber, weekEndingSunday, sleep } from './util.mjs';

const env = (k) => (typeof process !== 'undefined' && process.env && process.env[k]) || '';

// ====================================================================== CoinGecko
const CG_BASE = env('COINGECKO_PRO_API_KEY') ? 'https://pro-api.coingecko.com/api/v3' : 'https://api.coingecko.com/api/v3';
function cgHeaders() {
  const h = {};
  if (env('COINGECKO_PRO_API_KEY')) h['x-cg-pro-api-key'] = env('COINGECKO_PRO_API_KEY');
  else if (env('COINGECKO_API_KEY')) h['x-cg-demo-api-key'] = env('COINGECKO_API_KEY');
  return h;
}
export async function cgMarkets(ids) {
  const uniq = [...new Set(ids.filter(Boolean))];
  const chunks = []; for (let i = 0; i < uniq.length; i += 100) chunks.push(uniq.slice(i, i + 100));
  const out = {};
  const res = await pmap(chunks, 2, async (chunk) => fetchJSON(
    `${CG_BASE}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(chunk.join(','))}&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=1h,24h,7d,14d,30d,1y`,
    { headers: cgHeaders(), ttl: 20000, timeout: 10000 }));
  for (const r of res) { if (r && r.error) throw new Error('coingecko markets: ' + r.error); for (const row of r) out[row.id] = row; }
  return out;
}
export const cgGlobal = () => fetchJSON(`${CG_BASE}/global`, { headers: cgHeaders(), ttl: 60000 }).then((j) => j.data || j);
export const cgTreasury = (asset = 'bitcoin') => fetchJSON(`${CG_BASE}/companies/public_treasury/${asset}`, { headers: cgHeaders(), ttl: 600000 });
export const cgSearch = (q) => fetchJSON(`${CG_BASE}/search?query=${encodeURIComponent(q)}`, { headers: cgHeaders(), ttl: 60000 }).then((j) => (j.coins || []).slice(0, 15).map((c) => ({ id: c.id, symbol: c.symbol, name: c.name, market_cap_rank: c.market_cap_rank })));
export const cgCoin = (id) => fetchJSON(`${CG_BASE}/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`, { headers: cgHeaders(), ttl: 60000, timeout: 10000 });
export const cgChart = (id, days = 365) => fetchJSON(`${CG_BASE}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${days}${days > 90 ? '&interval=daily' : ''}`, { headers: cgHeaders(), ttl: 300000, timeout: 12000 });
export const cgDerivatives = () => fetchJSON(`${CG_BASE}/derivatives`, { headers: cgHeaders(), ttl: 60000, timeout: 15000 });
export const cgDerivativesExchanges = () => fetchJSON(`${CG_BASE}/derivatives/exchanges?per_page=50`, { headers: cgHeaders(), ttl: 300000, timeout: 12000 });

// ====================================================================== Coinbase Exchange (the venue the orders rest on)
const CB = 'https://api.exchange.coinbase.com';
export const cbProducts = () => fetchJSON(`${CB}/products`, { ttl: 3600000, timeout: 10000 });
export const cbTicker = (pid) => fetchJSON(`${CB}/products/${pid}/ticker`, { ttl: 5000 });
export const cbStats = (pid) => fetchJSON(`${CB}/products/${pid}/stats`, { ttl: 15000 });
export const cbBook = (pid, level = 2) => fetchJSON(`${CB}/products/${pid}/book?level=${level}`, { ttl: 5000, timeout: 10000 });
/** try the all-products stats endpoint; returns null if the shape is not what we expect */
export async function cbStatsAll() {
  try {
    const j = await fetchJSON(`${CB}/products/stats`, { ttl: 15000, timeout: 10000 });
    if (j && typeof j === 'object' && !Array.isArray(j)) {
      const k = Object.keys(j)[0];
      if (k && j[k] && (j[k].stats_24hour || j[k].last || j[k].open)) return j;
    }
    return null;
  } catch (e) { return null; }
}
/** daily (or other) candles for `days` back; returns ASCENDING [time, low, high, open, close, volume] with dupes removed */
export async function cbCandles(pid, days = 100, granularity = 86400) {
  const per = 290 * granularity; // seconds per request window (Coinbase caps a request at 300 candles; 290 keeps inclusive bounds safe)
  const end = Date.now() / 1000; const start = end - days * 86400;
  const windows = []; for (let s = start; s < end; s += per) windows.push([s, Math.min(s + per, end)]);
  const all = [];
  for (const [s, e] of windows) { // sequential: Coinbase allows ~10 req/s per IP
    const url = `${CB}/products/${pid}/candles?granularity=${granularity}&start=${new Date(s * 1000).toISOString()}&end=${new Date(e * 1000).toISOString()}`;
    const rows = await fetchJSON(url, { ttl: 60000, timeout: 10000 });
    if (Array.isArray(rows)) all.push(...rows);
  }
  const seen = new Set(); const out = [];
  for (const r of all) { if (!Array.isArray(r) || r.length < 6 || seen.has(r[0])) continue; seen.add(r[0]); out.push(r.map(Number)); }
  out.sort((a, b) => a[0] - b[0]);
  return out;
}
/** Coinbase Advanced Trade PUBLIC order book (deeper than Exchange level 2). Returns {bids:[[p,s]], asks:[[p,s]]} or null. */
export async function cbAdvancedBook(pid, limit = 250) {
  try {
    const j = await fetchJSON(`https://api.coinbase.com/api/v3/brokerage/market/product_book?product_id=${pid}&limit=${limit}`, { ttl: 5000, timeout: 10000 });
    const pb = j.pricebook || j;
    if (!pb || !Array.isArray(pb.bids)) return null;
    return { bids: pb.bids.map((x) => [num(x.price), num(x.size)]), asks: pb.asks.map((x) => [num(x.price), num(x.size)]), time: pb.time || null, source: 'coinbase advanced trade public product_book' };
  } catch (e) { return null; }
}

// ====================================================================== FRED (CSV, no key)
export async function fredSeries(id, startDate) {
  const cosd = startDate || ymd(new Date(Date.now() - 3 * 365 * 86400000));
  const text = await fetchText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(id)}&cosd=${cosd}`, { ttl: 900000, timeout: 12000 });
  const rows = parseCsv(text);
  if (!rows.length || rows[0].length < 2) throw new Error(`FRED ${id}: unexpected CSV header ${JSON.stringify(rows[0])}`);
  const obs = [];
  for (const r of rows.slice(1)) { if (r.length < 2) continue; const v = r[1].trim(); if (v === '.' || v === '') continue; const n = parseFloat(v); if (Number.isFinite(n)) obs.push({ date: r[0].trim(), value: n }); }
  if (!obs.length) throw new Error(`FRED ${id}: no observations`);
  return { id, header: rows[0], count: obs.length, first: obs[0], last: obs[obs.length - 1], obs };
}

// ====================================================================== DefiLlama
export const llamaStablecoinCharts = () => fetchJSON('https://stablecoins.llama.fi/stablecoincharts/all', { ttl: 600000, timeout: 15000 });
export const llamaStablecoins = () => fetchJSON('https://stablecoins.llama.fi/stablecoins?includePrices=true', { ttl: 600000, timeout: 15000 });
export const llamaChains = () => fetchJSON('https://api.llama.fi/v2/chains', { ttl: 600000, timeout: 12000 });
export const llamaProtocols = () => fetchJSON('https://api.llama.fi/protocols', { ttl: 3600000, timeout: 20000 });
export const llamaTvl = (slug) => fetchJSON(`https://api.llama.fi/tvl/${encodeURIComponent(slug)}`, { ttl: 300000, timeout: 10000 });
export const llamaProtocol = (slug) => fetchJSON(`https://api.llama.fi/protocol/${encodeURIComponent(slug)}`, { ttl: 600000, timeout: 20000 });
export const llamaFeesSummary = (slug, dataType = 'dailyFees') => fetchJSON(`https://api.llama.fi/summary/fees/${encodeURIComponent(slug)}?dataType=${dataType}`, { ttl: 600000, timeout: 12000 });
export const llamaFeesOverview = (chain = '') => fetchJSON(`https://api.llama.fi/overview/fees${chain ? '/' + encodeURIComponent(chain) : ''}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`, { ttl: 3600000, timeout: 25000 });
export const llamaUnlocks = (slug) => fetchJSON(`https://api.llama.fi/emission/${encodeURIComponent(slug)}`, { ttl: 3600000, timeout: 15000 });
/** value-capture pack for one protocol: TVL + fees / revenue / holders revenue (24h, 7d, 30d). Tries slug candidates in order. */
export async function llamaPack(symbol, slugs) {
  const errors = [];
  for (const slug of slugs) {
    try {
      const [tvl, fees, rev, hrev] = await Promise.all([
        llamaTvl(slug).catch((e) => ({ error: e.message })),
        llamaFeesSummary(slug, 'dailyFees').catch((e) => ({ error: e.message })),
        llamaFeesSummary(slug, 'dailyRevenue').catch((e) => ({ error: e.message })),
        llamaFeesSummary(slug, 'dailyHoldersRevenue').catch((e) => ({ error: e.message })),
      ]);
      const pick = (o) => (o && !o.error) ? { total24h: o.total24h ?? null, total7d: o.total7d ?? null, total30d: o.total30d ?? null, totalAllTime: o.totalAllTime ?? null, change_1d: o.change_1d ?? null } : { error: o && o.error };
      const ok = (typeof tvl === 'number') || (fees && !fees.error) || (rev && !rev.error);
      if (!ok) { errors.push(`${slug}: tvl ${tvl && tvl.error} / fees ${fees && fees.error}`); continue; }
      return { symbol, slug, tvl_usd: typeof tvl === 'number' ? tvl : null, fees: pick(fees), revenue: pick(rev), holders_revenue: pick(hrev), name: (fees && fees.name) || (rev && rev.name) || null };
    } catch (e) { errors.push(`${slug}: ${e.message}`); }
  }
  throw new Error(`DefiLlama: no working slug for ${symbol} (${errors.join(' | ')})`);
}

// ====================================================================== Derivatives venues
export async function hyperliquidMeta() {
  const j = await fetchJSON('https://api.hyperliquid.xyz/info', { method: 'POST', body: JSON.stringify({ type: 'metaAndAssetCtxs' }), headers: { 'content-type': 'application/json' }, ttl: 15000, timeout: 10000 });
  if (!Array.isArray(j) || j.length < 2) throw new Error('hyperliquid: unexpected shape');
  const universe = j[0].universe || []; const ctxs = j[1] || [];
  const out = {};
  universe.forEach((u, i) => {
    const c = ctxs[i]; if (!c) return;
    const mark = num(c.markPx), oi = num(c.openInterest), fund = num(c.funding), prev = num(c.prevDayPx);
    out[u.name] = { coin: u.name, mark_px: mark, oracle_px: num(c.oraclePx), mid_px: num(c.midPx), funding_hourly: fund, funding_8h_pct: fund === null ? null : round(fund * 8 * 100, 5), funding_annualized_pct: fund === null ? null : round(fund * 24 * 365 * 100, 2),
      open_interest_coins: oi, open_interest_usd: (oi !== null && mark !== null) ? round(oi * mark, 0) : null, day_notional_volume_usd: num(c.dayNtlVlm), premium: num(c.premium), prev_day_px: prev, change_24h_pct: (mark !== null && prev) ? round((mark / prev - 1) * 100, 3) : null, max_leverage: u.maxLeverage ?? null };
  });
  return { source: 'hyperliquid metaAndAssetCtxs', count: Object.keys(out).length, assets: out };
}
export async function okxSwap(instId) {
  const base = 'https://www.okx.com/api/v5';
  const [fr, oi, tk] = await Promise.all([
    fetchJSON(`${base}/public/funding-rate?instId=${instId}`, { ttl: 15000 }).catch((e) => ({ error: e.message })),
    fetchJSON(`${base}/public/open-interest?instType=SWAP&instId=${instId}`, { ttl: 15000 }).catch((e) => ({ error: e.message })),
    fetchJSON(`${base}/market/ticker?instId=${instId}`, { ttl: 15000 }).catch((e) => ({ error: e.message })),
  ]);
  const d = (j) => (j && j.data && j.data[0]) || null;
  const f = d(fr), o = d(oi), t = d(tk);
  if (!f && !o && !t) throw new Error(`okx ${instId}: ${(fr && fr.error) || (fr && fr.msg) || 'no data'}`);
  const last = t ? num(t.last) : null; const oiCcy = o ? num(o.oiCcy) : null;
  return { instId, funding_rate_8h_pct: f ? round(num(f.fundingRate) * 100, 5) : null, next_funding_rate_pct: f && f.nextFundingRate ? round(num(f.nextFundingRate) * 100, 5) : null, funding_time: f ? new Date(+f.fundingTime).toISOString() : null,
    open_interest_ccy: oiCcy, open_interest_usd: o && o.oiUsd ? num(o.oiUsd) : (oiCcy !== null && last !== null ? round(oiCcy * last, 0) : null), oi_ts: o ? new Date(+o.ts).toISOString() : null, last, vol24h_ccy: t ? num(t.volCcy24h) : null, vol24h_usd: t && last !== null ? round(num(t.volCcy24h) * last, 0) : null };
}
export async function okxOiHistory(ccy, period = '1D') {
  const j = await fetchJSON(`https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-volume?ccy=${ccy}&period=${period}`, { ttl: 300000, timeout: 10000 });
  const rows = (j.data || []).map((r) => ({ ts: new Date(+r[0]).toISOString(), open_interest_usd: num(r[1]), volume_usd: num(r[2]) })).sort((a, b) => a.ts < b.ts ? -1 : 1);
  if (!rows.length) throw new Error(`okx rubik ${ccy}: ${j.msg || 'no rows'}`);
  const last = rows[rows.length - 1], prev = rows[rows.length - 2], wk = rows[rows.length - 8];
  return { ccy, period, count: rows.length, last, oi_change_1d_pct: prev ? round(pctChange(last.open_interest_usd, prev.open_interest_usd) * 100, 2) : null, oi_change_7d_pct: wk ? round(pctChange(last.open_interest_usd, wk.open_interest_usd) * 100, 2) : null, rows: rows.slice(-30) };
}
export async function bybitTicker(symbol) {
  const j = await fetchJSON(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`, { ttl: 15000 });
  const r = j && j.result && j.result.list && j.result.list[0];
  if (!r) throw new Error(`bybit ${symbol}: ${j && j.retMsg}`);
  return { symbol, last: num(r.lastPrice), funding_rate_8h_pct: round(num(r.fundingRate) * 100, 5), open_interest_coins: num(r.openInterest), open_interest_usd: num(r.openInterestValue), turnover24h_usd: num(r.turnover24h), next_funding_time: r.nextFundingTime ? new Date(+r.nextFundingTime).toISOString() : null };
}
export async function deribitPerp(instrument = 'BTC-PERPETUAL') {
  const j = await fetchJSON(`https://www.deribit.com/api/v2/public/get_book_summary_by_instrument?instrument_name=${instrument}`, { ttl: 15000 });
  const r = j.result && j.result[0]; if (!r) throw new Error('deribit: no result');
  return { instrument, mark_price: num(r.mark_price), open_interest: num(r.open_interest), open_interest_note: 'Deribit reports OI in contract units (USD notional for BTC/ETH perpetuals)', funding_8h_pct: r.funding_8h !== undefined ? round(num(r.funding_8h) * 100, 5) : null, current_funding_pct: r.current_funding !== undefined ? round(num(r.current_funding) * 100, 5) : null, volume_usd_24h: num(r.volume_usd), price_change_24h_pct: num(r.price_change) };
}
export async function deribitDvol(currency = 'BTC', days = 30) {
  const end = Date.now(), start = end - days * 86400000;
  const j = await fetchJSON(`https://www.deribit.com/api/v2/public/get_volatility_index_data?currency=${currency}&resolution=1D&start_timestamp=${start}&end_timestamp=${end}`, { ttl: 300000 });
  const rows = ((j.result && j.result.data) || []).map((r) => ({ ts: new Date(r[0]).toISOString().slice(0, 10), open: r[1], high: r[2], low: r[3], close: r[4] }));
  if (!rows.length) throw new Error('deribit dvol: no rows');
  return { currency, last: rows[rows.length - 1], rows };
}
export async function binancePerp(symbol) {
  const [pi, oi] = await Promise.all([
    fetchJSON(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`, { ttl: 15000 }),
    fetchJSON(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`, { ttl: 15000 }).catch(() => null),
  ]);
  return { symbol, mark_price: num(pi.markPrice), index_price: num(pi.indexPrice), funding_rate_8h_pct: round(num(pi.lastFundingRate) * 100, 5), next_funding_time: pi.nextFundingTime ? new Date(pi.nextFundingTime).toISOString() : null, open_interest_coins: oi ? num(oi.openInterest) : null };
}
export async function coinalyze(symbols = ['BTCUSDT_PERP.A', 'ETHUSDT_PERP.A']) {
  const key = env('COINALYZE_API_KEY'); if (!key) throw new Error('COINALYZE_API_KEY not set (free key at coinalyze.net/account/api-key)');
  const h = { api_key: key };
  const [fr, oi] = await Promise.all([
    fetchJSON(`https://api.coinalyze.net/v1/funding-rate?symbols=${symbols.join(',')}`, { headers: h, ttl: 60000 }),
    fetchJSON(`https://api.coinalyze.net/v1/open-interest?symbols=${symbols.join(',')}&convert_to_usd=true`, { headers: h, ttl: 60000 }),
  ]);
  return { funding: fr, open_interest_usd: oi };
}

// ====================================================================== Yahoo Finance (macro: MOVE, DXY, Brent, VIX, equities)
export async function yahooChart(symbol, range = '6mo', interval = '1d') {
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false&events=div%2Csplits`;
  let j;
  try { j = await fetchJSON('https://query1.finance.yahoo.com' + path, { browser: true, ttl: 120000, timeout: 10000 }); }
  catch (e) { j = await fetchJSON('https://query2.finance.yahoo.com' + path, { browser: true, ttl: 120000, timeout: 10000 }); }
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r) throw new Error(`yahoo ${symbol}: ${(j && j.chart && j.chart.error && j.chart.error.description) || 'no result'}`);
  const ts = r.timestamp || []; const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
  const series = ts.map((t, i) => ({ date: ymd(new Date(t * 1000)), close: q.close ? q.close[i] : null, high: q.high ? q.high[i] : null, low: q.low ? q.low[i] : null })).filter((x) => x.close !== null && x.close !== undefined);
  const meta = r.meta || {};
  const last = meta.regularMarketPrice ?? (series.length ? series[series.length - 1].close : null);
  const closes = series.map((x) => x.close);
  const prev = meta.chartPreviousClose ?? meta.previousClose ?? (closes.length > 1 ? closes[closes.length - 2] : null);
  // weekly closes (Fri or last trading day of the week), completed weeks only
  const wk = new Map();
  for (const x of series) { const k = weekEndingSunday(Math.floor(new Date(x.date).getTime() / 1000)); wk.set(k, x); }
  const weeks = [...wk.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1);
  const todaySunday = weekEndingSunday(Math.floor(Date.now() / 1000));
  const completed = weeks.filter(([k]) => k < todaySunday).map(([k, x]) => ({ week_ending: k, date: x.date, close: x.close }));
  const at = (n) => (closes.length > n ? closes[closes.length - 1 - n] : null);
  return { symbol, name: meta.shortName || meta.longName || symbol, currency: meta.currency || null, last, previous_close: prev, market_time: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
    change_1d_pct: prev ? round((last / prev - 1) * 100, 2) : null, change_5d_pct: at(5) ? round((last / at(5) - 1) * 100, 2) : null, change_1m_pct: at(21) ? round((last / at(21) - 1) * 100, 2) : null, change_3m_pct: at(63) ? round((last / at(63) - 1) * 100, 2) : null,
    high_3m: Math.max(...closes.slice(-63)), low_3m: Math.min(...closes.slice(-63)), weekly_closes_last4: completed.slice(-4), series_last30: series.slice(-30) };
}

// ====================================================================== Sentiment / flows / prediction markets
export async function fearGreed(limit = 60) {
  const j = await fetchJSON(`https://api.alternative.me/fng/?limit=${limit}&format=json`, { ttl: 600000 });
  const rows = (j.data || []).map((d) => ({ date: ymd(new Date(+d.timestamp * 1000)), value: +d.value, label: d.value_classification }));
  if (!rows.length) throw new Error('fng: no data');
  return { last: rows[0], avg_7d: round(rows.slice(0, 7).reduce((s, r) => s + r.value, 0) / Math.min(7, rows.length), 1), avg_30d: round(rows.slice(0, 30).reduce((s, r) => s + r.value, 0) / Math.min(30, rows.length), 1), rows: rows.slice(0, 30) };
}
export async function farside(asset = 'btc') {
  const pages = asset === 'btc' ? ['https://farside.co.uk/btc/', 'https://farside.co.uk/bitcoin-etf-flow-all-data/'] : asset === 'eth' ? ['https://farside.co.uk/eth/', 'https://farside.co.uk/ethereum-etf-flow-all-data/'] : [`https://farside.co.uk/${asset}/`];
  let html = null, used = null, lastErr = null;
  for (const u of pages) { try { html = await fetchText(u, { browser: true, ttl: 600000, timeout: 12000 }); used = u; break; } catch (e) { lastErr = e; } }
  if (!html) throw new Error(`farside ${asset}: ${lastErr && lastErr.message}`);
  const tables = htmlTables(html);
  const dateRe = /^\d{1,2} [A-Z][a-z]{2} \d{4}$/;
  let best = null;
  for (const t of tables) {
    const hdrIdx = t.findIndex((r) => r.some((c) => /^total$/i.test(c.trim())));
    const rows = t.filter((r) => dateRe.test((r[0] || '').trim()));
    if (rows.length && (!best || rows.length > best.rows.length)) best = { hdr: hdrIdx >= 0 ? t[hdrIdx] : null, rows };
  }
  if (!best) throw new Error(`farside ${asset}: no flow table parsed from ${used}`);
  const totalIdx = best.hdr ? best.hdr.findIndex((c) => /^total$/i.test(c.trim())) : -1;
  const parsed = best.rows.map((r) => {
    const cells = r.slice(1).map(parseFlowNumber);
    const total = totalIdx > 0 && r[totalIdx] !== undefined ? parseFlowNumber(r[totalIdx]) : cells.filter((v) => v !== null).slice(-1)[0];
    const d = new Date(r[0].trim() + ' UTC');
    return { date: Number.isNaN(d.getTime()) ? r[0].trim() : ymd(d), total_musd: total, issuers: best.hdr ? Object.fromEntries(best.hdr.slice(1, r.length).map((h, i) => [h.trim(), cells[i]])) : undefined };
  }).filter((r) => r.total_musd !== null && r.total_musd !== undefined);
  parsed.sort((a, b) => a.date < b.date ? -1 : 1);
  const last = parsed.slice(-40);
  const sumN = (n) => round(last.slice(-n).reduce((s, r) => s + r.total_musd, 0), 1);
  let streakOut = 0; for (let i = last.length - 1; i >= 0 && last[i].total_musd < 0; i--) streakOut++;
  let streakIn = 0; for (let i = last.length - 1; i >= 0 && last[i].total_musd > 0; i--) streakIn++;
  // weekly sums (Mon–Fri by week-ending Sunday)
  const wk = new Map(); for (const r of last) { const k = weekEndingSunday(Math.floor(new Date(r.date).getTime() / 1000)); wk.set(k, (wk.get(k) || 0) + r.total_musd); }
  const weeks = [...wk.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([week_ending, total]) => ({ week_ending, total_musd: round(total, 1) }));
  let weekStreakOut = 0; for (let i = weeks.length - 1; i >= 0 && weeks[i].total_musd < 0; i--) weekStreakOut++;
  return { asset, source: used, last_day: last[last.length - 1], sum_last5_musd: sumN(5), sum_last20_musd: sumN(20), consecutive_outflow_days: streakOut, consecutive_inflow_days: streakIn, weeks: weeks.slice(-8), consecutive_outflow_weeks: weekStreakOut, days: last.slice(-15) };
}
export async function polymarketSearch(q) {
  const parseMarket = (m) => {
    let outcomes = m.outcomes, prices = m.outcomePrices;
    try { if (typeof outcomes === 'string') outcomes = JSON.parse(outcomes); } catch (e) { /* keep */ }
    try { if (typeof prices === 'string') prices = JSON.parse(prices); } catch (e) { /* keep */ }
    const probs = Array.isArray(outcomes) && Array.isArray(prices) ? Object.fromEntries(outcomes.map((o, i) => [o, round(num(prices[i]) * 100, 1)])) : null;
    return { question: m.question, slug: m.slug, group_item: m.groupItemTitle || null, probabilities_pct: probs, volume_usd: num(m.volume ?? m.volumeNum), liquidity_usd: num(m.liquidity ?? m.liquidityNum), end_date: m.endDate || null, active: m.active, closed: m.closed };
  };
  let j;
  try { j = await fetchJSON(`https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(q)}&limit_per_type=8&events_status=active`, { ttl: 60000, timeout: 10000 }); }
  catch (e) { j = null; }
  let events = j && Array.isArray(j.events) ? j.events : null;
  if (!events) {
    const alt = await fetchJSON(`https://gamma-api.polymarket.com/events?active=true&closed=false&limit=100&order=volume24hr&ascending=false`, { ttl: 60000, timeout: 10000 }).catch(() => []);
    const words = String(q).toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    events = (Array.isArray(alt) ? alt : []).filter((ev) => { const t = String(ev.title || '').toLowerCase(); return words.every((w) => t.includes(w)); });
  }
  return { query: q, events: events.slice(0, 8).map((ev) => ({ title: ev.title, slug: ev.slug, end_date: ev.endDate || null, volume_usd: num(ev.volume), markets: (ev.markets || []).slice(0, 12).map(parseMarket) })) };
}
export async function polymarketEvent(slug) {
  const j = await fetchJSON(`https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(slug)}`, { ttl: 60000 });
  const ev = Array.isArray(j) ? j[0] : j; if (!ev) throw new Error('polymarket: event not found');
  return (await polymarketSearch(ev.title)).events.find((e) => e.slug === slug) || { title: ev.title, slug };
}

// ====================================================================== Coin Metrics (on-chain history; community API, GitHub CSV fallback)
export async function coinMetricsBtc() {
  const metrics = ['PriceUSD', 'CapMrktCurUSD', 'CapRealUSD', 'CapMVRVCur', 'IssContUSD'];
  const rows = [];
  try {
    let url = `https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=${metrics.join(',')}&frequency=1d&page_size=10000&start_time=2010-07-18&paging_from=start`;
    for (let page = 0; page < 3 && url; page++) {
      const j = await fetchJSON(url, { ttl: 3600000, timeout: 20000 });
      for (const r of (j.data || [])) rows.push({ date: String(r.time).slice(0, 10), price: num(r.PriceUSD), mcap: num(r.CapMrktCurUSD), rcap: num(r.CapRealUSD), mvrv: num(r.CapMVRVCur), iss_usd: num(r.IssContUSD) });
      url = j.next_page_url || null;
    }
    if (!rows.length) throw new Error('empty');
    return { source: 'coinmetrics community api v4', rows };
  } catch (e) {
    const csv = await fetchText('https://raw.githubusercontent.com/coinmetrics/data/master/csv/btc.csv', { ttl: 3600000, timeout: 30000 });
    const lines = parseCsv(csv); const h = lines[0]; const ix = (n) => h.indexOf(n);
    const iT = ix('time'), iP = ix('PriceUSD'), iM = ix('CapMrktCurUSD'), iR = ix('CapRealUSD'), iV = ix('CapMVRVCur'), iI = ix('IssContUSD') >= 0 ? ix('IssContUSD') : ix('IssTotUSD');
    for (const l of lines.slice(1)) { if (l.length < 3) continue; rows.push({ date: l[iT].slice(0, 10), price: num(l[iP]), mcap: num(l[iM]), rcap: iR >= 0 ? num(l[iR]) : null, mvrv: num(l[iV]), iss_usd: iI >= 0 ? num(l[iI]) : null }); }
    return { source: `github coinmetrics/data csv (api failed: ${e.message})`, rows: rows.filter((r) => r.price !== null) };
  }
}

// ====================================================================== Oil / Hormuz
export async function portwatchHormuz() {
  const h = cfg.hormuz;
  const url = `${h.portwatch_query_url}?where=${encodeURIComponent(h.portwatch_where)}&outFields=*&orderByFields=${encodeURIComponent('date DESC')}&resultRecordCount=45&f=json`;
  const j = await fetchJSON(url, { ttl: 3600000, timeout: 12000 });
  if (j.error) throw new Error(`portwatch: ${JSON.stringify(j.error).slice(0, 200)}`);
  const feats = (j.features || []).map((f) => f.attributes || f);
  if (!feats.length) throw new Error('portwatch: no features (check portwatch_where / service URL in config)');
  const keys = Object.keys(feats[0]);
  const transitKey = keys.find((k) => /^(n_total|total|transit_calls|transits|n_transits|calls)$/i.test(k)) || keys.find((k) => /total|transit/i.test(k)) || null;
  const dateKey = keys.find((k) => /^date$/i.test(k)) || keys.find((k) => /date|time/i.test(k)) || null;
  const rows = feats.map((a) => ({ date: dateKey ? (typeof a[dateKey] === 'number' ? ymd(new Date(a[dateKey])) : a[dateKey]) : null, transits: transitKey ? num(a[transitKey]) : null, raw: a })).sort((a, b) => (a.date < b.date ? -1 : 1));
  const last7 = rows.slice(-7).map((r) => r.transits).filter((v) => v !== null);
  const avg7 = last7.length ? round(last7.reduce((s, v) => s + v, 0) / last7.length, 1) : null;
  return { source: url, fields: keys, transit_field_guess: transitKey, baseline_per_day: h.baseline_transits_per_day, last: rows[rows.length - 1], avg_last7: avg7, pct_of_baseline_last7: avg7 !== null ? round(avg7 / h.baseline_transits_per_day * 100, 1) : null, rows: rows.slice(-30).map(({ raw, ...r }) => r), verify: h.verify };
}
export async function straitsBrief(date) {
  const d = date || ymd(new Date());
  const url = cfg.hormuz.straits_live_brief.replace('{date}', d);
  let html; try { html = await fetchText(url, { browser: true, ttl: 1800000, timeout: 12000 }); }
  catch (e) { const y = ymd(new Date(Date.now() - 86400000)); html = await fetchText(cfg.hormuz.straits_live_brief.replace('{date}', y), { browser: true, ttl: 1800000, timeout: 12000 }); return { date: y, note: `today's brief not found (${e.message}); returning yesterday`, text: htmlToText(html, 6000) }; }
  const text = htmlToText(html, 6000);
  const m = text.match(/(\d+)\s+transits?/i);
  return { date: d, url, transits_mentioned: m ? +m[1] : null, text };
}

// ====================================================================== RSS / EDGAR / whitelisted fetch
export async function rss(feedKey) {
  const url = cfg.rss[feedKey]; if (!url) throw new Error(`unknown feed "${feedKey}" — known: ${Object.keys(cfg.rss).join(', ')}`);
  const xml = await fetchText(url, { browser: true, ttl: 300000, timeout: 12000 });
  const items = []; const re = /<(item|entry)\b[\s\S]*?<\/\1>/gi; let m;
  const pick = (blk, tag) => { const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(blk); return r ? htmlToText(r[1].replace(/^<!\[CDATA\[|\]\]>$/g, ''), 400) : null; };
  while ((m = re.exec(xml)) && items.length < 30) {
    const b = m[0]; const linkAttr = /<link[^>]*href="([^"]+)"/i.exec(b);
    items.push({ title: pick(b, 'title'), link: pick(b, 'link') || (linkAttr ? linkAttr[1] : null), date: pick(b, 'pubDate') || pick(b, 'updated') || pick(b, 'published') || pick(b, 'dc:date'), summary: pick(b, 'description') || pick(b, 'summary') || pick(b, 'content') });
  }
  return { feed: feedKey, url, count: items.length, items };
}
export async function edgarFullText(q, from, to, forms) {
  const contact = env('SEC_CONTACT') || 'mathews-crypto-hub (set SEC_CONTACT env var to your name and email per SEC fair-access policy)';
  let url = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(q)}`;
  if (from || to) url += `&dateRange=custom${from ? `&startdt=${from}` : ''}${to ? `&enddt=${to}` : ''}`;
  if (forms) url += `&forms=${encodeURIComponent(forms)}`;
  const j = await fetchJSON(url, { headers: { 'user-agent': contact, accept: 'application/json' }, ttl: 300000, timeout: 12000 });
  const hits = (j.hits && j.hits.hits) || [];
  return { query: q, total: j.hits && j.hits.total ? j.hits.total.value : hits.length, hits: hits.slice(0, 25).map((h) => ({ id: h._id, file_date: h._source && h._source.file_date, form: h._source && (h._source.form_type || h._source.file_type), entities: h._source && h._source.display_names, description: h._source && h._source.file_description, url: h._id ? `https://www.sec.gov/Archives/edgar/data/${(h._source && h._source.ciks && h._source.ciks[0]) || ''}/${String(h._id).split(':')[0].replace(/-/g, '')}/${String(h._id).split(':')[1] || ''}` : null })) };
}
export function isWhitelisted(url) {
  try { const u = new URL(url); return u.protocol === 'https:' && cfg.fetch_whitelist.includes(u.hostname); } catch (e) { return false; }
}
export async function proxyFetch(url, { text = false, max = 1500000, timeout = 12000 } = {}) {
  if (!isWhitelisted(url)) throw new Error(`host not whitelisted (edit fetch_whitelist in config/hub.config.mjs): ${url}`);
  const r = await fetchRaw(url, { browser: true, timeout, retries: 0 });
  const ct = r.headers['content-type'] || '';
  let body = r.text; let truncated = false;
  if (body.length > max) { body = body.slice(0, max); truncated = true; }
  if (text) return { url, status: r.status, content_type: ct, truncated, text: htmlToText(body, max) };
  if (/json/i.test(ct) || /^\s*[\[{]/.test(body)) { try { return { url, status: r.status, content_type: ct, truncated, json: JSON.parse(body) }; } catch (e) { /* fall through */ } }
  return { url, status: r.status, content_type: ct, truncated, text: body };
}
