// test/run.mjs — OFFLINE test harness: mocked upstreams (test/mock_fetch.mjs) → every collector / derived function / route. `node test/run.mjs`; exit 1 on failure.
import cfg from '../config/hub.config.mjs';
import { calls } from './mock_fetch.mjs';
const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const today = new Date(); today.setUTCHours(0, 0, 0, 0);
const D = await import('../lib/derived.mjs');
const C = await import('../lib/collectors.mjs');
const hub = (await import('../api/hub.js')).default;
const pricesFn = (await import('../api/prices.js')).default;

let fails = 0; const ok = (name, cond, extra = '') => { if (cond) console.log(`  ✓ ${name} ${extra}`); else { fails++; console.log(`  ✗ ${name} ${extra}`); } };
const run = async (name, fn, check) => { const t0 = Date.now(); try { const v = await fn(); const c = check ? check(v) : true; ok(name, c, `${Date.now() - t0}ms`); return v; } catch (e) { fails++; console.log(`  ✗ ${name} THREW ${e.stack.split('\n').slice(0, 3).join(' | ')}`); return null; } };

console.log('== derived ==');
const p = await run('prices', () => D.prices({}), (v) => v.prices.length > 40 && v.prices.find((x) => x.symbol === 'NEAR').usd > 0 && v.prices.find((x) => x.symbol === 'BTC').price_source === 'coinbase' && v.prices.find((x) => x.symbol === 'XMR').price_source === 'coingecko');
ok('prices: unlisted coinbase product handled (GRASS)', p && p.prices.find((x) => x.symbol === 'GRASS').price_source === 'coingecko' && p.prices.find((x) => x.symbol === 'GRASS').coinbase_error);
ok('prices: 24h label carries the minus sign', p && p.prices[0].change_24h_label.startsWith('-3.21% (DOWN)'));
const feed = await run('legacyFeed', () => D.legacyFeed({}), (v) => v.prices.length > 40 && v.prices.every((r) => 'symbol' in r && 'coingecko_id' in r && 'usd' in r && 'change_24h_pct' in r && 'volume_24h_usd' in r && 'market_cap_usd' in r) && v.prices.some((r) => r.symbol === 'SYRUP'));
const bk = await run('book', () => D.book(p), (v) => v.totals.book_total > 0 && v.positions.length === 10 && v.orders.length === 15);
ok('book: possible fill flagged when 24h high ≥ sell limit (ONDO 0.61 vs mocked high 0.62)', bk && bk.orders.find((o) => o.symbol === 'ONDO').possible_fill_24h === true);
const st = await run('btcStructure', () => D.btcStructure({}), (v) => v.completed_weeks >= 200 && v.last_completed_week.sma50 > 0 && v.next_close_gates.gate_50w > 0 && typeof v.last_completed_week.sma20_rising_strict === 'boolean' && v.power_law.fair_value > 0);
ok('structure: gate_50w = mean of last 49 completed closes', st && Math.abs(st.next_close_gates.gate_50w - st.weekly_closes_last12.slice(-12).reduce(() => 0, 0) - st.next_close_gates.gate_50w) < 1e-6);
const cd = await run('candles NEAR since', () => D.candles({ symbol: 'NEAR', days: 100, since: ymd(new Date(today.getTime() - 11 * 86400000)) }), (v) => v.rows_newest_first.length >= 90 && v.highest_close_since && v.close_90d_ago > 0 && v.rows_newest_first[0].partial === true);
await run('wave weekly', () => D.wave({}), (v) => v.coins.length >= 20 && v.coins.every((c) => c.error || c.stage_candidate) && Object.keys(v.sectors).length >= 5);
const fl = await run('flags', () => D.flags(), (v) => v.flags.length === 3 && v.flags.every((f) => !f.error && f.effective_level > 0 && typeof f.fired_on_last_completed_close === 'boolean'));
ok('flags: HYPE uses the fixed STATE level 68.06', fl && fl.flags.find((f) => f.symbol === 'HYPE').effective_level === 68.06);
await run('depth', () => D.depth({ symbol: 'ONDO' }), (v) => v.depth_usd.bid_2pct > 0 && v.levels.bids === 250);
const fr = await run('fred', () => D.fred({}), (v) => v.derived.net_liquidity && v.derived.net_liquidity.change_13w_pct !== null && v.derived.hy_oas.change_4w_bp !== null && v.derived.fed.last_change && v.derived.sahm);
ok('fred: Fed last change detected as HIKE 4.25→4.5 (fixture)', fr && fr.derived.fed.last_change.direction === 'HIKE' && fr.derived.fed.hike_within_90d === true);
await run('stablecoins', () => D.stablecoins(), (v) => v.total_b > 200 && v.change_8w_pct !== null && v.ks4_grade === 'GREEN' && v.top10.length === 2);
const fu = await run('funding', () => D.funding({}), (v) => v.table.length > 5 && v.btc_funding_8h_pct.venues >= 3 && v.sources.binance.includes('451'));
ok('funding: OKX missing instrument surfaces as error, not crash', fu && fu.table.find((t) => t.coin === 'TAO').okx && fu.table.find((t) => t.coin === 'TAO').okx.error);
await run('macro', () => D.macro({}), (v) => v.derived.move && v.derived.move.weekly_closes.length >= 2 && v.derived.brent.last > 100 && v.derived.us10y_pct === 4.2);
await run('onchain', () => D.onchain(), (v) => v.mvrv_z !== null && v.pi_cycle.ma111 > 0 && v.puell_multiple !== null && v.sma200w_from_cm > 0);
const ll = await run('llama', () => D.llama({}), (v) => v.protocols.length === 9 && v.protocols.filter((x) => !x.error).length >= 8 && v.chains.length === 4);
ok('llama: slug fallback (MORPHO → morpho after morpho-blue 400; AERO → aerodrome-slipstream)', ll && ll.protocols.find((x) => x.symbol === 'MORPHO').slug === 'morpho' && ll.protocols.find((x) => x.symbol === 'AERO').slug === 'aerodrome-slipstream');
await run('llamaSearch', () => D.llamaSearch({ q: 'aero' }), (v) => v.matches.length === 1);
await run('dat', () => D.dat(), (v) => v.strategy.holdings && v.strategy.holdings.total_holdings_btc === 640000 && v.metaplanet.holdings);
await run('farside', () => C.farside('btc'), (v) => v.days.length >= 10 && typeof v.consecutive_outflow_days === 'number' && v.weeks.length >= 3 && v.last_day.total_musd !== null);
await run('polymarket', () => C.polymarketSearch('Fed decision'), (v) => v.events[0].markets[0].probabilities_pct.Yes === 62);
await run('portwatch', () => C.portwatchHormuz(), (v) => v.transit_field_guess === 'n_total' && v.pct_of_baseline_last7 < 10);
await run('straits', () => C.straitsBrief(), (v) => v.transits_mentioned === 1);
await run('rss', () => C.rss('fed'), (v) => v.items.length === 1 && v.items[0].title === 'FOMC statement');
await run('edgar', () => C.edgarFullText('"333-288870"', '2026-09-01', '2026-09-30'), (v) => v.total === 1);
await run('proxyFetch whitelist ok', () => C.proxyFetch('https://api.llama.fi/v2/chains'), (v) => Array.isArray(v.json));
await run('proxyFetch blocked host throws', () => C.proxyFetch('https://evil.example.com/x').then(() => { throw new Error('should have thrown'); }).catch((e) => e.message), (m) => /not whitelisted/.test(m));
await run('okxOiHistory', () => C.okxOiHistory('BTC'), (v) => v.rows.length === 30 && v.oi_change_1d_pct !== null);
const all = await run('all', () => D.all({}), (v) => Object.keys(v.sections).length >= 15 && v.status.prices.startsWith('ok') && v.status.book.startsWith('ok') && v.sections.ks_pregrade.data.score_mechanical >= 0);
ok('all: ks pregrade has grades for the mechanical signals', all && ['liquidity', 'credit', 'trend', 'stablecoins', 'etf', 'leverage'].every((k) => all.sections.ks_pregrade.data.signals[k].grade));
const br = await run('brief', () => D.brief(), (v) => typeof v === 'string' && v.includes('== BOOK ==') && v.includes('== BTC STRUCTURE') && v.includes('DOWN') && v.length > 2000);
await run('health', () => D.health(), (v) => v.total >= 15 && v.ok_count >= 14 && v.sources.binance.ok === false);
await run('index', async () => D.index(), (v) => v.endpoints.length > 30);

