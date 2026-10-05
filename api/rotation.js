// api/rotation.js — NARRATIVE ROTATION BOARD v1.1 (Oct 4 2026): the sector-rotation layer on the Wave Board.
// v1.1 (after research SCREEN #30): one sector per coin (RWA + payments merged), THIN sectors (n < 4) carry cells only, the all-alt baseline U and S − U,
// a regime line, the AGED-HOT / AGED-CALM split, a CROWDED hint from Hyperliquid funding, SUPPLY flags from a dated unlock list.
// Self-contained (no lib imports): Coinbase Exchange public daily candles only, so it can be dropped into the hub's api/ folder as is.
// GET /api/rotation?set=monthly|weekly&weeks=13&text=1   (text=1 → plain-text digest for WebFetch)
// Everything here is INFORMATION. It never places, cancels or moves an order and never overrides a law (claude/STATE.md LAWS).
// Backtest of record (Coin Metrics, 40 assets, bull legs 2016-18 / 2019 / 2020-21 / 2023-25; claude/TOOLS.md rotation_bt.py, rotation_bt2.py):
//   · sector rank momentum has ~no persistence week to week (Spearman ≈ +0.05); leadership spells median 1-2 weeks
//   · a one-week #1 keeps #1 next week 52% of the time; after two weeks 73%; after five+ 75-83% → persistence filter = 2 reads
//   · the leader's next-8-week RS vs BTC: led 1 wk −7 pts (40% positive) · 2 wks +1 · 4-5 wks 0 (4w +8.5) · 6+ wks −11 (30% positive) = AGED
//   · a sector within 15% of its running high: next 8w RS +9 (60% positive); with breadth(50D) > 80%: +21; with 4w RS > +30 (parabolic): −1 (50%)
//   · coin level: within 15% of its cycle high +0.9 (51%); >70% below −9.9 (33%); RS30 > +60 and >70% below (a deep spike) −29 (23%);
//     within 30% of its high with RS30 < −10 (a leader pulling back) +10 (56-61%) = the preferred entry cell
export const config = { maxDuration: 60 };

