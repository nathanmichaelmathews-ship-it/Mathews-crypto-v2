// test/mock_fetch.mjs — fixture responses shaped like each upstream API; importing this module replaces global fetch.
import cfg from '../config/hub.config.mjs';

const DAY = 86400;
const today = new Date(); today.setUTCHours(0, 0, 0, 0);
const ymd = (d) => new Date(d).toISOString().slice(0, 10);
export const calls = [];

function synthCandles(days, start, drift, vol = 0.03, seed = 1) {
  let p = start; const out = []; let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 - 0.5; };
  for (let i = days; i >= 0; i--) {
    const t = Math.floor(today.getTime() / 1000) - i * DAY;
    const open = p; p = p * (1 + drift + vol * rnd()); const close = p;
    out.push([t, Math.min(open, close) * 0.985, Math.max(open, close) * 1.015, open, close, 1000 + 500 * Math.abs(rnd())]);
  }
  return out.reverse(); // Coinbase returns newest first
}
const btcAll = synthCandles(1500, 30000, 0.0009, 0.025, 7);
const altAll = {}; for (const c of cfg.coins) if (c.cb) altAll[c.cb] = c.cb === 'BTC-USD' ? btcAll : synthCandles(1500, c.symbol === 'NEAR' ? 3 : c.symbol === 'AERO' ? 0.5 : c.symbol === 'HYPE' ? 60 : 10, 0.001, 0.05, c.symbol.length * 13);
const lastClose = (pid) => altAll[pid][0][4];

function csv(id, n, step, f) { let s = 'observation_date,' + id + '\n'; for (let i = n; i >= 0; i--) { const d = new Date(today.getTime() - i * step * 86400000); s += `${ymd(d)},${i % 17 === 0 ? '.' : f(i).toFixed(3)}\n`; } return s; }

function farsideHtml() {
  let rows = ''; for (let i = 25; i >= 0; i--) { const d = new Date(today.getTime() - i * 86400000); if ([0, 6].includes(d.getUTCDay())) continue; const v = (i % 5 === 0 ? -1 : 1) * (50 + i * 3); rows += `<tr><td>${d.getUTCDate()} ${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ${d.getUTCFullYear()}</td><td>${v > 0 ? v.toFixed(1) : '(' + Math.abs(v).toFixed(1) + ')'}</td><td>-</td><td>${(v * 2).toFixed(1)}</td></tr>`; }
  return `<html><body><table><tr><th>Date</th><th>IBIT</th><th>FBTC</th><th>Total</th></tr>${rows}</table></body></html>`;
}

