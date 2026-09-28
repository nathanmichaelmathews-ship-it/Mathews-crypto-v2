// lib/derived.mjs — analytics on top of the collectors: merged prices, BTC structure (20W/50W/200W gates), wave-board
// stages, runner flags, book/orders, funding summary, FRED net liquidity, stablecoin deltas, KS v3 pre-grade, on-chain
// metrics, the consolidated /api/all, the plain-text /api/brief and /api/health.
import cfg from '../config/hub.config.mjs';
import * as C from './collectors.mjs';
import { timed, pmap, num, round, pctChange, pctLabel, mean, std, sum, ymd, daysBetween, weekEndingSunday, nowIso, HUB_VERSION, fmtUsd, fetchJSON } from './util.mjs';

export const coinBySymbol = (s) => cfg.coins.find((c) => c.symbol === String(s || '').toUpperCase());
export const allCgIds = () => cfg.coins.flatMap((c) => [c.cg, ...(c.cg_alt || [])]).filter(Boolean);
const groupsOf = (g) => (g ? String(g).split(',').map((x) => x.trim()) : null);

// ====================================================================== PRICES (Coinbase primary for Coinbase-listed names, CoinGecko for the rest + mcap/volume/%)
export async function prices({ group, symbols } = {}) {
  let coins = cfg.coins.filter((c) => c.group !== 'ref' || (groupsOf(group) || []).includes('ref'));
  if (group) coins = cfg.coins.filter((c) => groupsOf(group).includes(c.group));
  if (symbols) { const want = String(symbols).toUpperCase().split(',').map((s) => s.trim()); coins = cfg.coins.filter((c) => want.includes(c.symbol)); }
  const cbList = coins.filter((c) => c.cb).map((c) => c.cb);
  const [cg, statsAll] = await Promise.all([timed(() => C.cgMarkets(coins.flatMap((c) => [c.cg, ...(c.cg_alt || [])]))), C.cbStatsAll()]);
  // Coinbase: all-stats endpoint if it worked, else per-product tickers+stats (bounded concurrency)
  let cb = {};
  if (statsAll) {
    for (const pid of cbList) { const s = statsAll[pid]; if (!s) continue; const st = s.stats_24hour || s; cb[pid] = { last: num(st.last), open: num(st.open), high: num(st.high), low: num(st.low), volume: num(st.volume), volume_30d: s.stats_30day ? num(s.stats_30day.volume) : null, time: null, source: 'coinbase /products/stats' }; }
  }
  const missing = cbList.filter((p) => !cb[p]);
  if (missing.length) {
    const res = await pmap(missing, 4, async (pid) => { // ≤ 8 req/s against Coinbase's 10 req/s public limit
      const [t, s] = await Promise.all([C.cbTicker(pid).catch((e) => ({ error: e.message })), C.cbStats(pid).catch((e) => ({ error: e.message }))]);
      if (t.error && s.error) return { pid, error: `${t.error}` };
      return { pid, last: num(t.price) ?? num(s.last), bid: num(t.bid), ask: num(t.ask), open: num(s.open), high: num(s.high), low: num(s.low), volume: num(s.volume) ?? num(t.volume), volume_30d: num(s.volume_30day), time: t.time || null, source: 'coinbase /ticker + /stats' };
    });
    for (const r of res) if (r && r.pid && !r.error) cb[r.pid] = r; else if (r && r.pid) cb[r.pid] = { error: r.error };
  }
  const rows = coins.map((c) => {
    const ids = [c.cg, ...(c.cg_alt || [])]; const g = cg.ok ? ids.map((id) => cg.data[id]).find(Boolean) : null;
    const k = c.cb ? cb[c.cb] : null; const kOk = k && !k.error && k.last !== null && k.last !== undefined;
    const usd = kOk ? k.last : (g ? g.current_price : null);
    const chg24 = g ? g.price_change_percentage_24h : (kOk && k.open ? (k.last / k.open - 1) * 100 : null);
    const ch = c.cycle_high && c.cycle_high.value ? c.cycle_high.value : null;
    return {
      symbol: c.symbol, name: c.name, group: c.group, sectors: c.sectors, coingecko_id: g ? g.id : c.cg, coinbase_product: c.cb,
      usd, price_source: kOk ? 'coinbase' : (g ? 'coingecko' : 'none'), usd_coinbase: kOk ? k.last : null, usd_coingecko: g ? g.current_price : null, coinbase_bid: kOk ? (k.bid ?? null) : null, coinbase_ask: kOk ? (k.ask ?? null) : null,
      coinbase_24h: kOk ? { open: k.open, high: k.high, low: k.low, volume_base: k.volume, volume_30d_base: k.volume_30d, ticker_time: k.time } : null,
      change_24h_pct: chg24 === null || chg24 === undefined ? null : round(chg24, 3), change_24h_label: chg24 === null || chg24 === undefined ? null : pctLabel(chg24 / 100),
      change_1h_pct: g ? round(g.price_change_percentage_1h_in_currency, 3) : null, change_7d_pct: g ? round(g.price_change_percentage_7d_in_currency, 3) : null, change_7d_label: g ? pctLabel((g.price_change_percentage_7d_in_currency || 0) / 100) : null,
      change_14d_pct: g ? round(g.price_change_percentage_14d_in_currency, 3) : null, change_30d_pct: g ? round(g.price_change_percentage_30d_in_currency, 3) : null, change_30d_label: g ? pctLabel((g.price_change_percentage_30d_in_currency || 0) / 100) : null, change_1y_pct: g ? round(g.price_change_percentage_1y_in_currency, 2) : null,
      volume_24h_usd: g ? g.total_volume : null, market_cap_usd: g ? g.market_cap : null, market_cap_rank: g ? g.market_cap_rank : null, fdv_usd: g ? g.fully_diluted_valuation : null, fdv_over_mcap: g && g.market_cap && g.fully_diluted_valuation ? round(g.fully_diluted_valuation / g.market_cap, 2) : null,
      circulating_supply: g ? g.circulating_supply : null, total_supply: g ? g.total_supply : null, max_supply: g ? g.max_supply : null,
      ath_usd: g ? g.ath : null, ath_date: g ? g.ath_date : null, pct_below_ath: g && g.ath && usd ? round((usd / g.ath - 1) * 100, 2) : null,
      cycle_high: c.cycle_high, pct_below_cycle_high: ch && usd ? round((usd / ch - 1) * 100, 2) : null,
      last_updated: g ? g.last_updated : (kOk ? k.time : null), coinbase_error: k && k.error ? k.error : null,
    };
  });
  return { generated_utc: nowIso(), count: rows.length, coingecko_ok: cg.ok, coingecko_error: cg.ok ? null : cg.error, coinbase_mode: statsAll ? 'all-stats' : 'per-product', prices: rows };
}
/** legacy /prices.json schema (unchanged keys) — now ALL configured coins incl. NEAR + SYRUP */
export async function legacyFeed(params = {}) {
  const t0 = Date.now(); const p = await prices(params);
  return { timestamp_utc: p.generated_utc, source: 'Coinbase Exchange (Coinbase-listed) + CoinGecko v3 /coins/markets — hub v' + HUB_VERSION, fetch_duration_ms: Date.now() - t0, error: p.coingecko_ok ? null : p.coingecko_error,
    prices: p.prices.map((r) => ({ symbol: r.symbol, coingecko_id: r.coingecko_id, usd: r.usd, change_24h_pct: r.change_24h_pct, volume_24h_usd: r.volume_24h_usd, market_cap_usd: r.market_cap_usd, last_updated_unix: r.last_updated ? Math.floor(new Date(r.last_updated).getTime() / 1000) : null, price_source: r.price_source, group: r.group })) };
}

// ====================================================================== CANDLES (clean, newest-first, with the Wave Board offsets)
export async function candles({ symbol = 'BTC', days = 100, since, granularity = 86400 } = {}) {
  const c = coinBySymbol(symbol); const pid = (c && c.cb) || (String(symbol).includes('-') ? symbol : `${String(symbol).toUpperCase()}-USD`);
  const asc = await C.cbCandles(pid, +days, +granularity);
  if (!asc.length) throw new Error(`no candles for ${pid}`);
  const today = ymd(new Date());
  const rows = asc.map((r) => ({ date: ymd(new Date(r[0] * 1000)), low: r[1], high: r[2], open: r[3], close: r[4], volume: r[5], partial: granularity === 86400 && ymd(new Date(r[0] * 1000)) === today }));
  const completed = rows.filter((r) => !r.partial);
  const closes = completed.map((r) => r.close); const n = completed.length;
  const at = (k) => (n > k ? completed[n - 1 - k] : null);
  const sinceRows = since ? completed.filter((r) => r.date >= since) : null;
  const hi = sinceRows && sinceRows.length ? sinceRows.reduce((a, r) => (r.close > a.close ? r : a)) : null;
  const w90 = completed.slice(-90);
  return { product: pid, granularity: +granularity, count: rows.length, first: rows[0].date, last: rows[rows.length - 1].date, last_is_partial: rows[rows.length - 1].partial,
    last_close: rows[rows.length - 1].close, last_completed: at(0), close_7d_ago: at(7) && at(7).close, close_30d_ago: at(30) && at(30).close, close_60d_ago: at(60) && at(60).close, close_90d_ago: at(90) && at(90).close,
    ret_7d_pct: at(7) ? round((at(0).close / at(7).close - 1) * 100, 2) : null, ret_30d_pct: at(30) ? round((at(0).close / at(30).close - 1) * 100, 2) : null, ret_60d_pct: at(60) ? round((at(0).close / at(60).close - 1) * 100, 2) : null, ret_90d_pct: at(90) ? round((at(0).close / at(90).close - 1) * 100, 2) : null,
    min_low_90d: w90.length ? Math.min(...w90.map((r) => r.low)) : null, max_high_90d: w90.length ? Math.max(...w90.map((r) => r.high)) : null, max_close_all: Math.max(...closes), highest_close_since: hi ? { since, date: hi.date, close: hi.close } : null,
    rows_newest_first: [...rows].reverse() };
}