const SECTORS = { // v1.1: ONE primary sector per coin (R1); PRIVACY is THIN (n < 4, R2) — cells only, never a LEADER state
  AI_DEPIN: ['TAO', 'NEAR', 'RENDER', 'ICP', 'FET', 'HNT'],
  RWA_PAY:  ['LINK', 'ONDO', 'PLUME', 'XRP', 'XLM', 'SKY'],
  DEFI_REV: ['HYPE', 'AAVE', 'UNI', 'AERO', 'MORPHO', 'SYRUP', 'PENDLE', 'ASTER', 'ENA'],
  L1:       ['ETH', 'SOL', 'SUI', 'AVAX', 'ADA', 'BNB'],
  MEMES:    ['PUMP', 'DOGE', 'BONK', 'PEPE'],
  PRIVACY:  ['ZEC', 'DASH'],
};
const MIN_MEMBERS = 4; // a sector below this is THIN: shown, cells computed, no LEADER state
const MAJORS = ['ETH', 'SOL', 'BNB']; // the beta reference line
// SUPPLY flags (R9): dated unlocks ≥ 3% of circulating; keep in step with claude/STATE.md CALENDAR; 'verified' = primary source seen
const UNLOCKS = [
  { sym: 'ENA', date: '2026-10-05', pct_circ: 14.3, verified: false, note: 'research SCREEN #30 (KuCoin aggregate) — unverified' },
  { sym: 'ASTER', date: '2026-10-05', pct_circ: 4.0, verified: false, note: 'research SCREEN #30 (KuCoin aggregate) — unverified' },
  { sym: 'HYPE', date: '2026-10-06', pct_circ: null, verified: false, note: 'core-contributor tranche (STATE CALENDAR); size unknown' },
];
const CROWDED_FUNDING = 0.03; // %/8h on Hyperliquid — the scan C2 threshold (the R8 decile rule waits for the Code session)
const WEEKLY = ['ETH', 'SOL', 'HYPE', 'LINK', 'ONDO', 'NEAR', 'MORPHO', 'TAO', 'AERO', 'SYRUP', 'AAVE', 'UNI', 'ZEC', 'DASH', 'RENDER', 'ICP', 'XRP', 'SUI', 'AVAX', 'BNB', 'PUMP', 'DOGE'];
const HELD = ['ETH', 'LINK', 'TAO', 'ONDO', 'AERO', 'MORPHO', 'HYPE', 'NEAR', 'SYRUP', 'SOL', 'SUI'];
// Cycle-high reference (CLOSE basis; claude/WAVE_BOARD.md table, re-verified Oct 1 2026). null → the 300-day window high is used and flagged.
const CYCLE_HIGH = {
  BTC: 124720.09, ETH: 4831, HYPE: 98.01, ZEC: 1693.2, LINK: 29.33, UNI: 18.68, AAVE: 382.98, XRP: 3.55, BNB: 1310, DASH: 121.85,
  ICP: 19.16, ADA: 1.23, DOGE: 0.465, XLM: 0.552, SUI: 5.35, SOL: 261.99, ONDO: 2.03833, NEAR: 8.857, AERO: 2.20784, SYRUP: 0.625,
  PUMP: 0.008623, RENDER: 13.214, AVAX: 60.68, FET: 3.2603, HNT: 10.053, BONK: 0.00005367, PEPE: 0.00002651, TAO: 760.18, MORPHO: 4.17,
  PENDLE: 6.114, ENA: 0.8101, ASTER: 1.216, SKY: 0.09636, PLUME: null,
};
const CELL_STATS = { // backtest reference for the coin-level cells (bull legs; next-8-week RS vs BTC, median / share positive)
  LEADER_PULLBACK: 'within 30% of its high and RS30 < −10 → +10 pts (56-61% positive, n=105)',
  NEAR_HIGH: 'within 15% of its high → +0.9 pts (51% positive, n=277)',
  WITHIN_30: '15-30% below its high → −2.6 pts (45% positive, n=281)',
  HOT: 'RS30 > +60 → −18 pts (32% positive, n=268) — the EXTENDED / do-not-chase cell',
  DEEP_SPIKE: '>70% below its high with RS30 > +60 → −29 pts (23% positive, n=104)',
  DEEP: '>70% below its high → −9.9 pts (33% positive, n=4,041); 50-70% below → −7.1 (37%)',
  MID: '30-50% below its high → −8.1 pts (39% positive, n=411)',
};

const DAY = 86400;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (a) => { const v = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); if (!v.length) return null; const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };
const share = (a) => { const v = a.filter((x) => x !== null && x !== undefined); return v.length ? v.filter(Boolean).length / v.length : null; };
const r2 = (x, d = 2) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toFixed(d)));