function route(url, init) {
  calls.push(url);
  const u = new URL(url);
  const J = (o, status = 200, ct = 'application/json') => ({ status, ct, body: JSON.stringify(o) });
  const T = (s, status = 200, ct = 'text/plain') => ({ status, ct, body: s });
  if (u.hostname === 'api.coingecko.com') {
    if (u.pathname.endsWith('/coins/markets')) { const ids = u.searchParams.get('ids').split(','); return J(ids.filter((id) => id !== 'syrup' && id !== 'aster-2' && id !== 'walrus-2' && id !== 'spark-2').map((id, i) => ({ id, symbol: id.slice(0, 4), name: id, current_price: id === 'bitcoin' ? 84500 : 1 + i, market_cap: 1e9 * (i + 1), market_cap_rank: i + 1, fully_diluted_valuation: 2e9 * (i + 1), total_volume: 1e7 * (i + 1), high_24h: 2, low_24h: 0.9, price_change_percentage_24h: -3.21, ath: 10 + i, ath_date: '2025-01-01T00:00:00.000Z', circulating_supply: 1e9, total_supply: 2e9, max_supply: null, last_updated: new Date().toISOString(), price_change_percentage_1h_in_currency: 0.1, price_change_percentage_7d_in_currency: 5.5, price_change_percentage_14d_in_currency: 8, price_change_percentage_30d_in_currency: -12.5, price_change_percentage_1y_in_currency: 40 }))); }
    if (u.pathname.endsWith('/global')) return J({ data: { market_cap_percentage: { btc: 58.2, eth: 11.1 }, total_market_cap: { usd: 2.9e12 }, market_cap_change_percentage_24h_usd: -1.2 } });
    if (u.pathname.includes('public_treasury')) return J({ companies: [{ name: 'Strategy', symbol: 'NASDAQ:MSTR', country: 'US', total_holdings: 640000, total_current_value_usd: 5.4e10, percentage_of_total_supply: 3.05 }, { name: 'Metaplanet Inc.', symbol: 'TYO:3350', country: 'JP', total_holdings: 30000, total_current_value_usd: 2.5e9, percentage_of_total_supply: 0.14 }] });
    if (u.pathname.endsWith('/search')) return J({ coins: [{ id: 'aster-2', symbol: 'aster', name: 'Aster', market_cap_rank: 90 }] });
    if (u.pathname.endsWith('/derivatives')) return J([{ market: 'Binance (Futures)', symbol: 'BTCUSDT', index_id: 'BTC', price: '84500', contract_type: 'perpetual', funding_rate: 0.01, open_interest: 1.2e10, volume_24h: 3e10, basis: 0.01, spread: 0.01, last_traded_at: 1 }, { market: 'Hyperliquid', symbol: 'HYPE', index_id: 'HYPE', price: '91', contract_type: 'perpetual', funding_rate: -0.002, open_interest: 1e9, volume_24h: 2e9 }]);
    if (u.pathname.includes('/coins/') && u.pathname.includes('market_chart')) return J({ prices: [[Date.now() - 86400000, 1], [Date.now(), 2]] });
    if (u.pathname.includes('/coins/')) return J({ id: 'near', market_data: { current_price: { usd: 5.3 }, ath: { usd: 20 } } });
  }
  if (u.hostname === 'api.exchange.coinbase.com') {
    const m = u.pathname.match(/^\/products\/([^/]+)\/(ticker|stats|candles|book)$/);
    if (u.pathname === '/products/stats') return process.env.TEST_STATS_ALL ? J(Object.fromEntries(Object.keys(altAll).map((pid) => [pid, { stats_24hour: { open: lastClose(pid) * 0.98, high: lastClose(pid) * 1.2, low: lastClose(pid) * 0.9, last: lastClose(pid), volume: 1000 }, stats_30day: { volume: 30000 } }]))) : J({ message: 'NotFound' }, 404);
    if (u.pathname === '/products') return J(Object.keys(altAll).filter((p) => p !== 'GRASS-USD').map((id) => ({ id, base_currency: id.split('-')[0], quote_currency: 'USD', status: 'online', trading_disabled: false })));
    if (m) {
      const pid = m[1]; if (!altAll[pid] || pid === 'GRASS-USD') return J({ message: 'NotFound' }, 404);
      const last = lastClose(pid);
      if (m[2] === 'ticker') return J({ trade_id: 1, price: String(last), size: '1', time: new Date().toISOString(), bid: String(last * 0.999), ask: String(last * 1.001), volume: '12345' });
      if (m[2] === 'stats') return J({ open: String(last * 0.98), high: String(pid === 'ONDO-USD' ? 0.62 : last * 1.05), low: String(last * 0.95), last: String(last), volume: '12345', volume_30day: '400000' });
      if (m[2] === 'book') return J({ bids: Array.from({ length: 50 }, (_, i) => [String(last * (1 - 0.0005 * (i + 1))), '100', 3]), asks: Array.from({ length: 50 }, (_, i) => [String(last * (1 + 0.0005 * (i + 1))), '100', 3]), time: new Date().toISOString() });
      if (m[2] === 'candles') { const s = Math.floor(new Date(u.searchParams.get('start')).getTime() / 1000), e = Math.floor(new Date(u.searchParams.get('end')).getTime() / 1000); return J(altAll[pid].filter((r) => r[0] >= s - DAY && r[0] <= e)); }
    }
  }
  if (u.hostname === 'api.coinbase.com') return J({ pricebook: { product_id: 'X', bids: Array.from({ length: 250 }, (_, i) => ({ price: String(1 - 0.0005 * (i + 1)), size: '1000' })), asks: Array.from({ length: 250 }, (_, i) => ({ price: String(1 + 0.0005 * (i + 1)), size: '1000' })), time: new Date().toISOString() } });
  if (u.hostname === 'fred.stlouisfed.org') { const id = u.searchParams.get('id'); const daily = ['RRPONTSYD', 'BAMLH0A0HYM2', 'DFEDTARU', 'DFF', 'DGS2', 'DGS10', 'T10Y2Y', 'DTWEXBGS', 'VIXCLS', 'DCOILBRENTEU'].includes(id);
    const f = { WALCL: (i) => 6.6e6 + i * 500, WTREGEN: (i) => 850 - i * 2, RRPONTSYD: (i) => 20 + (i % 7), BAMLH0A0HYM2: (i) => 2.8 - i * 0.001, SAHMREALTIME: () => -0.07, DFEDTARU: (i) => (i > 12 ? 4.25 : 4.5), DFF: () => 4.33, DGS2: (i) => 3.6 + i * 0.002, DGS10: () => 4.2, T10Y2Y: () => 0.5, DTWEXBGS: () => 120, VIXCLS: () => 16, DCOILBRENTEU: () => 101 }[id] || (() => 1);
    return T(csv(id, daily ? 700 : (id === 'SAHMREALTIME' ? 36 : 120), daily ? 1 : (id === 'SAHMREALTIME' ? 30 : 7), f), 200, 'text/csv'); }
  if (u.hostname === 'stablecoins.llama.fi') { if (u.pathname.startsWith('/stablecoincharts')) return J(Array.from({ length: 120 }, (_, i) => ({ date: String(Math.floor(today.getTime() / 1000) - (119 - i) * DAY), totalCirculatingUSD: { peggedUSD: 2.9e11 + i * 1.5e8 } }))); return J({ peggedAssets: [{ name: 'Tether', symbol: 'USDT', circulating: { peggedUSD: 1.83e11 }, circulatingPrevDay: { peggedUSD: 1.829e11 }, circulatingPrevWeek: { peggedUSD: 1.82e11 }, circulatingPrevMonth: { peggedUSD: 1.8e11 }, price: 1 }, { name: 'USDC', symbol: 'USDC', circulating: { peggedUSD: 7.5e10 }, circulatingPrevWeek: { peggedUSD: 7.4e10 }, circulatingPrevMonth: { peggedUSD: 7.3e10 } }] }); }
  if (u.hostname === 'api.llama.fi') {
    if (u.pathname === '/v2/chains') return J([{ name: 'Ethereum', tvl: 6e10, tokenSymbol: 'ETH' }, { name: 'Solana', tvl: 9e9, tokenSymbol: 'SOL' }, { name: 'Hyperliquid L1', tvl: 3e9, tokenSymbol: 'HYPE' }, { name: 'Near', tvl: 2e8, tokenSymbol: 'NEAR' }]);
    if (u.pathname === '/protocols') return J([{ slug: 'aerodrome-slipstream', name: 'Aerodrome Slipstream', symbol: 'AERO', category: 'Dexs', tvl: 5e8, chains: ['Base'] }, { slug: 'morpho', name: 'Morpho', symbol: 'MORPHO', category: 'Lending', tvl: 6e9, chains: ['Ethereum', 'Base'] }]);
    if (u.pathname.startsWith('/tvl/')) { const slug = u.pathname.split('/')[2]; if (['morpho-blue', 'pumpfun', 'syrup', 'aerodrome'].includes(slug)) return J({ message: 'not found' }, 400); return J(1.23e9); }
    if (u.pathname.startsWith('/summary/fees/')) { const slug = u.pathname.split('/')[3]; if (['pump.fun'].includes(slug) && u.searchParams.get('dataType') === 'dailyHoldersRevenue') return J({ message: 'no data' }, 400); return J({ name: slug, total24h: 1.2e6, total7d: 8e6, total30d: 3.3e7, totalAllTime: 9e8, change_1d: -2.5 }); }
    if (u.pathname.startsWith('/emission/')) return J({ name: 'Hyperliquid', events: [] });
  }
  if (u.hostname === 'api.hyperliquid.xyz') return J([{ universe: [{ name: 'BTC', maxLeverage: 40 }, { name: 'HYPE', maxLeverage: 5 }, { name: 'NEAR', maxLeverage: 10 }] }, [{ funding: '0.0000125', openInterest: '25000', prevDayPx: '85000', dayNtlVlm: '3.1e9', premium: '0.0001', oraclePx: '84500', markPx: '84510', midPx: '84505' }, { funding: '-0.00002', openInterest: '9000000', prevDayPx: '95', dayNtlVlm: '4e8', premium: '-0.0003', oraclePx: '91.4', markPx: '91.5', midPx: '91.45' }, { funding: '0.00001', openInterest: '2000000', prevDayPx: '5.1', dayNtlVlm: '2e7', premium: '0', oraclePx: '5.37', markPx: '5.38', midPx: '5.375' }]]);
  if (u.hostname === 'www.okx.com') { if (u.pathname.includes('rubik')) return J({ code: '0', data: Array.from({ length: 30 }, (_, i) => [String(Date.now() - (29 - i) * 86400000), String(1e10 + i * 1e7), String(5e10)]) }); if (u.searchParams.get('instId') === 'TAO-USDT-SWAP') return J({ code: '51001', msg: 'Instrument ID does not exist', data: [] }); if (u.pathname.includes('funding-rate')) return J({ code: '0', data: [{ fundingRate: '0.000045', nextFundingRate: '0.00005', fundingTime: String(Date.now()), instId: u.searchParams.get('instId') }] }); if (u.pathname.includes('open-interest')) return J({ code: '0', data: [{ instId: 'X', oi: '100000', oiCcy: '30000', oiUsd: '2.5e9', ts: String(Date.now()) }] }); return J({ code: '0', data: [{ last: '84500', vol24h: '1', volCcy24h: '50000' }] }); }
  if (u.hostname === 'api.bybit.com') return J({ retCode: 0, result: { list: [{ symbol: u.searchParams.get('symbol'), lastPrice: '84500', fundingRate: '0.0001', openInterest: '60000', openInterestValue: '5.1e9', turnover24h: '2e10', volume24h: '1', nextFundingTime: String(Date.now()) }] } });
  if (u.hostname === 'www.deribit.com') { if (u.pathname.includes('volatility')) return J({ result: { data: Array.from({ length: 30 }, (_, i) => [Date.now() - (29 - i) * 86400000, 40, 42, 38, 39 + (i % 3)]) } }); return J({ result: [{ instrument_name: 'BTC-PERPETUAL', mark_price: 84500, open_interest: 7.5e8, funding_8h: 0.00015, current_funding: 0.0001, volume_usd: 1.2e9, price_change: -1.1 }] }); }
  if (u.hostname === 'fapi.binance.com') return T('<html>451 Unavailable For Legal Reasons</html>', 451, 'text/html');
  if (u.hostname.endsWith('finance.yahoo.com')) { const sym = decodeURIComponent(u.pathname.split('/').pop()); const n = 130; const ts = Array.from({ length: n }, (_, i) => Math.floor(today.getTime() / 1000) - (n - 1 - i) * DAY).filter((t) => ![0, 6].includes(new Date(t * 1000).getUTCDay())); const base = sym === '^MOVE' ? 96 : sym === 'BZ=F' ? 101 : sym === 'DX-Y.NYB' ? 98 : sym === '^TNX' ? 42 : 100;
    return J({ chart: { result: [{ meta: { symbol: sym, shortName: sym, currency: 'USD', regularMarketPrice: base, chartPreviousClose: base * 0.99, regularMarketTime: Math.floor(Date.now() / 1000) }, timestamp: ts, indicators: { quote: [{ close: ts.map((_, i) => base * (1 + 0.001 * Math.sin(i))), high: ts.map(() => base * 1.01), low: ts.map(() => base * 0.99) }] } }], error: null } }); }
  if (u.hostname === 'api.alternative.me') return J({ data: Array.from({ length: 60 }, (_, i) => ({ value: String(50 + (i % 10)), value_classification: 'Neutral', timestamp: String(Math.floor(today.getTime() / 1000) - i * DAY) })) });
  if (u.hostname === 'farside.co.uk') return T(farsideHtml(), 200, 'text/html');
  if (u.hostname === 'gamma-api.polymarket.com') { if (u.pathname === '/public-search') return J({ events: [{ title: 'Fed decision in October 2026?', slug: 'fed-decision-october-2026', endDate: '2026-10-28', volume: 1.2e7, markets: [{ question: '25 bps decrease', slug: 'x', outcomes: '["Yes","No"]', outcomePrices: '["0.62","0.38"]', volume: '5e6', liquidity: '2e5', endDate: '2026-10-28', active: true, closed: false }] }] }); return J([{ title: 'Fed decision in October 2026?', slug: 'fed-decision-october-2026' }]); }
  if (u.hostname === 'community-api.coinmetrics.io') { const n = 5900; const data = Array.from({ length: n }, (_, i) => { const t = new Date(today.getTime() - (n - 1 - i) * 86400000); const p = 0.1 * Math.pow(1.0038, i); return { asset: 'btc', time: t.toISOString(), PriceUSD: String(p), CapMrktCurUSD: String(p * 1.9e7), CapRealUSD: String(p * 1.9e7 * 0.6), CapMVRVCur: String(1 / 0.6), IssContUSD: String(p * 450) }; }); return J({ data: u.searchParams.get('page_size') === '3' ? data.slice(-3) : data }); }
  if (u.hostname === 'raw.githubusercontent.com') return T('time,PriceUSD\n2010-07-18,0.08', 200, 'text/csv');
  if (u.hostname === 'services9.arcgis.com') return J({ features: Array.from({ length: 30 }, (_, i) => ({ attributes: { date: today.getTime() - (29 - i) * 86400000, portname: 'Strait of Hormuz', n_total: 1 + (i % 3), n_tanker: 1 } })) });
  if (u.hostname === 'straits.live') return T('<html><body><h1>Brief</h1><p>Day 211. The strait remains effectively closed; IMF PortWatch recorded 1 transit versus the ~85/day baseline.</p></body></html>', 200, 'text/html');
  if (u.hostname === 'www.federalreserve.gov') return T('<rss><channel><item><title>FOMC statement</title><link>https://www.federalreserve.gov/x</link><pubDate>Wed, 16 Sep 2026 18:00:00 GMT</pubDate><description><![CDATA[<p>Statement</p>]]></description></item></channel></rss>', 200, 'application/rss+xml');
  if (u.hostname === 'efts.sec.gov') return J({ hits: { total: { value: 1 }, hits: [{ _id: '0001234567-26-000001:doc.htm', _source: { file_date: '2026-09-10', form_type: 'S-1/A', display_names: ['Ondo ETF'], ciks: ['2061627'] } }] } });
  return T('not mocked: ' + url, 404, 'text/plain');
}

globalThis.fetch = async (url, init) => {
  const r = route(String(url), init);
  return { ok: r.status >= 200 && r.status < 300, status: r.status, headers: new Map([['content-type', r.ct]]), text: async () => r.body };
};

