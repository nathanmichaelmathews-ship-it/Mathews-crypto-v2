// api/hub.js — the Mathews data hub router. vercel.json rewrites /api/<fn> → /api/hub?fn=<fn> (query strings merge).
// Every response: JSON (or text for /api/brief and ?format=text), Cache-Control: no-store, CORS *, generated_utc.
import cfg from '../config/hub.config.mjs';
import * as C from '../lib/collectors.mjs';
import * as D from '../lib/derived.mjs';
import { HUB_VERSION, nowIso, round } from '../lib/util.mjs';

const routes = {
  index: async (q, req) => D.index(),
  all: (q) => D.all({ full: q.full === '1' || q.full === 'true' }),
  brief: () => D.brief(),
  prices: (q) => D.prices({ group: q.group, symbols: q.symbols }),
  feed: (q) => D.legacyFeed({ group: q.group, symbols: q.symbols }),
  book: () => D.book(),
  'btc-structure': (q) => D.btcStructure({ days: q.days ? +q.days : 1460 }),
  structure: (q) => D.btcStructure({ days: q.days ? +q.days : 1460 }),
  candles: (q) => D.candles({ symbol: q.symbol || 'BTC', days: q.days ? +q.days : 100, since: q.since, granularity: q.granularity ? +q.granularity : 86400 }),
  wave: (q) => D.wave({ set: q.set || 'weekly', symbols: q.symbols }),
  flags: () => D.flags(),
  depth: (q) => D.depth({ symbol: q.symbol || 'ONDO' }),
  fred: (q) => D.fred({ series: q.series }),
  stablecoins: () => D.stablecoins(),
  macro: (q) => D.macro({ symbols: q.symbols }),
  funding: (q) => D.funding({ coins: q.coins }),
  'okx-oi': (q) => C.okxOiHistory((q.ccy || 'BTC').toUpperCase(), q.period || '1D'),
  derivatives: async (q) => {
    const all = await C.cgDerivatives(); const sym = (q.symbol || 'BTC').toUpperCase();
    const rows = all.filter((d) => String(d.index_id || '').toUpperCase() === sym || String(d.symbol || '').toUpperCase().startsWith(sym));
    const perps = rows.filter((d) => d.contract_type === 'perpetual');
    const oi = perps.map((d) => +d.open_interest || 0).reduce((s, v) => s + v, 0); const vol = perps.map((d) => +d.volume_24h || 0).reduce((s, v) => s + v, 0);
    const f = perps.map((d) => +d.funding_rate).filter(Number.isFinite).sort((a, b) => a - b);
    return { generated_utc: nowIso(), source: 'coingecko /derivatives', symbol: sym, perps: perps.length, open_interest_usd_sum: round(oi, 0), volume_24h_usd_sum: round(vol, 0), funding_rate_pct_median: f.length ? f[Math.floor(f.length / 2)] : null, funding_rate_pct_min: f[0] ?? null, funding_rate_pct_max: f[f.length - 1] ?? null, top: perps.sort((a, b) => (+b.open_interest || 0) - (+a.open_interest || 0)).slice(0, 15).map((d) => ({ market: d.market, symbol: d.symbol, price: +d.price, funding_rate_pct: d.funding_rate, open_interest_usd: d.open_interest, volume_24h_usd: d.volume_24h, basis: d.basis, spread: d.spread, last_traded_at: d.last_traded_at })) };
  },
  onchain: () => D.onchain(),
  llama: (q) => D.llama({ symbols: q.symbols, slug: q.slug }),
  'llama-search': (q) => D.llamaSearch({ q: q.q }),
  'llama-unlocks': (q) => C.llamaUnlocks(q.slug || 'hyperliquid'),
  'etf-flows': (q) => C.farside((q.asset || 'btc').toLowerCase()),
  farside: (q) => C.farside((q.asset || 'btc').toLowerCase()),
  global: () => C.cgGlobal(),
  'fear-greed': (q) => C.fearGreed(q.limit ? +q.limit : 60),
  polymarket: (q) => (q.slug ? C.polymarketEvent(q.slug) : q.q ? C.polymarketSearch(q.q) : Promise.all(cfg.polymarket_queries.map((s) => C.polymarketSearch(s))).then((r) => ({ tracked: r }))),
  hormuz: async (q) => { const [pw, sl] = await Promise.all([C.portwatchHormuz().then((d) => ({ ok: true, data: d })).catch((e) => ({ ok: false, error: e.message })), C.straitsBrief(q.date).then((d) => ({ ok: true, data: d })).catch((e) => ({ ok: false, error: e.message }))]); return { generated_utc: nowIso(), baseline_transits_per_day: cfg.hormuz.baseline_transits_per_day, proposed_tree: 'RED if PortWatch/AIS transits < 25% of the ~85/day baseline OR an active no-transit advisory OR war-risk cover withdrawn; AMBER = Brent > $100 without disruption (STATE.md IMPROVEMENT LOOP, ratify Nov 7)', portwatch: pw, straits_live: sl }; },
  dat: () => D.dat(),
  coin: (q) => C.cgCoin(q.id || 'bitcoin'),
  chart: (q) => C.cgChart(q.id || 'bitcoin', q.days ? +q.days : 365),
  search: (q) => C.cgSearch(q.q || 'bitcoin'),
  'coinbase-products': async () => {
    const list = await C.cbProducts(); const ids = new Set(list.map((p) => p.id));
    const check = cfg.coins.filter((c) => c.cb).map((c) => { const p = list.find((x) => x.id === c.cb); return { symbol: c.symbol, cb: c.cb, listed: ids.has(c.cb), status: p ? p.status : null, trading_disabled: p ? p.trading_disabled : null }; });
    return { generated_utc: nowIso(), products_total: list.length, configured: check, missing: check.filter((c) => !c.listed).map((c) => c.cb), usd_products_sample: list.filter((p) => p.quote_currency === 'USD' && p.status === 'online').map((p) => p.id).sort().slice(0, 400) };
  },
  rss: (q) => C.rss(q.feed || 'fed'),
  edgar: (q) => C.edgarFullText(q.q || '"bitcoin"', q.from, q.to, q.forms),
  fetch: (q) => C.proxyFetch(q.url, { text: false, max: q.max ? +q.max : 1500000 }),
  text: (q) => C.proxyFetch(q.url, { text: true, max: q.max ? +q.max : 20000 }),
  health: () => D.health(),
  config: async () => ({ generated_utc: nowIso(), hub_version: HUB_VERSION, config: cfg }),
  ks: async () => {
    const t = (f) => f().then((d) => d).catch(() => null);
    const [fredD, stables, structure, macroD, farsideBtc, fundingD, global] = await Promise.all([t(D.fred), t(D.stablecoins), t(D.btcStructure), t(D.macro), t(() => C.farside('btc')), t(D.funding), t(C.cgGlobal)]);
    return { generated_utc: nowIso(), ...D.ksPregrade({ fredD, stables, structure, macroD, farsideBtc, fundingD, global }) };
  },
};

export default async function handler(req, res) {
  const t0 = Date.now();
  const url = new URL(req.url, 'http://localhost');
  const q = Object.fromEntries(url.searchParams.entries());
  // also accept /api/hub/<fn> style paths
  let fn = q.fn || url.pathname.replace(/^\/api\/(hub\/?)?/, '').replace(/\/$/, '') || 'index';
  fn = fn.toLowerCase();
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Hub-Version', HUB_VERSION);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  const route = routes[fn];
  if (!route) { res.status(404).json({ error: `unknown endpoint "${fn}"`, endpoints: D.index().endpoints.map((e) => e.path) }); return; }
  try {
    const data = await route(q, req);
    if (typeof data === 'string') { res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.status(200).send(data); return; }
    if (q.format === 'text') { res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.status(200).send(JSON.stringify(data, null, 1)); return; }
    res.status(200).json(data && typeof data === 'object' && !Array.isArray(data) && !data.generated_utc ? { generated_utc: nowIso(), ms: Date.now() - t0, ...data } : data);
  } catch (e) {
    res.status(502).json({ error: String(e && e.message || e), endpoint: fn, params: q, generated_utc: nowIso(), ms: Date.now() - t0 });
  }
}