// ====================================================================== BTC STRUCTURE (canonical Coinbase weekly closes → 20W / 50W / 200W, gates, rising tests, T09 levels, power law)
export async function btcStructure({ days = 1460 } = {}) {
  const asc = await C.cbCandles('BTC-USD', +days, 86400);
  if (asc.length < 400) throw new Error(`only ${asc.length} BTC daily candles`);
  const nowSec = Date.now() / 1000;
  const weeks = new Map();
  for (const r of asc) { const k = weekEndingSunday(r[0]); const prev = weeks.get(k); if (!prev || r[0] > prev.t) weeks.set(k, { t: r[0], close: r[4], date: ymd(new Date(r[0] * 1000)) }); }
  const wk = [...weeks.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([week_ending, v]) => ({ week_ending, last_day: v.date, close: v.close, completed: (Date.UTC(+week_ending.slice(0, 4), +week_ending.slice(5, 7) - 1, +week_ending.slice(8, 10)) / 1000 + 86400) <= nowSec }));
  const done = wk.filter((w) => w.completed); const closes = done.map((w) => w.close); const n = closes.length;
  const live = wk.find((w) => !w.completed) || null; // the in-progress week
  const lastDaily = asc[asc.length - 1]; const spot = lastDaily[4];
  const sma = (k, offset = 0) => (n - offset >= k ? mean(closes.slice(n - offset - k, n - offset)) : null);
  const s20 = sma(20), s50 = sma(50), s200 = sma(200), s20p = sma(20, 1), s50p = sma(50, 1), s200p = sma(200, 1), s20_4 = sma(20, 4), s20_3 = sma(20, 3);
  const lastClose = closes[n - 1], lastWeek = done[n - 1];
  // gates for the NEXT completed close X (the in-progress week): SMA_k(after X) = (sum of last k-1 closes + X)/k ; break-even X* = mean(last k-1)
  const gate = (k) => (n >= k - 1 ? mean(closes.slice(n - (k - 1))) : null);
  const off = (k) => (n >= k ? closes[n - k] : null); // the close that rolls off when X arrives
  const sum19 = n >= 19 ? sum(closes.slice(n - 19)) : null;
  const strictRise20 = off(20); // X > close 20 weeks ago → 20W ticks up
  const slope4Rise20 = (s20_3 !== null && sum19 !== null) ? 20 * s20_3 - sum19 : null; // X > this → 20W(after X) > 20W four weeks before X (= SMA20 at offset 3 from the last completed close)
  // streaks
  let above50 = 0; for (let i = n - 1; i >= 49; i--) { const s = mean(closes.slice(i - 49, i + 1)); if (closes[i] > s) above50++; else break; }
  let below50Before = 0; if (above50 > 0) { for (let i = n - 1 - above50; i >= 49; i--) { const s = mean(closes.slice(i - 49, i + 1)); if (closes[i] <= s) below50Before++; else break; } }
  let above20 = 0; for (let i = n - 1; i >= 19; i--) { const s = mean(closes.slice(i - 19, i + 1)); if (closes[i] > s) above20++; else break; }
  // weekly RSI(14) Wilder on completed closes
  let rsi = null; if (n > 15) { let g = 0, l = 0; for (let i = 1; i <= 14; i++) { const d = closes[i] - closes[i - 1]; if (d > 0) g += d; else l -= d; } g /= 14; l /= 14; for (let i = 15; i < n; i++) { const d = closes[i] - closes[i - 1]; g = (g * 13 + Math.max(d, 0)) / 14; l = (l * 13 + Math.max(-d, 0)) / 14; } rsi = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
  // 90-day high / T09 levels (live recompute) + cycle high check + power law
  const d90 = asc.slice(-90); const high90 = Math.max(...d90.map((r) => r[2])); const high90Day = ymd(new Date(d90.reduce((a, r) => (r[2] > a[2] ? r : a))[0] * 1000));
  const maxDailyClose = Math.max(...asc.filter((r) => ymd(new Date(r[0] * 1000)) !== ymd(new Date())).map((r) => r[4]));
  const pl = cfg.levels.power_law; const dGen = daysBetween(pl.genesis, new Date()); const fv = pl.a * Math.pow(dGen, pl.k);
  const carriedHigh = cfg.levels.t09_90d_high_carried;
  const lv = (base, pcts) => pcts.map((p) => round(base * (1 + p), 0));
  return {
    generated_utc: nowIso(), source: 'Coinbase Exchange BTC-USD daily candles → weekly closes (Sunday 23:59:59 UTC)', daily_candles: asc.length, completed_weeks: n,
    spot, spot_time: new Date(lastDaily[0] * 1000).toISOString().slice(0, 10) + ' (today\'s partial candle close)',
    last_completed_week: { week_ending: lastWeek.week_ending, close: lastClose, sma20: round(s20, 2), sma50: round(s50, 2), sma200: round(s200, 2),
      close_vs_sma20_pct: round((lastClose / s20 - 1) * 100, 2), close_vs_sma50_pct: round((lastClose / s50 - 1) * 100, 2), close_vs_sma200_pct: s200 ? round((lastClose / s200 - 1) * 100, 2) : null,
      above_20w: lastClose > s20, above_50w: lastClose > s50, sma20_rising_strict: s20p !== null ? s20 > s20p : null, sma20_rising_4wk_slope: s20_4 !== null ? s20 > s20_4 : null, sma50_rising: s50p !== null ? s50 > s50p : null, sma200_rising: s200p !== null ? s200 > s200p : null,
      consecutive_weekly_closes_above_50w: above50, weeks_below_50w_before_reclaim: above50 ? below50Before : null, consecutive_weekly_closes_above_20w: above20, weekly_rsi14: round(rsi, 1), ext_vs_20w_pct: round((lastClose / s20 - 1) * 100, 2) },
    in_progress_week: live ? { week_ending: live.week_ending, running_close: live.close } : null,
    next_close_gates: { week_ending: live ? live.week_ending : null, note: 'X = the coming Sunday close. gate_k = the close at which the k-week SMA after the close equals the close (break-even). rising_*: X above these lifts the SMA.',
      gate_50w: round(gate(50), 2), gate_20w: round(gate(20), 2), gate_200w: round(gate(200), 2), sma50_after_flat_close: round((sum(closes.slice(n - 49)) + spot) / 50, 2),
      x_for_50w_to_rise: round(off(50), 2), x_for_20w_to_rise_strict: round(strictRise20, 2), x_for_20w_to_rise_4wk_slope: round(slope4Rise20, 2), x_for_200w_to_rise: round(off(200), 2),
      spot_vs_gate_50w_pct: gate(50) ? round((spot / gate(50) - 1) * 100, 2) : null, spot_vs_gate_20w_pct: gate(20) ? round((spot / gate(20) - 1) * 100, 2) : null },
    sma_now: { sma20: round(s20, 2), sma50: round(s50, 2), sma200: round(s200, 2), spot_vs_sma20_pct: round((spot / s20 - 1) * 100, 2), spot_vs_sma50_pct: round((spot / s50 - 1) * 100, 2), spot_vs_sma200_pct: s200 ? round((spot / s200 - 1) * 100, 2) : null },
    t09: { high_90d_live: high90, high_90d_date: high90Day, high_90d_carried_state: carriedHigh, confirmed_path_levels_live: lv(high90, cfg.levels.t09_confirmed_path_pct), unconfirmed_path_levels_live: lv(high90, cfg.levels.t09_unconfirmed_path_pct), confirmed_path_levels_carried: lv(carriedHigh, cfg.levels.t09_confirmed_path_pct), spot_vs_level1_confirmed_pct: round((spot / (high90 * (1 + cfg.levels.t09_confirmed_path_pct[0])) - 1) * 100, 2) },
    cycle_high: { reference_daily_close: cfg.levels.btc_cycle_high_close, max_completed_daily_close_in_window: maxDailyClose, new_cycle_high_printed: maxDailyClose > cfg.levels.btc_cycle_high_close, spot_vs_reference_pct: round((spot / cfg.levels.btc_cycle_high_close - 1) * 100, 2) },
    power_law: { days_since_genesis: dGen, fair_value: round(fv, 0), ratio_spot: round(spot / fv, 3), max_dca_zone: spot / fv < pl.max_dca_ratio, floor_fv_over_3: round(fv / 3, 0), resistance_fv_x3: round(fv * 3, 0) },
    weekly_closes_last12: done.slice(-12).map((w) => ({ week_ending: w.week_ending, close: w.close })),
    gates_recorded: { invalidation_weekly_close: cfg.levels.invalidation_weekly_close, add_zone_shift_weekly_close: cfg.levels.add_zone_shift_weekly_close },
  };
}

// ====================================================================== WAVE BOARD (mechanical stage candidates; the session applies the persistence filter)
export async function wave({ set = 'weekly', symbols } = {}) {
  let list = set === 'monthly' ? cfg.coins.filter((c) => ['portfolio', 'weekly', 'monthly'].includes(c.group) && c.cb).map((c) => c.symbol) : cfg.wave_weekly_set;
  if (symbols) list = String(symbols).toUpperCase().split(',').map((s) => s.trim());
  if (!list.includes('BTC')) list = ['BTC', ...list];
  const res = await pmap(list, 4, async (s) => ({ symbol: s, c: await candles({ symbol: s, days: 100 }) }));
  const byS = {}; for (const r of res) { if (r && r.symbol) byS[r.symbol] = r; }
  const btc = byS.BTC && byS.BTC.c; if (!btc) throw new Error('BTC candles failed: ' + (byS.BTC && byS.BTC.error));
  const btcHigh = cfg.levels.btc_cycle_high_close; const btcNewHigh = (btc.max_close_all > btcHigh);
  const btcWithin10 = btc.last_completed.close / btcHigh >= 0.90;
  const rows = [];
  for (const s of list) {
    const r = byS[s]; if (!r || r.error || !r.c) { rows.push({ symbol: s, error: (r && r.error) || 'no candles' }); continue; }
    const c = r.c; const meta = coinBySymbol(s); const ch = meta && meta.cycle_high && meta.cycle_high.value ? meta.cycle_high.value : null;
    const rs = (k) => (c[`ret_${k}d_pct`] !== null && btc[`ret_${k}d_pct`] !== null ? round(c[`ret_${k}d_pct`] - btc[`ret_${k}d_pct`], 2) : null);
    const last = c.last_completed.close; const below = ch ? round((last / ch - 1) * 100, 2) : null;
    const lowMult = c.min_low_90d ? round(last / c.min_low_90d, 2) : null;
    const extended = (c.ret_60d_pct !== null && c.ret_60d_pct >= 100) || (lowMult !== null && lowMult >= 3);
    const flags = []; let stage = 'NEUTRAL';
    const rs30 = rs(30), rs90 = rs(90);
    if (s !== 'BTC') {
      if (btcNewHigh && below !== null && below < -30) stage = 'MAXED';
      else if (below !== null && below < -20 && rs30 !== null && rs30 < 0 && btcWithin10) stage = 'ROLLING OVER (candidate — requires LEADING within the last 8 weekly reads)';
      else if (below !== null && below >= -15 && rs30 !== null && rs30 > 0) stage = 'LEADING';
      else if (rs30 !== null && rs30 >= 10 && below !== null && below < -40) stage = 'EMERGING';
      else if (below !== null && below < -50 && rs90 !== null && rs90 <= 0) stage = 'DORMANT';
      else if (below === null) stage = 'NEUTRAL (no cycle-high reference)';
    }
    if (extended) flags.push('EXTENDED');
    if (c.max_high_90d && ch && c.max_high_90d > ch) flags.push(`NEW CYCLE HIGH in window (${c.max_high_90d} > ${ch})`);
    rows.push({ symbol: s, sectors: meta ? meta.sectors : [], last_close: last, last_close_date: c.last_completed.date, live: c.last_close, ret_7d_pct: c.ret_7d_pct, ret_30d_pct: c.ret_30d_pct, ret_60d_pct: c.ret_60d_pct, ret_90d_pct: c.ret_90d_pct,
      rs7: rs(7), rs30, rs90, cycle_high: ch, cycle_high_status: meta && meta.cycle_high ? meta.cycle_high.status : null, pct_below_cycle_high: below, min_low_90d: c.min_low_90d, mult_of_90d_low: lowMult, max_high_90d: c.max_high_90d, stage_candidate: stage, flags });
  }
  const sectors = {};
  for (const [sec, members] of Object.entries(cfg.sectors)) {
    const m = rows.filter((r) => members.includes(r.symbol) && !r.error);
    if (!m.length) continue;
    const med = (k) => { const v = m.map((r) => r[k]).filter((x) => x !== null && x !== undefined); return v.length ? round(v.sort((a, b) => a - b)[Math.floor(v.length / 2)], 2) : null; };
    const breadth = round(m.filter((r) => r.rs30 !== null && r.rs30 > 0).length / m.length * 100, 0);
    sectors[sec] = { members: m.map((r) => r.symbol), median_rs30: med('rs30'), median_rs90: med('rs90'), median_ret_30d_pct: med('ret_30d_pct'), median_pct_below_cycle_high: med('pct_below_cycle_high'), breadth_rs30_positive_pct: breadth, leading_possible: breadth > 60 };
  }
  return { generated_utc: nowIso(), set, btc: { last_close: btc.last_completed.close, cycle_high_close_ref: btcHigh, new_cycle_high: btcNewHigh, within_10pct_of_cycle_high: btcWithin10, ret_30d_pct: btc.ret_30d_pct }, note: 'stage_candidate = the single-read mechanical stage; DORMANT/EMERGING/LEADING/ROLLING OVER change only after two consecutive weekly reads (WAVE_BOARD.md persistence filter). EXTENDED / MAXED flag on one verified read.', coins: rows, sectors };
}

// ====================================================================== RUNNER FLAGS (T20)
export async function flags() {
  const out = [];
  for (const f of cfg.runner_flags) {
    try {
      const days = Math.max(daysBetween(f.since, new Date()) + 3, 10);
      const c = await candles({ symbol: f.symbol, days, since: f.since });
      const hi = c.highest_close_since; const level = hi ? round(hi.close * f.factor, 4) : null;
      const lastCompleted = c.last_completed;
      out.push({ symbol: f.symbol, rule: f.rule, since: f.since, factor: f.factor, highest_close: hi, flag_level_computed: level, flag_level_fixed_state: f.fixed_level ?? null, effective_level: f.fixed_level ?? level,
        last_completed_close: lastCompleted ? { date: lastCompleted.date, close: lastCompleted.close } : null, live_price: c.last_close, live_vs_level_pct: level ? round((c.last_close / (f.fixed_level ?? level) - 1) * 100, 2) : null,
        fired_on_last_completed_close: lastCompleted ? lastCompleted.close <= (f.fixed_level ?? level) : null, live_below_level: c.last_close <= (f.fixed_level ?? level), note: f.note || null });
    } catch (e) { out.push({ symbol: f.symbol, error: e.message }); }
  }
  return { generated_utc: nowIso(), basis: 'Coinbase daily CLOSES (completed days); live_below_level is an intraday watch-flag only', flags: out };
}

// ====================================================================== BOOK (positions × live prices; orders with distances and possible-fill flags)
export async function book(pricesData) {
  const p = pricesData || await prices({ group: 'portfolio' });
  const px = Object.fromEntries(p.prices.map((r) => [r.symbol, r]));
  const rows = cfg.positions.map((pos) => {
    const r = px[pos.symbol]; const usd = r ? r.usd : null; const value = usd !== null ? usd * pos.qty : null; const invested = pos.qty * pos.avg_cost;
    return { symbol: pos.symbol, qty: pos.qty, avg_cost: pos.avg_cost, invested, price: usd, price_source: r ? r.price_source : null, value: value !== null ? round(value, 2) : null, unrealized_pl: value !== null ? round(value - invested, 2) : null, unrealized_pl_pct: value !== null ? round((value / invested - 1) * 100, 2) : null, target: pos.target, target_x: pos.target && usd ? round(pos.target / usd, 2) : null, change_24h_pct: r ? r.change_24h_pct : null, venue: pos.venue, note: pos.note || null };
  });
  const alts = sum(rows.map((r) => r.value || 0));
  const btc = px.BTC ? px.BTC.usd : null; const sleeve = btc ? btc * cfg.btc_sleeve.qty : null;
  const cash = cfg.cash.usdc; const total = alts + (sleeve || 0) + cash;
  for (const r of rows) r.pct_of_book = r.value !== null ? round(r.value / total * 100, 2) : null;
  const orders = cfg.orders.map((o) => {
    const r = px[o.symbol]; const last = r ? r.usd : null; const k = r && r.coinbase_24h; const dist = last ? round((o.limit / last - 1) * 100, 2) : null;
    let possible = null;
    if (k && o.venue === 'Coinbase') possible = o.side === 'SELL' ? (k.high !== null && k.high >= o.limit) : (k.low !== null && k.low <= o.limit);
    return { ...o, notional_at_limit: round(o.qty * o.limit, 2), last, distance_pct: dist, distance_label: dist === null ? null : (o.side === 'SELL' ? `${dist >= 0 ? '+' : ''}${dist}% above spot` : `${dist}% vs spot`), coinbase_24h_high: k ? k.high : null, coinbase_24h_low: k ? k.low : null,
      possible_fill_24h: possible, warning: possible ? 'POSSIBLE FILL — price traded through the limit in the last 24h: send the orders/USDC screen; never assume a fill' : null };
  });
  const sells = orders.filter((o) => o.side === 'SELL');
  return { generated_utc: nowIso(), as_of_positions: cfg.as_of, note: 'Positions/orders are the config snapshot; the sheet + STATE.md are canonical. Prices: Coinbase last for Coinbase-listed names.',
    totals: { alts_value: round(alts, 2), btc_sleeve_value: sleeve !== null ? round(sleeve, 2) : null, btc_sleeve_qty: cfg.btc_sleeve.qty, btc_price: btc, cash_usdc: cash, cash_held_by_orders: cfg.cash.held_by_orders, book_total: round(total, 2), alts_invested: round(sum(rows.map((r) => r.invested)), 2), alts_unrealized_pl: round(alts - sum(rows.map((r) => r.invested)), 2), sleeve_unrealized_pl: sleeve !== null ? round(sleeve - cfg.btc_sleeve.invested, 2) : null },
    positions: rows, orders, order_summary: { resting_sells: sells.length, sells_notional_at_limit: round(sum(sells.map((o) => o.notional_at_limit)), 2), nearest_sell: sells.filter((o) => o.distance_pct !== null).sort((a, b) => a.distance_pct - b.distance_pct)[0] || null, possible_fills: orders.filter((o) => o.possible_fill_24h).map((o) => `${o.symbol} ${o.side} ${o.qty} @ ${o.limit}`) } };
}

// ====================================================================== DEPTH (thin-book lens: USD resting within ±1/2/5% of mid)
export async function depth({ symbol = 'ONDO' } = {}) {
  const c = coinBySymbol(symbol); const pid = (c && c.cb) || `${String(symbol).toUpperCase()}-USD`;
  let bk = await C.cbAdvancedBook(pid, 250); let source = bk && bk.source;
  if (!bk) { const l2 = await C.cbBook(pid, 2); bk = { bids: l2.bids.map((x) => [num(x[0]), num(x[1])]), asks: l2.asks.map((x) => [num(x[0]), num(x[1])]) }; source = 'coinbase exchange /book?level=2 (top 50 aggregated levels)'; }
  const bestBid = bk.bids[0][0], bestAsk = bk.asks[0][0]; const mid = (bestBid + bestAsk) / 2;
  const within = (side, pct) => { const lim = side === 'bid' ? mid * (1 - pct) : mid * (1 + pct); const lv = side === 'bid' ? bk.bids.filter((x) => x[0] >= lim) : bk.asks.filter((x) => x[0] <= lim); return round(sum(lv.map((x) => x[0] * x[1])), 0); };
  const cover = { bid_lowest_price: bk.bids[bk.bids.length - 1][0], ask_highest_price: bk.asks[bk.asks.length - 1][0] };
  const stats = await C.cbStats(pid).catch(() => null);
  const vol24 = stats ? num(stats.volume) * mid : null;
  return { product: pid, source, mid, best_bid: bestBid, best_ask: bestAsk, spread_bps: round((bestAsk - bestBid) / mid * 10000, 2), levels: { bids: bk.bids.length, asks: bk.asks.length }, coverage_pct: { bids_down_to: round((cover.bid_lowest_price / mid - 1) * 100, 2), asks_up_to: round((cover.ask_highest_price / mid - 1) * 100, 2) },
    depth_usd: { bid_1pct: within('bid', 0.01), ask_1pct: within('ask', 0.01), bid_2pct: within('bid', 0.02), ask_2pct: within('ask', 0.02), bid_5pct: within('bid', 0.05), ask_5pct: within('ask', 0.05) },
    volume_24h_usd_est: vol24 !== null ? round(vol24, 0) : null, note: 'USD needed to sweep the visible book to ±x% — the thin-order-book lens ($1 in ≠ $1 of market cap). Coverage shows how far the fetched levels reach; a depth figure at the coverage edge is a floor, not the true depth.' };
}

// ====================================================================== FRED derived (net liquidity, OAS, Fed stance, Sahm)
export async function fred({ series } = {}) {
  const ids = series ? String(series).split(',').map((s) => s.trim().toUpperCase()) : cfg.fred_series.map((s) => s.id);
  const res = await pmap(ids, 4, (id) => C.fredSeries(id));
  const out = {}; ids.forEach((id, i) => { out[id] = res[i]; });
  const get = (id) => (out[id] && !out[id].error ? out[id] : null);
  const valueOnOrBefore = (s, date) => { let v = null; for (const o of s.obs) { if (o.date <= date) v = o; else break; } return v; };
  const derived = {};
  const w = get('WALCL'), t = get('WTREGEN'), r = get('RRPONTSYD');
  if (w && t && r) {
    const rows = w.obs.slice(-80).map((o) => { const tg = valueOnOrBefore(t, o.date), rp = valueOnOrBefore(r, o.date); return tg && rp ? { date: o.date, walcl_b: round(o.value / 1000, 1), tga_b: tg.value, rrp_b: rp.value, netliq_b: round(o.value / 1000 - tg.value - rp.value, 1) } : null; }).filter(Boolean);
    const L = rows[rows.length - 1], L4 = rows[rows.length - 5], L13 = rows[rows.length - 14];
    derived.net_liquidity = { formula: 'WALCL/1000 − WTREGEN − RRPONTSYD ($B, weekly on the H.4.1 Wednesday)', last: L, change_4w_pct: L4 ? round(pctChange(L.netliq_b, L4.netliq_b) * 100, 2) : null, change_13w_pct: L13 ? round(pctChange(L.netliq_b, L13.netliq_b) * 100, 2) : null, change_13w_label: L13 ? pctLabel(pctChange(L.netliq_b, L13.netliq_b)) : null, walcl_change_13w_b: L13 ? round(L.walcl_b - L13.walcl_b, 1) : null, rows_last14: rows.slice(-14) };
  }
  const oas = get('BAMLH0A0HYM2');
  if (oas) { const L = oas.last; const d28 = ymd(new Date(new Date(L.date).getTime() - 28 * 86400000)); const d56 = ymd(new Date(new Date(L.date).getTime() - 56 * 86400000)); const b4 = valueOnOrBefore(oas, d28), b8 = valueOnOrBefore(oas, d56);
    derived.hy_oas = { last: L, change_4w_bp: b4 ? round((L.value - b4.value) * 100, 0) : null, change_8w_bp: b8 ? round((L.value - b8.value) * 100, 0) : null, max_4w: round(Math.max(...oas.obs.filter((o) => o.date >= d28).map((o) => o.value)), 2), last10: oas.obs.slice(-10) }; }
  const tgt = get('DFEDTARU');
  if (tgt) { let lastChange = null; for (let i = tgt.obs.length - 1; i > 0; i--) { if (tgt.obs[i].value !== tgt.obs[i - 1].value) { lastChange = { date: tgt.obs[i].date, from: tgt.obs[i - 1].value, to: tgt.obs[i].value, direction: tgt.obs[i].value > tgt.obs[i - 1].value ? 'HIKE' : 'CUT' }; break; } }
    derived.fed = { target_upper: tgt.last, last_change: lastChange, days_since_last_change: lastChange ? daysBetween(lastChange.date, new Date()) : null, hike_within_90d: lastChange ? (lastChange.direction === 'HIKE' && daysBetween(lastChange.date, new Date()) <= 90) : null }; }
  const sahm = get('SAHMREALTIME'); if (sahm) derived.sahm = { last: sahm.last, above_0_5: sahm.last.value > 0.5 };
  const g2 = get('DGS2'); if (g2) { const d56 = ymd(new Date(new Date(g2.last.date).getTime() - 56 * 86400000)); const b8 = valueOnOrBefore(g2, d56); derived.dgs2 = { last: g2.last, change_8w_bp: b8 ? round((g2.last.value - b8.value) * 100, 0) : null }; }
  const compact = {}; for (const id of ids) compact[id] = out[id] && !out[id].error ? { name: (cfg.fred_series.find((s) => s.id === id) || {}).name, units: (cfg.fred_series.find((s) => s.id === id) || {}).units, last: out[id].last, count: out[id].count, last10: out[id].obs.slice(-10) } : { error: out[id] && out[id].error };
  return { generated_utc: nowIso(), source: 'FRED fredgraph.csv (no key; 3-year window)', series: compact, derived };
}

// ====================================================================== STABLECOINS (DefiLlama; the ONLY accepted stablecoin print per the protocol)
export async function stablecoins() {
  const [charts, list] = await Promise.all([C.llamaStablecoinCharts(), C.llamaStablecoins().catch(() => null)]);
  const rows = charts.map((d) => ({ date: ymd(new Date(+d.date * 1000)), total_usd: (d.totalCirculatingUSD && d.totalCirculatingUSD.peggedUSD) ?? (d.totalCirculating && d.totalCirculating.peggedUSD) ?? null })).filter((r) => r.total_usd !== null).sort((a, b) => a.date < b.date ? -1 : 1);
  const L = rows[rows.length - 1]; const back = (n) => rows[rows.length - 1 - n] || null;
  const ch = (n) => (back(n) ? round(pctChange(L.total_usd, back(n).total_usd) * 100, 3) : null);
  const top = list && list.peggedAssets ? list.peggedAssets.map((a) => ({ symbol: a.symbol, name: a.name, circulating_usd: a.circulating && a.circulating.peggedUSD, prev_day: a.circulatingPrevDay && a.circulatingPrevDay.peggedUSD, prev_week: a.circulatingPrevWeek && a.circulatingPrevWeek.peggedUSD, prev_month: a.circulatingPrevMonth && a.circulatingPrevMonth.peggedUSD, price: a.price ?? null })).filter((a) => a.circulating_usd).sort((a, b) => b.circulating_usd - a.circulating_usd).slice(0, 10).map((a) => ({ ...a, change_7d_pct: a.prev_week ? round(pctChange(a.circulating_usd, a.prev_week) * 100, 2) : null, change_30d_pct: a.prev_month ? round(pctChange(a.circulating_usd, a.prev_month) * 100, 2) : null })) : null;
  return { generated_utc: nowIso(), source: 'DefiLlama stablecoincharts/all (total circulating, USD-pegged)', last: L, total_b: round(L.total_usd / 1e9, 3), change_1d_pct: ch(1), change_7d_pct: ch(7), change_4w_pct: ch(28), change_8w_pct: ch(56), change_13w_pct: ch(91), change_8w_label: pctLabel((ch(56) || 0) / 100), ks4_grade: ch(56) !== null && ch(56) <= -3 ? 'RED' : (ch(28) !== null && ch(28) < 0 && ch(56) !== null && ch(56) <= 0 ? 'AMBER' : 'GREEN'), top10: top, rows_last60: rows.slice(-60) };
}

// ====================================================================== FUNDING / OI summary
export async function funding({ coins } = {}) {
  const want = coins ? String(coins).toUpperCase().split(',') : cfg.hyperliquid_coins;
  const [hl, okx, bybit, deribit, binance, dvol] = await Promise.all([
    timed(() => C.hyperliquidMeta()), timed(() => pmap(cfg.okx_instruments, 4, (i) => C.okxSwap(i))), timed(() => pmap(cfg.bybit_symbols, 4, (s) => C.bybitTicker(s))),
    timed(() => Promise.all([C.deribitPerp('BTC-PERPETUAL'), C.deribitPerp('ETH-PERPETUAL')])), timed(() => pmap(['BTCUSDT', 'ETHUSDT'], 2, (s) => C.binancePerp(s))), timed(() => C.deribitDvol('BTC', 30)),
  ]);
  const hlA = hl.ok ? hl.data.assets : {};
  const table = want.map((s) => { const h = hlA[s]; const oi = cfg.okx_instruments.indexOf(`${s}-USDT-SWAP`); const o = okx.ok && oi >= 0 ? okx.data[oi] : null; const bi = cfg.bybit_symbols.indexOf(`${s}USDT`); const b = bybit.ok && bi >= 0 && bybit.data[bi] && !bybit.data[bi].error ? bybit.data[bi] : null;
    return { coin: s, hyperliquid: h ? { funding_8h_pct: h.funding_8h_pct, funding_annualized_pct: h.funding_annualized_pct, oi_usd: h.open_interest_usd, day_volume_usd: h.day_notional_volume_usd, premium: h.premium, mark: h.mark_px } : null, okx: o && !o.error ? { funding_8h_pct: o.funding_rate_8h_pct, oi_usd: o.open_interest_usd, vol24h_usd: o.vol24h_usd } : (o && o.error ? { error: o.error } : null), bybit: b && !b.error ? { funding_8h_pct: b.funding_rate_8h_pct, oi_usd: b.open_interest_usd, turnover24h_usd: b.turnover24h_usd } : null }; });
  const btc = table.find((t) => t.coin === 'BTC') || {};
  const btcFunding = [btc.hyperliquid && btc.hyperliquid.funding_8h_pct, btc.okx && btc.okx.funding_8h_pct, btc.bybit && btc.bybit.funding_8h_pct, deribit.ok && deribit.data[0] ? deribit.data[0].funding_8h_pct : null, binance.ok && binance.data[0] && !binance.data[0].error ? binance.data[0].funding_rate_8h_pct : null].filter((v) => v !== null && v !== undefined);
  const maxF = btcFunding.length ? Math.max(...btcFunding) : null, minF = btcFunding.length ? Math.min(...btcFunding) : null;
  return { generated_utc: nowIso(), sources: { hyperliquid: hl.ok ? 'ok' : hl.error, okx: okx.ok ? 'ok' : okx.error, bybit: bybit.ok ? 'ok' : bybit.error, deribit: deribit.ok ? 'ok' : deribit.error, binance: binance.ok ? (binance.data[0] && binance.data[0].error ? binance.data[0].error : 'ok') : binance.error },
    btc_funding_8h_pct: { min: minF, max: maxF, venues: btcFunding.length, ks8_amber_if_above: cfg.ks_v3.leverage.funding_8h_amber * 100 * 100 / 100 }, ks8_hint: maxF !== null ? (maxF > cfg.ks_v3.leverage.funding_8h_amber * 100 ? 'AMBER (funding > 0.05%/8h)' : (minF < 0 ? 'watch: negative funding at a venue — RED needs rising OI too' : 'GREEN')) : null,
    deribit: deribit.ok ? { btc_perp: deribit.data[0], eth_perp: deribit.data[1] } : null, dvol_btc: dvol.ok ? dvol.data.last : null, table };
}

// ====================================================================== MACRO (Yahoo)
export async function macro({ symbols } = {}) {
  const list = symbols ? String(symbols).split(',').map((s) => s.trim()) : cfg.macro_symbols.map((m) => m.sym);
  const res = await pmap(list, 4, (s) => C.yahooChart(s));
  const out = {}; list.forEach((s, i) => { out[s] = res[i]; if (out[s] && !out[s].error) { const m = cfg.macro_symbols.find((x) => x.sym === s); if (m) out[s].label = m.name; delete out[s].series_last30; } });
  const move = out['^MOVE'] && !out['^MOVE'].error ? out['^MOVE'] : null;
  const moveWeeks = move ? move.weekly_closes_last4 : [];
  const derived = { move: move ? { last: move.last, date: move.market_time, weekly_closes: moveWeeks, consecutive_weekly_closes_above_120: (() => { let k = 0; for (let i = moveWeeks.length - 1; i >= 0 && moveWeeks[i].close > 120; i--) k++; return k; })(), ks2_hint: move.last > 120 ? 'RED-watch (needs 2 weekly closes > 120)' : move.last >= 100 ? 'AMBER (100–120)' : 'GREEN' } : null,
    brent: out['BZ=F'] && !out['BZ=F'].error ? { last: out['BZ=F'].last, ks6_hint: out['BZ=F'].last > cfg.ks_v3.oil.brent_amber ? 'AMBER by price (> $100) — RED requires the disruption judgment' : 'GREEN by price' } : null,
    dxy: out['DX-Y.NYB'] && !out['DX-Y.NYB'].error ? { last: out['DX-Y.NYB'].last, change_1m_pct: out['DX-Y.NYB'].change_1m_pct } : null, vix: out['^VIX'] && !out['^VIX'].error ? out['^VIX'].last : null, us10y_pct: out['^TNX'] && !out['^TNX'].error ? round(out['^TNX'].last / 10, 3) : null };
  return { generated_utc: nowIso(), source: 'Yahoo Finance v8 chart (query1/query2)', derived, quotes: out };
}

// ====================================================================== ON-CHAIN (Coin Metrics)
export async function onchain() {
  const cm = await C.coinMetricsBtc();
  const rows = cm.rows.filter((r) => r.price !== null && r.mcap !== null);
  const n = rows.length; const L = rows[n - 1];
  const mcaps = rows.map((r) => r.mcap); const sd = std(mcaps);
  const rcap = (r) => r.rcap ?? (r.mvrv ? r.mcap / r.mvrv : null);
  const mvrv = L.mvrv ?? (rcap(L) ? L.mcap / rcap(L) : null);
  const mvrvZ = rcap(L) && sd ? (L.mcap - rcap(L)) / sd : null;
  const nupl = mvrv ? 1 - 1 / mvrv : null;
  const prices_ = rows.map((r) => r.price);
  const dma = (k) => (n >= k ? mean(prices_.slice(n - k)) : null);
  const ma111 = dma(111), ma350x2 = dma(350) !== null ? dma(350) * 2 : null, ma200 = dma(200), ma730 = dma(730);
  // Pi Cycle: last cross date (111DMA crossing above 2×350DMA)
  let lastCross = null; for (let i = n - 1; i >= 350; i--) { const a = mean(prices_.slice(i - 110, i + 1)), b = 2 * mean(prices_.slice(i - 349, i + 1)), a1 = mean(prices_.slice(i - 111, i)), b1 = 2 * mean(prices_.slice(i - 350, i)); if (a > b && a1 <= b1) { lastCross = rows[i].date; break; } if (n - i > 2000) break; }
  const iss = rows.map((r) => r.iss_usd).filter((v) => v !== null); const puell = (L.iss_usd && iss.length >= 365) ? L.iss_usd / mean(iss.slice(-365)) : null;
  // weekly closes (W-SUN) for 200W
  const wk = new Map(); for (const r of rows) wk.set(weekEndingSunday(Math.floor(new Date(r.date).getTime() / 1000)), r.price); const wc = [...wk.values()];
  const sma200w = wc.length >= 200 ? mean(wc.slice(-200)) : null;
  const pl = cfg.levels.power_law; const dGen = daysBetween(pl.genesis, L.date); const fv = pl.a * Math.pow(dGen, pl.k);
  const ath = Math.max(...prices_);
  return { generated_utc: nowIso(), source: cm.source, data_end: L.date, rows: n, price: L.price, market_cap: L.mcap, realized_cap: rcap(L), mvrv: round(mvrv, 3), mvrv_z: round(mvrvZ, 3), nupl: round(nupl, 3), mvrv_z_note: 'MVRV-Z = (market cap − realized cap) ÷ stdev(market cap, full history). Session-B blow-off detector: MVRV-Z > 5 or NUPL > 0.70; retired: 2.5 / 0.65',
    pi_cycle: { ma111: round(ma111, 0), ma350x2: round(ma350x2, 0), ratio_111_over_350x2: ma350x2 ? round(ma111 / ma350x2, 3) : null, crossed: ma350x2 ? ma111 > ma350x2 : null, last_cross_date: lastCross }, puell_multiple: round(puell, 3), mayer_multiple: ma200 ? round(L.price / ma200, 3) : null, two_year_ma: round(ma730, 0), two_year_ma_x5: ma730 ? round(ma730 * 5, 0) : null,
    sma200w_from_cm: round(sma200w, 0), power_law: { fair_value: round(fv, 0), ratio: round(L.price / fv, 3), max_dca_zone: L.price / fv < pl.max_dca_ratio }, drawdown_from_ath_pct: round((L.price / ath - 1) * 100, 2), ath_in_series: ath, last_rows: rows.slice(-5) };
}

// ====================================================================== LLAMA value-capture pack for the book + candidates
export async function llama({ symbols, slug } = {}) {
  if (slug) return C.llamaPack(slug, [slug]);
  const want = symbols ? String(symbols).toUpperCase().split(',') : ['HYPE', 'MORPHO', 'AERO', 'SYRUP', 'ONDO', 'LINK', 'UNI', 'AAVE', 'PUMP'];
  const res = await pmap(want, 3, (s) => C.llamaPack(s, cfg.llama.protocols[s] || [s.toLowerCase()]));
  const chains = await timed(() => C.llamaChains());
  const chainRows = chains.ok ? chains.data.filter((c) => cfg.llama.chains.includes(c.name)).map((c) => ({ chain: c.name, tvl_usd: round(c.tvl, 0), token: c.tokenSymbol })) : null;
  return { generated_utc: nowIso(), source: 'DefiLlama api.llama.fi (/tvl, /summary/fees dailyFees|dailyRevenue|dailyHoldersRevenue, /v2/chains)', protocols: res.map((r, i) => (r && r.error ? { symbol: want[i], error: r.error } : { ...r, holders_revenue_30d_annualized_usd: r.holders_revenue && r.holders_revenue.total30d ? round(r.holders_revenue.total30d * 12, 0) : null })), chains: chainRows, chains_error: chains.ok ? null : chains.error };
}
export async function llamaSearch({ q }) {
  if (!q) throw new Error('q required'); const all = await C.llamaProtocols(); const ql = String(q).toLowerCase();
  return { query: q, matches: all.filter((p) => (p.name || '').toLowerCase().includes(ql) || (p.slug || '').toLowerCase().includes(ql) || (p.symbol || '').toLowerCase() === ql).slice(0, 25).map((p) => ({ slug: p.slug, name: p.name, symbol: p.symbol, category: p.category, tvl_usd: round(p.tvl, 0), chains: (p.chains || []).slice(0, 6), parent: p.parentProtocol || null })) };
}

// ====================================================================== KILL-SWITCH v3 PRE-GRADE (mechanical signals only; judgment signals report inputs)
export function ksPregrade({ fredD, stables, structure, macroD, farsideBtc, fundingD, global }) {
  const W = cfg.ks_v3.weights; const g = {}; const notes = [];
  const gradeVal = (grade, w) => (grade === 'RED' ? w : grade === 'AMBER' ? w / 2 : 0);
  // 1 liquidity
  if (fredD && fredD.derived && fredD.derived.net_liquidity) { const nl = fredD.derived.net_liquidity.change_13w_pct; const hike = fredD.derived.fed && fredD.derived.fed.hike_within_90d; const contracting = nl !== null && nl < -2; const stance = !!hike; // QT-running flag not derivable from data → hike only
    g.liquidity = { grade: contracting && stance ? 'RED' : (contracting || stance ? 'AMBER' : 'GREEN'), netliq_13w_pct: nl, hike_within_90d: hike, note: 'QT running is not derivable from data (QT ended Dec 1 2025 per STATE); RED = 13-wk net liquidity < −2% AND a hike within 90d' }; }
  else g.liquidity = { grade: null, note: 'FRED unavailable' };
  // 2 credit
  const oas = fredD && fredD.derived && fredD.derived.hy_oas; const mv = macroD && macroD.derived && macroD.derived.move;
  if (oas) { const c = cfg.ks_v3.credit; const red = oas.last.value > c.oas_red || (oas.last.value > c.oas_4w_red_floor && oas.change_4w_bp >= c.oas_4w_red_bp) || (mv && mv.consecutive_weekly_closes_above_120 >= 2); const amber = (oas.last.value >= c.oas_amber_lo) || (mv && mv.last >= c.move_amber && mv.last <= c.move_red) || (oas.change_4w_bp >= c.oas_4w_amber_bp);
    g.credit = { grade: red ? 'RED' : amber ? 'AMBER' : 'GREEN', hy_oas: oas.last, oas_change_4w_bp: oas.change_4w_bp, move: mv ? mv.last : null, move_weekly_closes_gt120: mv ? mv.consecutive_weekly_closes_above_120 : null }; }
  else g.credit = { grade: null, note: 'FRED OAS unavailable' };
  // 3 trend
  if (structure) { const s = structure.last_completed_week; const belowBoth = !s.above_20w && !s.above_50w; g.trend = { grade: belowBoth && s.sma50_rising === false ? 'RED' : (!s.above_20w || !s.above_50w ? 'AMBER' : 'GREEN'), close: s.close, sma20: s.sma20, sma50: s.sma50, sma50_rising: s.sma50_rising, week_ending: s.week_ending }; } else g.trend = { grade: null };
  // 4 stablecoins
  g.stablecoins = stables ? { grade: stables.ks4_grade, change_4w_pct: stables.change_4w_pct, change_8w_pct: stables.change_8w_pct, total_b: stables.total_b } : { grade: null };
  // 5 etf
  if (farsideBtc) { const e = cfg.ks_v3.etf; g.etf = { grade: farsideBtc.consecutive_outflow_weeks > e.streak_weeks_red ? 'RED' : (farsideBtc.consecutive_outflow_days >= e.streak_days_amber || farsideBtc.sum_last20_musd < 0 ? 'AMBER' : 'GREEN'), consecutive_outflow_days: farsideBtc.consecutive_outflow_days, consecutive_outflow_weeks: farsideBtc.consecutive_outflow_weeks, sum_last5_musd: farsideBtc.sum_last5_musd, sum_last20_musd: farsideBtc.sum_last20_musd, last_day: farsideBtc.last_day }; }
  else g.etf = { grade: null, note: 'Farside unavailable — grade from the page by hand' };
  // 6 oil (price leg only)
  const br = macroD && macroD.derived && macroD.derived.brent; g.oil = { grade: br ? (br.last > cfg.ks_v3.oil.brent_amber ? 'AMBER' : 'GREEN') : null, brent: br ? br.last : null, note: 'RED (strait disruption ongoing) is a judgment grade — see /api/hormuz (PortWatch transits vs the ~85/day baseline; proposed tree: RED if < 25% of baseline)' };
  // 7 dat — judgment
  g.dat = { grade: null, note: 'judgment grade (purchase halt + mNAV ≤ 1 = AMBER; forced/debt-driven selling = RED) — inputs at /api/dat' };
  // 8 leverage
  if (fundingD && fundingD.btc_funding_8h_pct && fundingD.btc_funding_8h_pct.max !== null) { const f = fundingD.btc_funding_8h_pct; g.leverage = { grade: f.max > cfg.ks_v3.leverage.funding_8h_amber * 100 ? 'AMBER' : 'GREEN', btc_funding_8h_pct_range: [f.min, f.max], note: 'RED = negative funding + rising OI (check /api/okx-oi?ccy=BTC for the OI trend); deriv:spot > 5:1 = AMBER (not computed)' }; } else g.leverage = { grade: null };
  // 9 dominance — informational
  g.dominance = { grade: 'GREEN', weight: 0, btc_dominance_pct: global && global.market_cap_percentage ? round(global.market_cap_percentage.btc, 2) : null, note: 'informational: a sharp spike during a selloff = trim-alts flag' };
  let score = 0; const ungraded = [];
  for (const [k, w] of Object.entries(W)) { const gr = g[k] && g[k].grade; if (gr) score += gradeVal(gr, w); else if (w > 0) ungraded.push(k); }
  return { score_mechanical: score, ungraded_signals: ungraded, tier_hint: score >= cfg.ks_v3.tiers.full_exit ? 'FULL EXIT band (mechanical part alone)' : score >= cfg.ks_v3.tiers.trim ? 'TRIM band (mechanical part alone)' : 'CLEAR (mechanical part; add judgment grades for Oil/Hormuz RED and DAT)', signals: g, note: 'PRE-GRADE ONLY. The daily sweep / Sunday scan write the canonical grade into STATE.md after verifying every input and applying the time filter. Never act on this number alone.' };
}

// ====================================================================== DAT inputs
export async function dat() {
  const [treas, mstr, mpl] = await Promise.all([timed(() => C.cgTreasury('bitcoin')), timed(() => C.yahooChart('MSTR', '3mo')), timed(() => C.yahooChart('3350.T', '3mo'))]);
  const companies = treas.ok ? (treas.data.companies || []).slice(0, 15).map((c) => ({ name: c.name, symbol: c.symbol, country: c.country, total_holdings_btc: c.total_holdings, total_current_value_usd: c.total_current_value_usd, pct_of_supply: c.percentage_of_total_supply })) : null;
  const find = (re) => companies ? companies.find((c) => re.test(c.name) || re.test(c.symbol || '')) : null;
  const s = find(/strategy|microstrategy|MSTR/i), m = find(/metaplanet|3350/i);
  const mnav = (co, quote, shares) => (co && quote && quote.last && shares && co.total_current_value_usd ? round(quote.last * shares / co.total_current_value_usd, 3) : null);
  return { generated_utc: nowIso(), sources: { treasury: treas.ok ? 'coingecko public_treasury' : treas.error, mstr: mstr.ok ? 'yahoo' : mstr.error, metaplanet: mpl.ok ? 'yahoo' : mpl.error },
    strategy: { holdings: s || null, quote: mstr.ok ? { last: mstr.data.last, change_1m_pct: mstr.data.change_1m_pct } : null, mnav_estimate: mnav(s, mstr.ok && mstr.data, cfg.dat.strategy.shares_outstanding), shares_outstanding_config: cfg.dat.strategy.shares_outstanding, note: cfg.dat.strategy.note },
    metaplanet: { holdings: m || null, quote: mpl.ok ? { last_jpy: mpl.data.last, change_1m_pct: mpl.data.change_1m_pct } : null, mnav_estimate: null, carried: cfg.dat.metaplanet.last_purchase_carried, note: 'mNAV for Metaplanet needs JPY→USD and share count; use mnav.com/mnav/metaplanet via /api/text?url=' },
    top_treasuries: companies, ks7_rule: 'AMBER = purchase halt + mNAV ≤ 1 (exhaustion without forced selling); RED = forced / debt-driven selling' };
}

// ====================================================================== ALL + BRIEF + HEALTH
export async function all({ full } = {}) {
  const t0 = Date.now();
  const [pricesR, globalR, fngR, fundingR, fredR, stablesR, macroR, structR, flagsR, farsideBtcR, farsideEthR, llamaR, onchainR, polyR, hormuzR, straitsR, datR] = await Promise.all([
    timed(() => prices({ group: 'portfolio,weekly,monthly,bench' })), timed(() => C.cgGlobal()), timed(() => C.fearGreed(30)), timed(() => funding()), timed(() => fred()), timed(() => stablecoins()), timed(() => macro()), timed(() => btcStructure()), timed(() => flags()),
    timed(() => C.farside('btc')), timed(() => C.farside('eth')), timed(() => llama()), full ? timed(() => onchain()) : Promise.resolve({ ok: false, skipped: true, error: 'onchain skipped (add ?full=1)' }),
    full ? timed(() => pmap(cfg.polymarket_queries.slice(0, 4), 2, (q) => C.polymarketSearch(q))) : Promise.resolve({ ok: false, skipped: true, error: 'polymarket skipped (add ?full=1 or call /api/polymarket?q=)' }),
    timed(() => C.portwatchHormuz()), timed(() => C.straitsBrief()), full ? timed(() => dat()) : Promise.resolve({ ok: false, skipped: true, error: 'dat skipped (add ?full=1 or call /api/dat)' }),
  ]);
  const bookR = pricesR.ok ? await timed(() => book(pricesR.data)) : { ok: false, error: 'prices failed: ' + pricesR.error };
  const ks = ksPregrade({ fredD: fredR.ok ? fredR.data : null, stables: stablesR.ok ? stablesR.data : null, structure: structR.ok ? structR.data : null, macroD: macroR.ok ? macroR.data : null, farsideBtc: farsideBtcR.ok ? farsideBtcR.data : null, fundingD: fundingR.ok ? fundingR.data : null, global: globalR.ok ? globalR.data : null });
  const sections = { prices: pricesR, book: bookR, btc_structure: structR, runner_flags: flagsR, ks_pregrade: { ok: true, ms: 0, data: ks }, fred: fredR, stablecoins: stablesR, macro: macroR, funding: fundingR, etf_flows_btc: farsideBtcR, etf_flows_eth: farsideEthR, global: globalR, fear_greed: fngR, llama: llamaR, hormuz_portwatch: hormuzR, hormuz_straits_live: straitsR, onchain: onchainR, polymarket: polyR, dat: datR };
  const status = Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, v.ok ? `ok ${v.ms}ms` : (v.skipped ? 'skipped' : `FAIL ${v.error}`)]));
  return { hub_version: HUB_VERSION, generated_utc: nowIso(), total_ms: Date.now() - t0, config_as_of: cfg.as_of, status, sections };
}