console.log('== handlers ==');
function mockRes() { const r = { headers: {}, code: null, body: null, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; }, send(s) { this.body = s; return this; }, end() { return this; } }; return r; }
for (const path of ['/api/hub?fn=index', '/api/hub?fn=prices&group=portfolio', '/api/hub?fn=book', '/api/hub?fn=btc-structure', '/api/hub?fn=candles&symbol=AERO&since=2026-09-16', '/api/hub?fn=wave&set=weekly', '/api/hub?fn=flags', '/api/hub?fn=fred&series=WALCL,WTREGEN,RRPONTSYD', '/api/hub?fn=stablecoins', '/api/hub?fn=funding', '/api/hub?fn=macro', '/api/hub?fn=etf-flows&asset=btc', '/api/hub?fn=hormuz', '/api/hub?fn=derivatives&symbol=HYPE', '/api/hub?fn=coinbase-products', '/api/hub?fn=config', '/api/hub?fn=ks', '/api/hub?fn=health', '/api/hub?fn=brief', '/api/hub?fn=nope', '/api/hub?fn=fetch&url=https://api.llama.fi/v2/chains', '/api/hub?fn=text&url=https://straits.live/briefs/2026-09-27']) {
  const res = mockRes(); await hub({ url: path, method: 'GET' }, res);
  const good = path.includes('nope') ? res.code === 404 : (res.code === 200 && res.headers['Cache-Control'].includes('no-store'));
  ok(`route ${path}`, good, `→ ${res.code} ${typeof res.body === 'string' ? res.body.slice(0, 60).replace(/\n/g, ' ') : JSON.stringify(res.body).slice(0, 80)}`);
}
{ const res = mockRes(); await pricesFn({ url: '/api/prices?x=1', method: 'GET' }, res); ok('legacy /prices.json handler', res.code === 200 && res.body.prices.length > 40 && res.body.timestamp_utc && res.body.error === null, `${res.body.prices.length} coins`); }
{ process.env.TEST_STATS_ALL = '1'; const v = await D.prices({ group: 'portfolio' }); ok('prices via /products/stats (all-stats mode)', v.coinbase_mode === 'all-stats' && v.prices.every((r) => r.usd > 0)); delete process.env.TEST_STATS_ALL; }

console.log(`\n${fails === 0 ? 'ALL PASSED' : fails + ' FAILED'} · ${calls.length} mocked fetches`);
process.exit(fails ? 1 : 0);