async function fetchCandles(sym, days = 300) {
  const end = new Date(); const start = new Date(end.getTime() - days * DAY * 1000);
  const url = `https://api.exchange.coinbase.com/products/${sym}-USD/candles?granularity=86400&start=${start.toISOString()}&end=${end.toISOString()}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'mathews-hub/rotation', Accept: 'application/json' } });
      if (res.status === 429 || res.status >= 500) { await sleep(600 * (attempt + 1)); continue; }
      if (!res.ok) return { error: `HTTP ${res.status}` };
      const rows = await res.json(); // [time, low, high, open, close, volume], newest first
      if (!Array.isArray(rows) || !rows.length) return { error: 'empty' };
      const todayUtc = Math.floor(Date.now() / 1000 / DAY) * DAY;
      const done = rows.filter((r) => r[0] < todayUtc).sort((a, b) => a[0] - b[0]); // completed UTC days only, ascending
      return { rows: done.map((r) => ({ t: r[0], low: r[1], high: r[2], open: r[3], close: r[4], vol: r[5] })) };
    } catch (e) { if (attempt === 2) return { error: String(e.message || e) }; await sleep(500); }
  }
  return { error: 'retries exhausted' };
}

async function fetchHyperliquidFunding() { // current funding (%/8h) + open interest per coin; one POST; optional (never fails the read)
  try {
    const res = await fetch('https://api.hyperliquid.xyz/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'metaAndAssetCtxs' }) });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const [meta, ctxs] = await res.json(); const out = {};
    meta.universe.forEach((u, i) => { const c = ctxs[i]; if (c) out[u.name] = { funding_8h_pct: Number(c.funding) * 100, oi_usd: Number(c.openInterest) * Number(c.markPx) }; });
    return { data: out };
  } catch (e) { return { error: String(e.message || e) }; }
}

function idxAtOrBefore(rows, t) { let lo = 0, hi = rows.length - 1, ans = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m].t <= t) { ans = m; lo = m + 1; } else hi = m - 1; } return ans; }

function coinMetrics(rows, btcRows, anchorT, cycleHigh) {
  const i = idxAtOrBefore(rows, anchorT); const j = idxAtOrBefore(btcRows, anchorT);
  if (i < 90 || j < 90) return null; // need 91 completed days
  const c = rows[i].close, b = btcRows[j].close;
  const ret = (n) => (i - n >= 0 ? c / rows[i - n].close - 1 : null);
  const bret = (n) => (j - n >= 0 ? b / btcRows[j - n].close - 1 : null);
  const rs = (n) => { const a = ret(n), k = bret(n); return a === null || k === null ? null : (a - k) * 100; };
  const win = rows.slice(Math.max(0, i - 89), i + 1);
  const hi90 = Math.max(...win.map((r) => r.close)); const lo90 = Math.min(...win.map((r) => r.low));
  const sma50 = rows.slice(i - 49, i + 1).reduce((s, r) => s + r.close, 0) / 50;
  const usd = (r) => r.vol * r.close;
  const v7 = rows.slice(i - 6, i + 1).reduce((s, r) => s + usd(r), 0) / 7; const v90 = win.reduce((s, r) => s + usd(r), 0) / win.length;
  const windowHigh = Math.max(...rows.slice(0, i + 1).map((r) => r.close));
  const ref = cycleHigh ?? windowHigh;
  return {
    close: c, ret7: ret(7) * 100, ret30: ret(30) * 100, ret60: ret(60) * 100, ret90: ret(90) * 100,
    rs7: rs(7), rs30: rs(30), rs90: rs(90), below: (c / ref - 1) * 100, refIsWindow: cycleHigh === null || cycleHigh === undefined,
    above50: c > sma50, atHigh90: c >= hi90 - 1e-12, x90lo: c / lo90, volRatio: v90 > 0 ? v7 / v90 : null,
    extended: ret(60) !== null && (ret(60) >= 1.0 || c / lo90 >= 3),
  };
}

function coinCell(m) {
  if (!m) return null;
  if (m.below >= -30 && m.rs30 < -10) return 'LEADER_PULLBACK';
  if (m.rs30 > 60) return m.below < -70 ? 'DEEP_SPIKE' : 'HOT';
  if (m.below >= -15) return 'NEAR_HIGH';
  if (m.below >= -30) return 'WITHIN_30';
  if (m.below >= -50) return 'MID';
  return 'DEEP';
}

export function compute(series, { set = 'monthly', weeks = 13, now = Date.now(), funding = null } = {}) {
  const btc = series.BTC; if (!btc || !btc.rows || btc.rows.length < 100) throw new Error('BTC candles missing');
  const universe = set === 'weekly' ? WEEKLY : [...new Set(Object.values(SECTORS).flat())];
  const lastT = btc.rows[btc.rows.length - 1].t; // last completed UTC day
  const anchors = []; for (let k = 0; k < weeks; k++) anchors.push(lastT - k * 7 * DAY); // newest first
  const coins = {}; const noData = [];
  for (const sym of universe) {
    const s = series[sym]; if (!s || !s.rows || s.rows.length < 100) { noData.push(sym); continue; }
    coins[sym] = anchors.map((t) => coinMetrics(s.rows, btc.rows, t, CYCLE_HIGH[sym]));
  }
  // sector table per anchor
  const sectorHist = {}; // sector -> array over anchors
  for (const [sec, members] of Object.entries(SECTORS)) {
    const mem = members.filter((m) => coins[m]);
    sectorHist[sec] = anchors.map((t, k) => {
      const ms = mem.map((m) => coins[m][k]).filter(Boolean);
      if (ms.length < 2) return null;
      return {
        n: ms.length, thin: ms.length < MIN_MEMBERS, rs7: median(ms.map((x) => x.rs7)), rs30: median(ms.map((x) => x.rs30)), rs90: median(ms.map((x) => x.rs90)),
        below: median(ms.map((x) => x.below)), breadth50: share(ms.map((x) => x.above50)), breadthRS: share(ms.map((x) => x.rs30 > 0)),
        newHighs90: share(ms.map((x) => x.atHigh90)), extendedShare: share(ms.map((x) => x.extended)), volRatio: median(ms.map((x) => x.volRatio)),
      };
    });
  }
  // ranks per anchor by median rs30
  const ranks = anchors.map((t, k) => { // ranked among NON-THIN sectors; thin sectors get rank null and are reported separately
    const live = Object.entries(sectorHist).filter(([, h]) => h[k] && !h[k].thin).sort((a, b) => b[1][k].rs30 - a[1][k].rs30);
    const r = {}; live.forEach(([sec], i) => { r[sec] = i + 1; }); return r;
  });
  const nSectors = Object.keys(ranks[0]).length;
  const leaderAt = (k) => Object.entries(ranks[k]).find(([, r]) => r === 1)?.[0] ?? null;
  // the all-alt baseline U (median RS30 of the universe vs BTC) per anchor, the MAJORS reference, and the regime line
  const Uhist = anchors.map((t, k) => median(Object.values(coins).map((a) => a[k]?.rs30)));
  const U7hist = anchors.map((t, k) => median(Object.values(coins).map((a) => a[k]?.rs7)));
  const above50hist = anchors.map((t, k) => share(Object.values(coins).map((a) => a[k] ? a[k].above50 : null)));
  const majors = median(MAJORS.filter((m) => coins[m] && coins[m][0]).map((m) => coins[m][0].rs30));
  const U = Uhist[0], U7 = U7hist[0], above50 = above50hist[0];
  const regime = U !== null && U < 0 && above50 !== null && above50 < 0.4 ? 'BTC REGIME — LOW CONFIDENCE' : U !== null && U > 0 && above50 !== null && above50 >= 0.6 ? 'ALT TIDE' : 'MIXED';
  const crowdedHint = (members) => { if (!funding) return null; const f = members.map((m) => funding[m]?.funding_8h_pct).filter((x) => Number.isFinite(x)); const med = median(f); return med === null ? null : { median_funding_8h_pct: r2(med, 4), crowded: med >= CROWDED_FUNDING, n: f.length }; };
  const today = new Date(now); const in14 = new Date(now + 14 * DAY * 1000);
  const supplyFlags = UNLOCKS.filter((u) => { const d = new Date(u.date + 'T00:00:00Z'); return d >= new Date(today.toISOString().slice(0, 10) + 'T00:00:00Z') && d <= in14 && (u.pct_circ === null || u.pct_circ >= 3); });
  const leader = leaderAt(0);
  let spell = 0; for (let k = 0; k < anchors.length; k++) { if (leaderAt(k) === leader && leader) spell++; else break; }
  const sectors = {}; const flags = [];
  for (const sec of Object.keys(SECTORS)) {
    const h = sectorHist[sec][0]; if (!h) { sectors[sec] = { state: 'NO_DATA' }; continue; }
    const rank = ranks[0][sec] ?? null, rank1 = ranks[1]?.[sec] ?? null, rank4 = ranks[4]?.[sec] ?? null;
    const crowd = crowdedHint(SECTORS[sec]); const supply = supplyFlags.filter((u) => SECTORS[sec].includes(u.sym));
    const b2 = sectorHist[sec][2]?.breadth50; const breadthDrop = h.breadth50 !== null && b2 !== null && b2 !== undefined ? (b2 - h.breadth50) * 100 : null;
    const wasLeaderRecently = [1, 2, 3, 4].some((k) => leaderAt(k) === sec);
    const confirmedLeader = rank === 1 && rank1 === 1;
    let state = 'NEUTRAL'; const why = [];
    if (h.below !== null && h.below < -50 && h.rs90 !== null && h.rs90 <= 0) { state = 'DORMANT'; why.push('median >50% below cycle high, RS90 ≤ 0'); }
    if (h.rs30 >= 10 && h.below < -40) { state = 'EMERGING'; why.push('median RS30 ≥ +10, >40% below cycle high'); }
    if (rank === 1 && !confirmedLeader) { state = 'LEADER_CANDIDATE'; why.length = 0; why.push('#1 this read, not last read — confirms on the next read (52% → 73% survival)'); }
    if (confirmedLeader) {
      state = 'LEADER'; why.length = 0; why.push(`#1 on ${spell} consecutive reads`);
      if (spell >= 6) { const hot = h.rs30 > 30 || (breadthDrop !== null && breadthDrop >= 20); state = hot ? 'LEADER_AGED_HOT' : 'LEADER_AGED_CALM'; why.push(`6+ weeks at #1: next-8w RS −11 median, 30% positive in the backtest${hot ? ' — HOT (S > +30 or breadth fell ≥ 20 pts over 2 reads)' : ' — CALM'}`); }
      else if (h.rs30 > 30 && h.below >= -15) { state = 'LEADER_PARABOLIC'; why.push('median RS30 > +30 within 15% of the high: edge gone (−1 median, 50%)'); }
      else if (h.below >= -15 && h.breadth50 >= 0.8 && h.rs30 <= 30) { state = 'LEADER_RIDING'; why.push('within 15% of high, breadth > 80%, RS30 ≤ +30: +21 median next 8w (60%)'); }
    }
    if (wasLeaderRecently && rank !== 1 && h.rs7 !== null && h.rs7 <= -10) { state = 'ROLLING_OVER'; why.push(`led within the last 4 reads, now rank ${rank} with median RS7 ${h.rs7.toFixed(1)}`); flags.push(`ROTATION OUT of ${sec} (candidate; confirms if it stays off #1 next read)`); }
    if (wasLeaderRecently && rank === 1 && h.rs7 !== null && h.rs7 <= -10) { why.push(`WARNING: still #1 on RS30 but median RS7 ${h.rs7.toFixed(1)} — leadership breaking on the week`); flags.push(`${sec}: #1 on 30 days, −${Math.abs(h.rs7).toFixed(0)} pts vs BTC on 7 days — rotation out in progress (unconfirmed)`); }
    if (rank !== null && rank <= 2 && [1, 2, 3].some((k) => (ranks[k]?.[sec] ?? 0) > nSectors / 2)) { flags.push(`ROTATION IN candidate: ${sec} from the bottom half to rank ${rank} within 3 weeks (no edge by itself in the backtest; needs a confirmed read + within 15% of its high + breadth > 80%)`); }
    if (h.newHighs90 !== null && h.below >= -15 && h.breadth50 !== null && h.breadth50 < 0.6) flags.push(`BREADTH DIVERGENCE: ${sec} near its high with breadth(50D) ${(h.breadth50 * 100).toFixed(0)}% (n=5 in the backtest: next 8w −26 median, 80% negative)`);
    if (h.thin) { state = 'THIN — cells only (n < ' + MIN_MEMBERS + ')' + (h.rs7 !== null && h.rs7 <= -10 && h.rs30 > 0 ? '; breaking on the week' : ''); }
    if (crowd && crowd.crowded) { why.push(`CROWDED hint: median Hyperliquid funding ${crowd.median_funding_8h_pct}%/8h ≥ ${CROWDED_FUNDING} — treat like PARABOLIC: no new entry`); flags.push(`CROWDED hint on ${sec}`); }
    for (const u of supply) flags.push(`SUPPLY ${u.sym} (${sec}) ${u.date} ${u.pct_circ === null ? 'size unknown' : u.pct_circ + '% of circulating'}${u.verified ? '' : ' — UNVERIFIED'}`);
    sectors[sec] = { rank, thin: h.thin, rank_change_1w: rank1 === null || rank === null ? null : rank1 - rank, rank_change_4w: rank4 === null || rank === null ? null : rank4 - rank, state, why,
      n: h.n, median_rs7: r2(h.rs7, 1), median_rs30: r2(h.rs30, 1), S_minus_U: r2(h.rs30 - U, 1), median_rs90: r2(h.rs90, 1), median_below_cycle_high: r2(h.below, 1),
      breadth_change_2reads_pts: r2(breadthDrop === null ? null : -breadthDrop, 0), crowded_hint: crowd, supply_flags: supply,
      breadth_above_50d: r2(h.breadth50), breadth_rs30_pos: r2(h.breadthRS), share_at_90d_high: r2(h.newHighs90), share_extended: r2(h.extendedShare), median_vol7_over_vol90: r2(h.volRatio),
      rank_history: anchors.map((t, k) => ranks[k]?.[sec] ?? null) };
  }
  const leaderHistory = anchors.map((t, k) => ({ anchor: new Date(t * 1000).toISOString().slice(0, 10), leader: leaderAt(k), rs30: r2(sectorHist[leaderAt(k)]?.[k]?.rs30, 1) }));
  const coinsOut = {};
  for (const sym of Object.keys(coins)) {
    const m = coins[sym][0]; if (!m) continue;
    coinsOut[sym] = { close: m.close, rs7: r2(m.rs7, 1), rs30: r2(m.rs30, 1), rs90: r2(m.rs90, 1), ret30: r2(m.ret30, 1), ret60: r2(m.ret60, 1), below_cycle_high: r2(m.below, 1), ref_is_window_high: m.refIsWindow,
      above_50d: m.above50, at_90d_high: m.atHigh90, x_90d_low: r2(m.x90lo), vol7_over_vol90: r2(m.volRatio), extended: m.extended, cell: coinCell(m), held: HELD.includes(sym),
      sectors: Object.entries(SECTORS).filter(([, v]) => v.includes(sym)).map(([k]) => k) };
  }
  const allAlts = Object.values(coins).map((a) => a[0]).filter(Boolean);
  const breadthAll = { n: allAlts.length, above_50d: r2(share(allAlts.map((x) => x.above50))), rs30_pos: r2(share(allAlts.map((x) => x.rs30 > 0))), rs7_pos: r2(share(allAlts.map((x) => x.rs7 > 0))), at_90d_high: r2(share(allAlts.map((x) => x.atHigh90))), extended: r2(share(allAlts.map((x) => x.extended))) };
  return { generated_utc: new Date(now).toISOString(), version: '1.1', set, last_completed_candle: new Date(lastT * 1000).toISOString().slice(0, 10), weeks, no_data: noData,
    baseline: { U_median_rs30_all_alts: r2(U, 1), U7_median_rs7: r2(U7, 1), majors_median_rs30: r2(majors, 1), share_above_50d: r2(above50), regime, U_history: Uhist.map((x) => r2(x, 1)) },
    leader: { sector: leader, spell_weeks: spell, state: sectors[leader]?.state ?? null }, leader_history: leaderHistory, sectors, flags, breadth_all_alts: breadthAll, coins: coinsOut, cell_stats: CELL_STATS,
    funding_source: funding ? 'hyperliquid metaAndAssetCtxs' : 'none (funding fetch failed or skipped)', supply_watch: UNLOCKS,
    notes: ['INFORMATION ONLY — never an order; the persistence filter is two consecutive weekly reads; states carry their reason in `why`.',
      'Sector score = median member RS30 vs BTC (the Wave Board convention); breadth_above_50d = share of members above their own 50-day SMA; below_cycle_high uses the WAVE_BOARD close-basis reference table (ref_is_window_high flags a 300-day window stand-in).'] };
}