export async function brief() {
  const a = await all({});
  const S = a.sections; const L = [];
  const P = (s) => L.push(s);
  const d = (sec) => (S[sec] && S[sec].ok ? S[sec].data : null);
  P(`MATHEWS HUB BRIEF — ${a.generated_utc} (hub v${a.hub_version}; ${a.total_ms} ms; config ${a.config_as_of})`);
  P('Every number below is fetched live server-side. Negative values carry an explicit minus sign AND a DOWN label.');
  const pr = d('prices'); if (pr) { P('\n== PRICES (Coinbase last where listed; CoinGecko otherwise) =='); for (const r of pr.prices.filter((x) => x.group === 'portfolio')) P(`${r.symbol}: ${r.usd} | 24h ${r.change_24h_label} | 7d ${r.change_7d_label || 'n/a'} | 30d ${r.change_30d_label || 'n/a'} | mcap ${fmtUsd(r.market_cap_usd)} | vol24h ${fmtUsd(r.volume_24h_usd)} | below cycle high ${r.pct_below_cycle_high === null ? 'n/a' : r.pct_below_cycle_high + '%'}`); P('watch: ' + pr.prices.filter((x) => x.group !== 'portfolio').map((r) => `${r.symbol} ${r.usd} (${r.change_24h_label})`).join(' · ')); } else P('PRICES: FAIL ' + S.prices.error);
  const b = d('book'); if (b) { P(`\n== BOOK == total ${fmtUsd(b.totals.book_total)} = alts ${fmtUsd(b.totals.alts_value)} + BTC sleeve ${fmtUsd(b.totals.btc_sleeve_value)} (${b.totals.btc_sleeve_qty} BTC @ ${b.totals.btc_price}) + USDC ${fmtUsd(b.totals.cash_usdc)} | alts unrealized ${fmtUsd(b.totals.alts_unrealized_pl)}`); for (const p of b.positions) P(`  ${p.symbol} ${p.qty} @ ${p.price} = ${fmtUsd(p.value)} (${p.pct_of_book}% of book; P/L ${p.unrealized_pl_pct}%)`); P('  ORDERS: ' + b.orders.map((o) => `${o.venue[0]} ${o.symbol} ${o.side} ${o.qty}@${o.limit} (${o.distance_pct}%)${o.possible_fill_24h ? ' **POSSIBLE FILL**' : ''}`).join(' · ')); }
  const st = d('btc_structure'); if (st) { const w = st.last_completed_week, g = st.next_close_gates; P(`\n== BTC STRUCTURE (Coinbase weekly) == spot ${st.spot} | last completed close ${w.week_ending} ${w.close} | 20W ${w.sma20} (${w.above_20w ? 'ABOVE' : 'BELOW'}; rising strict ${w.sma20_rising_strict} / 4wk ${w.sma20_rising_4wk_slope}) | 50W ${w.sma50} (${w.above_50w ? 'ABOVE' : 'BELOW'}; rising ${w.sma50_rising}; ${w.consecutive_weekly_closes_above_50w} consecutive closes above) | 200W ${w.sma200} | weekly RSI ${w.weekly_rsi14}`); P(`  NEXT CLOSE ${g.week_ending}: 50W gate ${g.gate_50w} (spot ${g.spot_vs_gate_50w_pct}% vs gate) | 20W gate ${g.gate_20w} | 50W rises if close > ${g.x_for_50w_to_rise} | 20W rises strict if > ${g.x_for_20w_to_rise_strict}, 4wk-slope if > ${g.x_for_20w_to_rise_4wk_slope}`); P(`  T09: 90d high ${st.t09.high_90d_live} (${st.t09.high_90d_date}) → confirmed-path levels ${st.t09.confirmed_path_levels_live.join(' / ')} | unconfirmed ${st.t09.unconfirmed_path_levels_live.join(' / ')} | power-law FV ${st.power_law.fair_value} ratio ${st.power_law.ratio_spot} (MAX-DCA ${st.power_law.max_dca_zone}) | new cycle high printed: ${st.cycle_high.new_cycle_high_printed}`); }
  const fl = d('runner_flags'); if (fl) { P('\n== RUNNER FLAGS (T20) =='); for (const f of fl.flags) P(f.error ? `  ${f.symbol}: ERROR ${f.error}` : `  ${f.symbol}: level ${f.effective_level} (0.70 × ${f.highest_close ? f.highest_close.close + ' on ' + f.highest_close.date : 'n/a'}) | last close ${f.last_completed_close && f.last_completed_close.close} | live ${f.live_price} (${f.live_vs_level_pct}% vs level) | FIRED on close: ${f.fired_on_last_completed_close}`); }
  const ks = d('ks_pregrade'); if (ks) { P(`\n== KILL-SWITCH v3 PRE-GRADE (mechanical) == score ${ks.score_mechanical} — ${ks.tier_hint}; ungraded: ${ks.ungraded_signals.join(', ') || 'none'}`); for (const [k, v] of Object.entries(ks.signals)) P(`  ${k}: ${v.grade || 'n/a'} ${JSON.stringify(Object.fromEntries(Object.entries(v).filter(([kk]) => !['grade', 'note'].includes(kk))))}`); }
  const fr = d('fred'); if (fr && fr.derived.net_liquidity) { const nl = fr.derived.net_liquidity; P(`\n== LIQUIDITY == net liquidity ${nl.last.netliq_b}B on ${nl.last.date} (WALCL ${nl.last.walcl_b}B − TGA ${nl.last.tga_b}B − RRP ${nl.last.rrp_b}B) | 4w ${nl.change_4w_pct}% | 13w ${nl.change_13w_label} | HY OAS ${fr.derived.hy_oas ? fr.derived.hy_oas.last.value + ' (' + fr.derived.hy_oas.last.date + '; 4w ' + fr.derived.hy_oas.change_4w_bp + 'bp)' : 'n/a'} | Fed ${fr.derived.fed ? fr.derived.fed.target_upper.value + '% upper; last ' + (fr.derived.fed.last_change ? fr.derived.fed.last_change.direction + ' ' + fr.derived.fed.last_change.date : 'n/a') : 'n/a'} | Sahm ${fr.derived.sahm ? fr.derived.sahm.last.value + ' (' + fr.derived.sahm.last.date + ')' : 'n/a'}`); }
  const sc = d('stablecoins'); if (sc) P(`== STABLECOINS (DefiLlama) == ${sc.total_b}B on ${sc.last.date} | 1d ${sc.change_1d_pct}% | 7d ${sc.change_7d_pct}% | 4w ${sc.change_4w_pct}% | 8w ${sc.change_8w_label} | KS4 ${sc.ks4_grade}`);
  const mc = d('macro'); if (mc) P(`== MACRO (Yahoo) == MOVE ${mc.derived.move ? mc.derived.move.last + ' (' + mc.derived.move.ks2_hint + '; weekly closes ' + mc.derived.move.weekly_closes.map((w) => w.close).join('/') + ')' : 'n/a'} | Brent ${mc.derived.brent ? mc.derived.brent.last : 'n/a'} | DXY ${mc.derived.dxy ? mc.derived.dxy.last : 'n/a'} | VIX ${mc.derived.vix} | 10Y ${mc.derived.us10y_pct}% | ` + ['MSTR', 'COIN', 'HOOD', 'IBIT', 'GC=F', '^GSPC'].map((s) => mc.quotes[s] && !mc.quotes[s].error ? `${s} ${mc.quotes[s].last} (${mc.quotes[s].change_1d_pct}%)` : `${s} n/a`).join(' · '));
  const fu = d('funding'); if (fu) P(`== FUNDING/OI == BTC funding 8h ${fu.btc_funding_8h_pct.min}% to ${fu.btc_funding_8h_pct.max}% across ${fu.btc_funding_8h_pct.venues} venues → ${fu.ks8_hint} | DVOL ${fu.dvol_btc ? fu.dvol_btc.close : 'n/a'} | ` + fu.table.slice(0, 8).map((t) => `${t.coin}: HL ${t.hyperliquid ? t.hyperliquid.funding_8h_pct + '%/8h OI ' + fmtUsd(t.hyperliquid.oi_usd) : 'n/a'}${t.okx && !t.okx.error ? ' OKX ' + t.okx.funding_8h_pct + '% OI ' + fmtUsd(t.okx.oi_usd) : ''}`).join(' · '));
  const ef = d('etf_flows_btc'); P(ef ? `== ETF FLOWS (Farside) == BTC last ${ef.last_day.date} ${ef.last_day.total_musd}M | 5d ${ef.sum_last5_musd}M | 20d ${ef.sum_last20_musd}M | outflow streak ${ef.consecutive_outflow_days}d / ${ef.consecutive_outflow_weeks}w | weeks ${ef.weeks.slice(-4).map((w) => w.week_ending + ' ' + w.total_musd).join(', ')}` : `== ETF FLOWS == FAIL ${S.etf_flows_btc.error}`);
  const ee = d('etf_flows_eth'); if (ee) P(`   ETH last ${ee.last_day.date} ${ee.last_day.total_musd}M | 5d ${ee.sum_last5_musd}M | 20d ${ee.sum_last20_musd}M`);
  const gl = d('global'); if (gl) P(`== GLOBAL == BTC dominance ${round(gl.market_cap_percentage.btc, 2)}% | ETH ${round(gl.market_cap_percentage.eth, 2)}% | total mcap ${fmtUsd(gl.total_market_cap.usd)} (24h ${round(gl.market_cap_change_percentage_24h_usd, 2)}%) | F&G ${d('fear_greed') ? d('fear_greed').last.value + ' ' + d('fear_greed').last.label : 'n/a'}`);
  const ll = d('llama'); if (ll) P('== VALUE CAPTURE (DefiLlama 30d) == ' + ll.protocols.map((p) => p.error ? `${p.symbol}: ERR` : `${p.symbol} [${p.slug}] TVL ${fmtUsd(p.tvl_usd)} fees30d ${fmtUsd(p.fees.total30d)} rev30d ${fmtUsd(p.revenue.total30d)} holders30d ${fmtUsd(p.holders_revenue.total30d)}`).join(' · '));
  const hz = d('hormuz_portwatch'); P(hz ? `== HORMUZ == PortWatch last ${hz.last && hz.last.date}: ${hz.last && hz.last.transits} transits (field ${hz.transit_field_guess}); 7d avg ${hz.avg_last7} = ${hz.pct_of_baseline_last7}% of the ~85/day baseline${hz.verify ? ' [VERIFY service URL/field]' : ''}` : `== HORMUZ == PortWatch FAIL ${S.hormuz_portwatch.error}`);
  const sl = d('hormuz_straits_live'); if (sl) P(`   straits.live ${sl.date}: ${sl.transits_mentioned !== null ? sl.transits_mentioned + ' transits mentioned; ' : ''}${(sl.text || '').slice(0, 500).replace(/\n/g, ' ')}`);
  P('\nSTATUS: ' + Object.entries(a.status).map(([k, v]) => `${k}=${v}`).join(' | '));
  return L.join('\n');
}