export function digest(o) {
  const L = [];
  L.push(`ROTATION BOARD ${o.generated_utc} · last completed candle ${o.last_completed_candle} · set ${o.set} · no data: ${o.no_data.join(',') || 'none'}`);
  L.push(`BASELINE U (median all-alt RS30 vs BTC) ${o.baseline.U_median_rs30_all_alts >= 0 ? '+' : ''}${o.baseline.U_median_rs30_all_alts} · U7 ${o.baseline.U7_median_rs7 >= 0 ? '+' : ''}${o.baseline.U7_median_rs7} · MAJORS (ETH/SOL/BNB) ${o.baseline.majors_median_rs30 >= 0 ? '+' : ''}${o.baseline.majors_median_rs30} · above 50D ${o.baseline.share_above_50d === null ? 'NA' : Math.round(o.baseline.share_above_50d * 100) + '%'} · REGIME ${o.baseline.regime}`);
  L.push(`LEADER (median RS30, non-thin sectors): ${o.leader.sector} · spell ${o.leader.spell_weeks} wk · state ${o.leader.state}`);
  L.push('leader by week (newest first): ' + o.leader_history.map((x) => `${x.anchor}:${x.leader}(${x.rs30 >= 0 ? '+' : ''}${x.rs30})`).join(' · '));
  const sec = Object.entries(o.sectors).filter(([, s]) => s.state !== 'NO_DATA').sort((a, b) => (a[1].rank ?? 99) - (b[1].rank ?? 99));
  for (const [k, s] of sec) {
    const sgn = (x, d = 1) => (x === null ? 'NA' : (x >= 0 ? '+' : '') + Number(x).toFixed(d));
    const pct = (x) => (x === null ? 'NA' : `${Math.round(x * 100)}%`);
    L.push(`${k.padEnd(9)} rank ${s.rank ?? 'THIN'} · S−U ${s.S_minus_U === null ? 'NA' : (s.S_minus_U >= 0 ? '+' : '') + s.S_minus_U} (${s.rank_change_1w === null ? 'NA' : s.rank_change_1w > 0 ? 'UP ' + s.rank_change_1w : s.rank_change_1w < 0 ? 'DOWN ' + -s.rank_change_1w : 'flat'} vs last wk; ${s.rank_change_4w === null ? 'NA' : s.rank_change_4w > 0 ? 'UP ' + s.rank_change_4w : s.rank_change_4w < 0 ? 'DOWN ' + -s.rank_change_4w : 'flat'} vs 4 wk) · n ${s.n} · RS7 ${sgn(s.median_rs7)} · RS30 ${sgn(s.median_rs30)} · RS90 ${sgn(s.median_rs90)} · below high ${sgn(s.median_below_cycle_high)}% · breadth50D ${pct(s.breadth_above_50d)} · RS30>0 ${pct(s.breadth_rs30_pos)} · at 90d high ${pct(s.share_at_90d_high)} · extended ${pct(s.share_extended)} · vol7/90 ${s.median_vol7_over_vol90 ?? 'NA'} · STATE ${s.state}${s.why.length ? ' — ' + s.why.join('; ') : ''}`);
  }
  L.push('FLAGS: ' + (o.flags.length ? o.flags.join(' | ') : 'none'));
  const b = o.breadth_all_alts; L.push(`ALL-ALT BREADTH (n=${b.n}): above 50D ${Math.round(b.above_50d * 100)}% · RS30>0 ${Math.round(b.rs30_pos * 100)}% · RS7>0 ${Math.round(b.rs7_pos * 100)}% · at 90d high ${Math.round(b.at_90d_high * 100)}% · EXTENDED ${Math.round(b.extended * 100)}%`);
  L.push('HELD COINS (cell = backtest entry/avoid cell): ' + Object.entries(o.coins).filter(([, c]) => c.held).map(([k, c]) => `${k} ${c.cell} (RS30 ${c.rs30 >= 0 ? '+' : ''}${c.rs30}, ${c.below_cycle_high}% below${c.ref_is_window_high ? ' [window]' : ''}${c.extended ? ', EXTENDED' : ''})`).join(' · '));
  L.push('CELLS: ' + Object.entries(o.cell_stats).map(([k, v]) => `${k} = ${v}`).join(' | '));
  return L.join('\n');
}

export default async function handler(req, res) {
  try {
    const q = req.query || {}; const set = q.set === 'weekly' ? 'weekly' : 'monthly'; const weeks = Math.min(26, Math.max(4, parseInt(q.weeks || '13', 10) || 13));
    const universe = ['BTC', ...(set === 'weekly' ? WEEKLY : [...new Set(Object.values(SECTORS).flat())])];
    const series = {};
    for (let i = 0; i < universe.length; i += 6) { // Coinbase public rate limit ≈ 10 req/s
      const batch = universe.slice(i, i + 6);
      const got = await Promise.all(batch.map((s) => fetchCandles(s, 300)));
      batch.forEach((s, k) => { series[s] = got[k]; });
      if (i + 6 < universe.length) await sleep(350);
    }
    const hl = await fetchHyperliquidFunding();
    const out = compute(series, { set, weeks, funding: hl.data || null });
    out.fetch_errors = Object.fromEntries(Object.entries(series).filter(([, v]) => v.error).map(([k, v]) => [k, v.error]));
    if (hl.error) out.fetch_errors.hyperliquid = hl.error;
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Access-Control-Allow-Origin', '*');
    if (q.text === '1') { res.setHeader('Content-Type', 'text/plain; charset=utf-8'); return res.status(200).send(digest(out)); }
    return res.status(200).json(out);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: String(e.message || e), generated_utc: new Date().toISOString() });
  }
}