export async function health() {
  const probes = {
    coingecko: () => C.cgGlobal(), coinbase: () => C.cbTicker('BTC-USD'), fred: () => C.fredSeries('BAMLH0A0HYM2', ymd(new Date(Date.now() - 40 * 86400000))), defillama_stables: () => C.llamaStablecoins(), defillama_api: () => C.llamaChains(),
    hyperliquid: () => C.hyperliquidMeta(), okx: () => C.okxSwap('BTC-USDT-SWAP'), bybit: () => C.bybitTicker('BTCUSDT'), deribit: () => C.deribitPerp('BTC-PERPETUAL'), binance: () => C.binancePerp('BTCUSDT'), yahoo: () => C.yahooChart('^VIX', '5d'),
    fear_greed: () => C.fearGreed(1), farside: () => C.farside('btc'), polymarket: () => C.polymarketSearch('Fed'), coinmetrics: () => fetchJSON('https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=PriceUSD&frequency=1d&page_size=3&paging_from=end', { ttl: 60000 }), portwatch: () => C.portwatchHormuz(), straits_live: () => C.straitsBrief(), rss_fed: () => C.rss('fed'),
  };
  const names = Object.keys(probes);
  const res = await pmap(names, 6, async (n) => { const t0 = Date.now(); try { const v = await probes[n](); return { ok: true, ms: Date.now() - t0, sample: JSON.stringify(v).slice(0, 140) }; } catch (e) { return { ok: false, ms: Date.now() - t0, error: e.message }; } });
  const out = {}; names.forEach((n, i) => { out[n] = res[i]; });
  return { hub_version: HUB_VERSION, generated_utc: nowIso(), ok_count: res.filter((r) => r.ok).length, total: names.length, sources: out };
}
export function index(baseUrl = '') {
  const e = (p, d) => ({ path: p, doc: d });
  return { hub_version: HUB_VERSION, generated_utc: nowIso(), config_as_of: cfg.as_of, cache_rule: 'Add a fresh cache-buster (?cb=<UTC stamp>, vary the parameter NAME between runs) to every call. All responses carry Cache-Control: no-store.',
    endpoints: [
      e('/prices.json', 'legacy feed schema, ALL configured coins (portfolio + weekly + monthly + bench; NEAR + SYRUP included). ?group=portfolio · ?symbols=BTC,NEAR'),
      e('/api/prices', 'rich prices: Coinbase last/bid/ask/24h OHLC + CoinGecko mcap/volume/1h-7d-30d-1y %/ATH/FDV/supply + cycle-high distance'),
      e('/api/all', 'EVERYTHING for a scan in one call (≈10-25 s): prices, book, btc_structure, runner_flags, ks_pregrade, fred, stablecoins, macro, funding, etf_flows, global, fear_greed, llama, hormuz. ?full=1 adds onchain, polymarket, dat'),
      e('/api/brief', 'plain-text digest of /api/all built for WebFetch (short, explicit minus signs + UP/DOWN labels)'),
      e('/api/book', 'positions × live prices, order distances, POSSIBLE FILL flags (24h high/low through a limit)'),
      e('/api/btc-structure', 'Coinbase BTC-USD weekly closes → 20W/50W/200W, next-close gates, rising tests (strict + 4-wk slope), streaks, RSI, T09 levels, power law. ?days=1460'),
      e('/api/candles', 'clean daily candles newest-first + 7/30/60/90-day closes, 90d low/high, highest close since a date. ?symbol=NEAR&days=100&since=2026-09-16 (&granularity=3600)'),
      e('/api/wave', 'Wave Board mechanical stage candidates + sector medians/breadth. ?set=weekly|monthly · ?symbols=ZEC,UNI'),
      e('/api/flags', 'T20 runner flags (0.70 × highest close since date) — fired on the last completed close? live distance?'),
      e('/api/depth', 'order-book depth in USD at ±1/2/5% (thin-book lens). ?symbol=ONDO'),
      e('/api/fred', 'FRED CSV series + derived net liquidity (WALCL−TGA−RRP; 4w/13w), HY OAS 4w/8w change, Fed last move, Sahm, 2Y. ?series=WALCL,DGS2'),
      e('/api/stablecoins', 'DefiLlama total stablecoins + 1d/7d/4w/8w/13w deltas + top 10 + KS4 grade'),
      e('/api/macro', 'Yahoo quotes: MOVE (weekly closes), DXY, Brent, WTI, gold, VIX, yields, S&P, MSTR, COIN, HOOD, CRCL, IBIT, ETHA, Metaplanet. ?symbols=^MOVE,BZ=F'),
      e('/api/funding', 'Hyperliquid + OKX + Bybit + Deribit (+ Binance if reachable) funding/OI/volume per coin + BTC funding range + DVOL. ?coins=BTC,HYPE'),
      e('/api/okx-oi', 'OKX daily OI + volume history (USD). ?ccy=BTC&period=1D'),
      e('/api/derivatives', 'CoinGecko /derivatives filtered by index symbol (all venues: funding, OI, volume). ?symbol=HYPE'),
      e('/api/onchain', 'Coin Metrics BTC: MVRV, MVRV-Z, NUPL, Pi Cycle, Puell, Mayer, 2Y MA×5, 200W (CM), power law, drawdown (daily; ~1 MB upstream, cached 1h)'),
      e('/api/llama', 'DefiLlama value capture (TVL, fees/revenue/holders revenue 24h/7d/30d) for the book + candidates. ?symbols=HYPE,UNI · ?slug=morpho'),
      e('/api/llama-search', 'find a DefiLlama slug. ?q=aerodrome'),
      e('/api/etf-flows', 'Farside daily ETF flows + 5d/20d sums + outflow streaks + weekly sums. ?asset=btc|eth|sol'),
      e('/api/global', 'CoinGecko global: BTC/ETH dominance, total mcap, 24h change'),
      e('/api/fear-greed', 'alternative.me Fear & Greed (last, 7d/30d avg)'),
      e('/api/polymarket', 'Polymarket Gamma search. ?q=Fed decision October 2026 · ?slug=<event-slug>'),
      e('/api/hormuz', 'IMF PortWatch Hormuz transits (ArcGIS feature service — verify at first run) + straits.live daily brief text. ?date=2026-09-27'),
      e('/api/dat', 'digital-asset treasuries: CoinGecko public treasury list, MSTR / Metaplanet quotes, mNAV estimate when shares_outstanding is set in config'),
      e('/api/coin', 'CoinGecko coin detail (ATH, supply, market data). ?id=near'),
      e('/api/chart', 'CoinGecko market_chart history. ?id=bitcoin&days=365'),
      e('/api/search', 'CoinGecko id lookup. ?q=aster'),
      e('/api/coinbase-products', 'Coinbase Exchange product list + validation of every configured cb id'),
      e('/api/rss', 'headlines: ?feed=fed|fed_monetary|sec|cftc|treasury|coindesk|cointelegraph|theblock|decrypt|bls'),
      e('/api/edgar', 'SEC EDGAR full-text search. ?q="333-288870"&from=2026-09-01&to=2026-09-30&forms=8-K'),
      e('/api/fetch', 'whitelisted raw fetch (JSON or text). ?url=https://api.llama.fi/v2/chains'),
      e('/api/text', 'whitelisted fetch → plain text (HTML stripped). ?url=https://mnav.com/mnav/strategy&max=6000'),
      e('/api/health', 'probe every upstream source (ok/ms/error)'),
      e('/api/config', 'the live config (universe, positions, orders, flags, thresholds)'),
      e('/api/ks', 'kill-switch v3 mechanical pre-grade only (fred + stablecoins + structure + macro + farside + funding + global)'),
    ], snapshot: { github_raw: 'https://raw.githubusercontent.com/nathanmichaelmathews-ship-it/mathews-crypto-v2/main/data/latest.json', note: 'written hourly by the GitHub Action (scripts/snapshot.mjs); readable from the workspace shell with curl (raw.githubusercontent.com is allowlisted) — exact JSON, no summarizer' } };
}
