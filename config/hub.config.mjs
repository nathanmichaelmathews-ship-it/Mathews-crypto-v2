// config/hub.config.mjs — THE ONE FILE TO EDIT when the universe, positions, orders, flags or thresholds change.
// Canonical state still lives in claude/STATE.md + the newest Mathews_Crypto_Portfolio_vNN.xlsx (project docs).
// The hub is a DATA TOOL: nothing here places, cancels or moves an order. Positions/orders below are informational
// snapshots ("as_of") used to compute live book value, rung distances and possible-fill flags.
//
// FIELDS per coin: symbol · name · cg (CoinGecko id) · cg_alt (fallback ids, tried when cg returns nothing) ·
//   cb (Coinbase Exchange product id, or null when not listed) · group: portfolio | weekly | monthly | bench | ref ·
//   sectors (Wave Board) · cycle_high {value, date, source, status} (Wave Board reference table, Sep 22 2026).

export default {
  as_of: '2026-09-27 v40 (Sep 27 2026 ≈ 9 PM PT) — positions/orders verified on the 12:47 PM PT orders screen + the Sep 27 close marks',
  site: { name: 'Mathews Crypto Data Hub', repo: 'https://github.com/nathanmichaelmathews-ship-it/mathews-crypto-v2' },

  coins: [
    // ---------------- PORTFOLIO (11) ----------------
    { symbol: 'BTC', name: 'Bitcoin', cg: 'bitcoin', cb: 'BTC-USD', group: 'portfolio', sectors: ['btc'],
      cycle_high: { value: 124824, date: '2025-10-06', source: 'Coin Metrics daily close (intraday ~126,198 per CMC)', status: 'verified' } },
    { symbol: 'ETH', name: 'Ethereum', cg: 'ethereum', cb: 'ETH-USD', group: 'portfolio', sectors: ['l1'],
      cycle_high: { value: 4831, date: '2025-08-22', source: 'Coin Metrics', status: 'verified' } },
    { symbol: 'SOL', name: 'Solana', cg: 'solana', cb: 'SOL-USD', group: 'portfolio', sectors: ['l1'],
      cycle_high: { value: 295, date: '2025-01-19', source: 'approx', status: 'approx' } },
    { symbol: 'LINK', name: 'Chainlink', cg: 'chainlink', cb: 'LINK-USD', group: 'portfolio', sectors: ['rwa'],
      cycle_high: { value: 29.33, date: '2024-12-15', source: 'Coin Metrics', status: 'verified' } },
    { symbol: 'TAO', name: 'Bittensor', cg: 'bittensor', cb: 'TAO-USD', group: 'portfolio', sectors: ['ai'],
      cycle_high: { value: 760.18, date: '2024-04-11', source: 'Coinbase page — verify', status: 'verify' } },
    { symbol: 'ONDO', name: 'Ondo', cg: 'ondo-finance', cb: 'ONDO-USD', group: 'portfolio', sectors: ['rwa'],
      cycle_high: { value: 2.14, date: '2024-12', source: 'approx', status: 'approx' } },
    { symbol: 'AERO', name: 'Aerodrome', cg: 'aerodrome-finance', cb: 'AERO-USD', group: 'portfolio', sectors: ['defi'],
      cycle_high: { value: 2.32, date: null, source: 'approx', status: 'approx' } },
    { symbol: 'MORPHO', name: 'Morpho', cg: 'morpho', cb: 'MORPHO-USD', group: 'portfolio', sectors: ['defi'],
      cycle_high: { value: 4.0, date: '2025', source: 'unverified', status: 'unverified' } },
    { symbol: 'HYPE', name: 'Hyperliquid', cg: 'hyperliquid', cb: 'HYPE-USD', group: 'portfolio', sectors: ['defi'],
      cycle_high: { value: 97.23, date: '2026-09', source: 'STATE T11 close-high (running; in price discovery)', status: 'running' } },
    { symbol: 'NEAR', name: 'NEAR Protocol', cg: 'near', cb: 'NEAR-USD', group: 'portfolio', sectors: ['ai', 'l1'],
      cycle_high: { value: 8.9, date: '2024-03', source: 'approx', status: 'approx' } },
    { symbol: 'SYRUP', name: 'Maple Finance (SYRUP)', cg: 'maple-finance', cg_alt: ['syrup'], cb: 'SYRUP-USD', group: 'portfolio', sectors: ['defi', 'rwa'],
      cycle_high: { value: 0.6557, date: '2025-06-25', source: 'verify', status: 'verify' } },

    // ---------------- WEEKLY WAVE SET (Sunday scan; 23 coins with the portfolio) ----------------
    { symbol: 'AAVE', name: 'Aave', cg: 'aave', cb: 'AAVE-USD', group: 'weekly', sectors: ['defi'],
      cycle_high: { value: 382.98, date: '2024-12-23', source: 'Coin Metrics', status: 'verified' } },
    { symbol: 'UNI', name: 'Uniswap', cg: 'uniswap', cb: 'UNI-USD', group: 'weekly', sectors: ['defi'],
      cycle_high: { value: 18.68, date: '2024-12-08', source: 'Coin Metrics', status: 'verified' } },
    { symbol: 'ZEC', name: 'Zcash', cg: 'zcash', cb: 'ZEC-USD', group: 'weekly', sectors: ['privacy'],
      cycle_high: { value: 1515, date: '2026-09-22', source: 'running high (absolute ATH ~5,942 Oct 2016 is NOT the reference)', status: 'running' } },
    { symbol: 'DASH', name: 'Dash', cg: 'dash', cb: 'DASH-USD', group: 'weekly', sectors: ['privacy'],
      cycle_high: { value: 121.85, date: '2025-11-04', source: 'Coin Metrics', status: 'verified' } },
    { symbol: 'RENDER', name: 'Render', cg: 'render-token', cb: 'RENDER-USD', group: 'weekly', sectors: ['ai'], cycle_high: null },
    { symbol: 'ICP', name: 'Internet Computer', cg: 'internet-computer', cb: 'ICP-USD', group: 'weekly', sectors: ['ai'],
      cycle_high: { value: 19.16, date: '2024-03-26', source: 'Coin Metrics', status: 'verified' } },
    { symbol: 'XRP', name: 'XRP', cg: 'ripple', cb: 'XRP-USD', group: 'weekly', sectors: ['rwa', 'payments'],
      cycle_high: { value: 3.55, date: '2025-07-21', source: 'Coin Metrics', status: 'verified' } },
    { symbol: 'SUI', name: 'Sui', cg: 'sui', cb: 'SUI-USD', group: 'weekly', sectors: ['l1'],
      cycle_high: { value: 5.35, date: '2025-01-06', source: 'Wave Board', status: 'verified' } },
    { symbol: 'AVAX', name: 'Avalanche', cg: 'avalanche-2', cb: 'AVAX-USD', group: 'weekly', sectors: ['l1'], cycle_high: null },
    { symbol: 'BNB', name: 'BNB', cg: 'binancecoin', cb: 'BNB-USD', group: 'weekly', sectors: ['l1'],
      cycle_high: { value: 1310, date: '2025-10-07', source: 'Coin Metrics', status: 'verified' } },
    { symbol: 'PUMP', name: 'Pump.fun', cg: 'pump-fun', cb: 'PUMP-USD', group: 'weekly', sectors: ['memes'],
      cycle_high: { value: 0.00893, date: '2025-09-14', source: 'verify', status: 'verify' } },
    { symbol: 'DOGE', name: 'Dogecoin', cg: 'dogecoin', cb: 'DOGE-USD', group: 'weekly', sectors: ['memes'],
      cycle_high: { value: 0.465, date: '2024-12-08', source: 'Coin Metrics', status: 'verified' } },

    // ---------------- MONTHLY WAVE SET (month-start read) ----------------
    { symbol: 'FET', name: 'Fetch.ai / ASI', cg: 'fetch-ai', cg_alt: ['artificial-superintelligence-alliance'], cb: 'FET-USD', group: 'monthly', sectors: ['ai'], cycle_high: null },
    { symbol: 'HNT', name: 'Helium', cg: 'helium', cb: 'HNT-USD', group: 'monthly', sectors: ['ai'], cycle_high: null },
    { symbol: 'XLM', name: 'Stellar', cg: 'stellar', cb: 'XLM-USD', group: 'monthly', sectors: ['rwa', 'payments'],
      cycle_high: { value: 0.552, date: '2024-12-01', source: 'Coin Metrics', status: 'verified' } },
    { symbol: 'PLUME', name: 'Plume', cg: 'plume', cb: 'PLUME-USD', group: 'monthly', sectors: ['rwa'], cycle_high: null },
    { symbol: 'SKY', name: 'Sky (ex-Maker)', cg: 'sky', cb: 'SKY-USD', group: 'monthly', sectors: ['rwa', 'payments'], cycle_high: null },
    { symbol: 'PENDLE', name: 'Pendle', cg: 'pendle', cb: 'PENDLE-USD', group: 'monthly', sectors: ['defi'], cycle_high: null },
    { symbol: 'ASTER', name: 'Aster', cg: 'aster-2', cg_alt: ['aster', 'aster-dex'], cb: 'ASTER-USD', group: 'monthly', sectors: ['defi'], cycle_high: null },
    { symbol: 'ENA', name: 'Ethena', cg: 'ethena', cb: 'ENA-USD', group: 'monthly', sectors: ['defi'], cycle_high: null },
    { symbol: 'ADA', name: 'Cardano', cg: 'cardano', cb: 'ADA-USD', group: 'monthly', sectors: ['l1'],
      cycle_high: { value: 1.23, date: '2024-12-06', source: 'Coin Metrics', status: 'verified' } },
    { symbol: 'BONK', name: 'Bonk', cg: 'bonk', cb: 'BONK-USD', group: 'monthly', sectors: ['memes'], cycle_high: null },
    { symbol: 'PEPE', name: 'Pepe', cg: 'pepe', cb: 'PEPE-USD', group: 'monthly', sectors: ['memes'], cycle_high: null },

    // ---------------- BENCH / HUNTER (screens #1-#16) ----------------
    { symbol: 'JTO', name: 'Jito', cg: 'jito-governance-token', cb: 'JTO-USD', group: 'bench', sectors: ['defi'], cycle_high: null },
    { symbol: 'KMNO', name: 'Kamino', cg: 'kamino', cb: 'KMNO-USD', group: 'bench', sectors: ['defi'], cycle_high: null },
    { symbol: 'RAY', name: 'Raydium', cg: 'raydium', cb: 'RAY-USD', group: 'bench', sectors: ['defi'], cycle_high: null },
    { symbol: 'DRIFT', name: 'Drift', cg: 'drift-protocol', cb: 'DRIFT-USD', group: 'bench', sectors: ['defi'], cycle_high: null },
    { symbol: 'VELO', name: 'Velodrome', cg: 'velodrome-finance', cb: 'VELO-USD', group: 'bench', sectors: ['defi'], cycle_high: null },
    { symbol: 'PYTH', name: 'Pyth', cg: 'pyth-network', cb: 'PYTH-USD', group: 'bench', sectors: ['infra'], cycle_high: null },
    { symbol: 'ZRO', name: 'LayerZero', cg: 'layerzero', cb: 'ZRO-USD', group: 'bench', sectors: ['infra'], cycle_high: null },
    { symbol: 'QNT', name: 'Quant', cg: 'quant-network', cb: 'QNT-USD', group: 'bench', sectors: ['rwa'], cycle_high: null },
    { symbol: 'ETHFI', name: 'ether.fi', cg: 'ether-fi', cb: 'ETHFI-USD', group: 'bench', sectors: ['defi'], cycle_high: null },
    { symbol: 'LDO', name: 'Lido', cg: 'lido-dao', cb: 'LDO-USD', group: 'bench', sectors: ['defi'], cycle_high: null },
    { symbol: 'CAKE', name: 'PancakeSwap', cg: 'pancakeswap-token', cb: 'CAKE-USD', group: 'bench', sectors: ['defi'], cycle_high: null },
    { symbol: 'SPK', name: 'Spark', cg: 'spark-2', cg_alt: ['spark'], cb: 'SPK-USD', group: 'bench', sectors: ['defi'], cycle_high: null },
    { symbol: 'GRASS', name: 'Grass', cg: 'grass', cb: 'GRASS-USD', group: 'bench', sectors: ['ai'], cycle_high: null },
    { symbol: 'WAL', name: 'Walrus', cg: 'walrus-2', cg_alt: ['walrus'], cb: 'WAL-USD', group: 'bench', sectors: ['infra'], cycle_high: null },
    { symbol: 'XMR', name: 'Monero (not on Coinbase)', cg: 'monero', cb: null, group: 'bench', sectors: ['privacy'], cycle_high: null },

    // ---------------- REFERENCE ----------------
    { symbol: 'USDT', name: 'Tether', cg: 'tether', cb: 'USDT-USD', group: 'ref', sectors: ['stables'], cycle_high: null },
    { symbol: 'USDC', name: 'USD Coin', cg: 'usd-coin', cb: null, group: 'ref', sectors: ['stables'], cycle_high: null },
    { symbol: 'USDE', name: 'Ethena USDe', cg: 'ethena-usde', cb: null, group: 'ref', sectors: ['stables'], cycle_high: null },
  ],

  // Wave Board sectors (WAVE_BOARD.md, Sep 22 2026). A coin may sit in two sectors.
  sectors: {
    privacy: ['ZEC', 'DASH'],
    ai: ['TAO', 'NEAR', 'RENDER', 'ICP', 'FET', 'HNT'],
    rwa: ['LINK', 'ONDO', 'XRP', 'XLM', 'PLUME', 'SKY'],
    defi: ['HYPE', 'AAVE', 'UNI', 'AERO', 'MORPHO', 'SYRUP', 'PENDLE', 'ASTER', 'ENA'],
    l1: ['ETH', 'SOL', 'SUI', 'AVAX', 'ADA', 'BNB'],
    memes: ['PUMP', 'DOGE', 'BONK', 'PEPE'],
    payments: ['XRP', 'XLM', 'SKY'],
  },
  wave_weekly_set: ['BTC', 'ETH', 'SOL', 'HYPE', 'LINK', 'ONDO', 'NEAR', 'MORPHO', 'TAO', 'AERO', 'SYRUP', 'AAVE', 'UNI', 'ZEC', 'DASH', 'RENDER', 'ICP', 'XRP', 'SUI', 'AVAX', 'BNB', 'PUMP', 'DOGE'],

  // ---------------- POSITIONS (sheet v40 Portfolio tab, Sep 27 2026; qty · avg cost · sheet target) ----------------
  positions: [
    { symbol: 'ETH', qty: 16.00009977, avg_cost: 2100.63, target: 8000, venue: 'Coinbase + Robinhood (2.52 ETH under RH sells)' },
    { symbol: 'LINK', qty: 1563.9434248, avg_cost: 12.75, target: 50, venue: 'Coinbase + Robinhood (328.03 LINK under RH sells)' },
    { symbol: 'TAO', qty: 42.99167469, avg_cost: 220.69, target: 740, venue: 'Coinbase' },
    { symbol: 'ONDO', qty: 39142.69830469, avg_cost: 0.70, target: 0.80, venue: 'Coinbase', note: 'L3 mandate: 29,850 out by Nov 24 2026 (T02b: daily close < 0.43 → sell the rest next morning)' },
    { symbol: 'AERO', qty: 17328.53125748, avg_cost: 0.4797, target: 2.0, venue: 'Coinbase' },
    { symbol: 'MORPHO', qty: 5135.91396466, avg_cost: 1.25, target: 8.0, venue: 'Coinbase' },
    { symbol: 'HYPE', qty: 397.47471178, avg_cost: 45.38, target: 250, venue: 'Coinbase' },
    { symbol: 'NEAR', qty: 3670.94, avg_cost: 1.8827, target: 9.0, venue: 'Coinbase', note: 'NO resting sells (Sep 27) — T20 runner flag is the only exit' },
    { symbol: 'SYRUP', qty: 45190.33270043, avg_cost: 0.173, target: 0.85, venue: 'Coinbase' },
    { symbol: 'SOL', qty: 55.98547617, avg_cost: 121.601664751903, target: 240, venue: 'Coinbase', note: 'T18-E $10K plan; −8% leg 30 @ 112.79 resting' },
  ],
  btc_sleeve: { qty: 0.166319, avg_cost: 69709.9549660592, invested: 11594.06, note: 'sacred DCA sleeve — $1,000 on the 1st, never sold, never bucket money (L4)' },
  cash: { usdc: 10035.56, held_by_orders: 3395.54, redeploy_bucket: 9987.58, note: 'USDC on Coinbase at Sep 27 (fill #13 reconciled to the cent); $3,395.54 of it is held by the SOL 30 @ 112.79 buy' },

  // ---------------- RESTING ORDERS (verified Sep 27 2026 12:47 PM PT orders screen) ----------------
  orders: [
    { venue: 'Coinbase', symbol: 'SOL', side: 'BUY', qty: 30, limit: 112.79, label: 'T18 −8% leg ($3,395.54 held)' },
    { venue: 'Coinbase', symbol: 'AERO', side: 'SELL', qty: 1400, limit: 1.12, label: 'R1-b (confirmed live Sep 27)' },
    { venue: 'Coinbase', symbol: 'AERO', side: 'SELL', qty: 1947, limit: 1.50, label: 'R2' },
    { venue: 'Coinbase', symbol: 'ONDO', side: 'SELL', qty: 4000, limit: 0.61, label: 'mandate rung' },
    { venue: 'Coinbase', symbol: 'TAO', side: 'SELL', qty: 5.5, limit: 560, label: 'R2' },
    { venue: 'Coinbase', symbol: 'HYPE', side: 'SELL', qty: 25, limit: 101, label: 'R0-b' },
    { venue: 'Coinbase', symbol: 'HYPE', side: 'SELL', qty: 41.7, limit: 140, label: 'R1' },
    { venue: 'Coinbase', symbol: 'HYPE', side: 'SELL', qty: 37.9, limit: 160, label: 'R2' },
    { venue: 'Coinbase', symbol: 'MORPHO', side: 'SELL', qty: 675, limit: 3.45, label: 'R1' },
    { venue: 'Coinbase', symbol: 'MORPHO', side: 'SELL', qty: 614, limit: 4.50, label: 'R2' },
    { venue: 'Coinbase', symbol: 'SYRUP', side: 'SELL', qty: 4929, limit: 0.55, label: 'rung' },
    { venue: 'Robinhood', symbol: 'ETH', side: 'SELL', qty: 1.32, limit: 4500, label: 'RH L1' },
    { venue: 'Robinhood', symbol: 'ETH', side: 'SELL', qty: 1.20, limit: 5450, label: 'RH L2' },
    { venue: 'Robinhood', symbol: 'LINK', side: 'SELL', qty: 172.03, limit: 23.50, label: 'RH L1' },
    { venue: 'Robinhood', symbol: 'LINK', side: 'SELL', qty: 156, limit: 28, label: 'RH L2' },
  ],

  // ---------------- RUNNER FLAGS (T20; CLOSE basis; edge-triggered; information → Nathan decides) ----------------
  runner_flags: [
    { symbol: 'NEAR', rule: '0.70 × highest Coinbase daily close since 2026-09-16', since: '2026-09-16', factor: 0.70, note: 'ALL 3,670.94 NEAR unordered; the flag is the only exit (exit-next-morning rule PROPOSED, not adopted)' },
    { symbol: 'AERO', rule: '0.70 × highest Coinbase daily close since 2026-09-16', since: '2026-09-16', factor: 0.70 },
    { symbol: 'HYPE', rule: 'T11: a daily close < 68.06 = 0.70 × the 97.23 close-high', since: '2025-01-01', factor: 0.70, fixed_level: 68.06 },
  ],

  // ---------------- LEVELS & THRESHOLDS carried from STATE.md (the hub recomputes what it can live) ----------------
  levels: {
    btc_cycle_high_close: 124824,              // MAXED arms only on a Coinbase daily close above this
    t09_90d_high_carried: 87397,               // Sep 21 2026 Coinbase daily high (the hub recomputes the 90-day high live)
    t09_confirmed_path_pct: [-0.08, -0.15, -0.22],   // after a confirmed 50W reclaim: 80,405 / 74,287 / 68,170 from 87,397
    t09_unconfirmed_path_pct: [-0.15, -0.25, -0.35], // before confirmation: 74,287 / 65,548 / 56,808
    invalidation_weekly_close: 58000,          // weekly-close gates (resolve Sunday 23:59:59 UTC only)
    add_zone_shift_weekly_close: 70000,
    ondo: { t02_close_below: 0.30, t02b_close_below: 0.43, t02b_until: '2026-11-24', mandate_qty: 29850, mandate_deadline: '2026-11-24', t01_tripwire: 0.48 },
    sol_t18: { cancel_if_ks_at_or_above: 30, halt_if_close_below: 95, backstop_date: '2026-12-28' },
    power_law: { a: 1.22e-17, k: 5.8, genesis: '2009-01-03', max_dca_ratio: 0.6 },
  },

  // Kill-switch v3 thresholds (skill mathews-protocol-v3 §Step 2) — used only to PRE-GRADE the mechanical signals.
  ks_v3: {
    weights: { liquidity: 25, credit: 20, trend: 15, stablecoins: 15, etf: 10, oil: 5, dat: 5, leverage: 5, dominance: 0 },
    liquidity: { netliq_13w_red: -0.02 },
    credit: { oas_red: 5.0, oas_amber_lo: 4.0, oas_4w_red_bp: 100, oas_4w_amber_bp: 50, oas_4w_red_floor: 3.5, move_red: 120, move_amber: 100 },
    stablecoins: { d8w_red: -0.03 },
    etf: { streak_days_amber: 5, streak_weeks_red: 2 },
    oil: { brent_amber: 100 },
    leverage: { funding_8h_amber: 0.0005, deriv_spot_ratio_amber: 5 },
    tiers: { trim: 30, full_exit: 50 },
    fast_trigger: { oas: 5.0, oas_alt: 3.5, oas_alt_4w_bp: 100, move: 120, sahm: 0.5, hike_days: 90 },
  },

  // ---------------- MACRO (Yahoo Finance v8 chart symbols) ----------------
  macro_symbols: [
    { sym: '^MOVE', name: 'MOVE (ICE BofAML Treasury vol)' }, { sym: '^VIX', name: 'VIX' }, { sym: 'DX-Y.NYB', name: 'DXY' },
    { sym: 'BZ=F', name: 'Brent front-month' }, { sym: 'CL=F', name: 'WTI front-month' }, { sym: 'GC=F', name: 'Gold' },
    { sym: '^TNX', name: 'US 10Y yield (×10 on Yahoo)' }, { sym: '^FVX', name: 'US 5Y yield (×10)' }, { sym: '^IRX', name: 'US 13-wk bill (×10)' },
    { sym: '^GSPC', name: 'S&P 500' }, { sym: '^NDX', name: 'Nasdaq-100' }, { sym: 'HYG', name: 'HY bond ETF' }, { sym: 'TLT', name: '20Y+ Treasury ETF' },
    { sym: 'MSTR', name: 'Strategy' }, { sym: 'COIN', name: 'Coinbase' }, { sym: 'HOOD', name: 'Robinhood' }, { sym: 'CRCL', name: 'Circle' },
    { sym: 'IBIT', name: 'iShares Bitcoin Trust' }, { sym: 'ETHA', name: 'iShares Ethereum Trust' }, { sym: '3350.T', name: 'Metaplanet (Tokyo)' },
  ],

  // ---------------- FRED series (CSV: https://fred.stlouisfed.org/graph/fredgraph.csv?id=<ID>) ----------------
  fred_series: [
    { id: 'WALCL', name: 'Fed total assets', units: '$ millions, weekly (Wed)' },
    { id: 'WTREGEN', name: 'Treasury General Account', units: '$ billions, weekly (Wed)' },
    { id: 'RRPONTSYD', name: 'ON RRP', units: '$ billions, daily' },
    { id: 'BAMLH0A0HYM2', name: 'HY OAS', units: '%, daily' },
    { id: 'SAHMREALTIME', name: 'Sahm rule (real-time)', units: 'pct pts, monthly' },
    { id: 'DFEDTARU', name: 'Fed funds target upper', units: '%, daily' },
    { id: 'DFF', name: 'Effective fed funds', units: '%, daily' },
    { id: 'DGS2', name: '2Y Treasury', units: '%, daily' },
    { id: 'DGS10', name: '10Y Treasury', units: '%, daily' },
    { id: 'T10Y2Y', name: '10Y-2Y spread', units: 'pct pts, daily' },
    { id: 'DTWEXBGS', name: 'Broad dollar index', units: 'index, daily' },
    { id: 'VIXCLS', name: 'VIX close', units: 'index, daily' },
    { id: 'DCOILBRENTEU', name: 'Brent (EIA, lagged)', units: '$/bbl, daily' },
  ],

  // ---------------- DefiLlama slugs (candidates tried in order; "verify" = confirm at first run) ----------------
  llama: {
    protocols: {
      HYPE: ['hyperliquid'], MORPHO: ['morpho', 'morpho-blue'], AERO: ['aerodrome-slipstream', 'aerodrome-v1', 'aerodrome'], SYRUP: ['maple', 'syrup'],
      ONDO: ['ondo-finance'], LINK: ['chainlink'], UNI: ['uniswap'], AAVE: ['aave'], PUMP: ['pump.fun', 'pumpfun'], JTO: ['jito'], KMNO: ['kamino', 'kamino-lend'],
      RAY: ['raydium'], PENDLE: ['pendle'], ENA: ['ethena'], SKY: ['sky-lending', 'sky', 'makerdao'], SPK: ['spark'], ETHFI: ['ether.fi'], LDO: ['lido'],
      CAKE: ['pancakeswap'], VELO: ['velodrome-v3', 'velodrome-v2', 'velodrome'], DRIFT: ['drift', 'drift-trade'], ASTER: ['aster', 'aster-dex'], SUI: ['sui-chain'],
    },
    chains: ['Ethereum', 'Solana', 'Base', 'Hyperliquid L1', 'Near', 'Sui', 'BSC', 'Arbitrum', 'Avalanche', 'Plume Mainnet'],
  },

  // ---------------- Derivatives instruments ----------------
  okx_instruments: ['BTC-USDT-SWAP', 'ETH-USDT-SWAP', 'SOL-USDT-SWAP', 'HYPE-USDT-SWAP', 'LINK-USDT-SWAP', 'TAO-USDT-SWAP', 'NEAR-USDT-SWAP', 'ONDO-USDT-SWAP', 'SUI-USDT-SWAP', 'ZEC-USDT-SWAP', 'AAVE-USDT-SWAP', 'UNI-USDT-SWAP'],
  bybit_symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'HYPEUSDT', 'LINKUSDT', 'TAOUSDT', 'NEARUSDT', 'ONDOUSDT'],
  hyperliquid_coins: ['BTC', 'ETH', 'SOL', 'HYPE', 'LINK', 'TAO', 'NEAR', 'ONDO', 'AERO', 'MORPHO', 'SYRUP', 'AAVE', 'UNI', 'ZEC', 'SUI', 'XRP', 'DOGE', 'BNB', 'PUMP', 'AVAX', 'ENA', 'PENDLE'],

  // ---------------- Polymarket (Gamma API) tracked searches ----------------
  polymarket_queries: ['Fed decision October 2026', 'Fed rate cut 2026', 'Bitcoin price December 2026', 'Bitcoin all time high 2026', 'Strait of Hormuz', 'US recession 2026', 'Ethereum price 2026', 'Solana ETF'],

  // ---------------- Oil / Hormuz (PortWatch chokepoint feature service — VERIFY the URL at first run; straits.live daily brief) ----------------
  hormuz: {
    baseline_transits_per_day: 85,
    portwatch_query_url: 'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query',
    portwatch_where: "portname='Strait of Hormuz'",
    straits_live_brief: 'https://straits.live/briefs/{date}',
    verify: true,
  },

  // ---------------- DAT (digital-asset treasuries) — shares for mNAV; UPDATE when a filing changes them ----------------
  dat: {
    strategy: { yahoo: 'MSTR', btc_holdings_source: 'coingecko public_treasury', shares_outstanding: null, note: 'set shares_outstanding (fully diluted, from the latest 8-K/10-Q) to get mNAV = market cap ÷ (BTC held × BTC price); null → the hub reports holdings and price only' },
    metaplanet: { yahoo: '3350.T', shares_outstanding: null, last_purchase_carried: '2026-06-30 (2,820 BTC; mnav.com 0.82 on Sep 28 2026)' },
  },

  // ---------------- RSS feeds (whitelist) ----------------
  rss: {
    fed: 'https://www.federalreserve.gov/feeds/press_all.xml',
    fed_monetary: 'https://www.federalreserve.gov/feeds/press_monetary.xml',
    sec: 'https://www.sec.gov/news/pressreleases.rss',
    cftc: 'https://www.cftc.gov/RSS/RSSGP/rssgp.xml',
    treasury: 'https://home.treasury.gov/system/files/126/ofac.xml',
    coindesk: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    cointelegraph: 'https://cointelegraph.com/rss',
    theblock: 'https://www.theblock.co/rss.xml',
    decrypt: 'https://decrypt.co/feed',
    bls: 'https://www.bls.gov/feed/news_release/cpi.rss',
  },

  // ---------------- /api/fetch and /api/text whitelist (exact hostnames; https only; GET only) ----------------
  fetch_whitelist: [
    'api.coingecko.com', 'pro-api.coingecko.com', 'api.exchange.coinbase.com', 'api.coinbase.com', 'api.llama.fi', 'stablecoins.llama.fi', 'coins.llama.fi', 'defillama.com',
    'fred.stlouisfed.org', 'query1.finance.yahoo.com', 'query2.finance.yahoo.com', 'api.hyperliquid.xyz', 'www.okx.com', 'api.bybit.com', 'www.deribit.com', 'fapi.binance.com',
    'gamma-api.polymarket.com', 'clob.polymarket.com', 'community-api.coinmetrics.io', 'raw.githubusercontent.com', 'api.alternative.me', 'farside.co.uk', 'straits.live',
    'services9.arcgis.com', 'portwatch.imf.org', 'www.federalreserve.gov', 'www.sec.gov', 'efts.sec.gov', 'www.cftc.gov', 'home.treasury.gov', 'www.bls.gov',
    'api.coinalyze.net', 'coinalyze.net', 'mnav.com', 'tokenomist.ai', 'www.coindesk.com', 'cointelegraph.com', 'www.theblock.co', 'decrypt.co', 'mempool.space',
    'api.blockchain.info', 'blockchain.info', 'www.tradingeconomics.com', 'tradingeconomics.com', 'www.clevelandfed.org', 'www.newyorkfed.org', 'markets.newyorkfed.org',
    'www.treasurydirect.gov', 'api.fiscaldata.treasury.gov', 'www.cmegroup.com', 'www.cboe.com', 'cdn.cboe.com', 'www.tally.xyz', 'api.tally.xyz', 'rwa.xyz', 'app.rwa.xyz',
    'www.coinglass.com', 'open-api.coinglass.com', 'api.dexscreener.com', 'api.geckoterminal.com', 'api.kraken.com', 'api.gemini.com', 'api.bitstamp.net', 'www.bitstamp.net',
    'api.binance.com', 'api.binance.us', 'data-api.binance.vision', 'api.kucoin.com', 'api.exchange.cryptomkt.com', 'api.artemis.xyz', 'app.artemis.xyz', 'growthepie.xyz', 'api.growthepie.xyz',
    'hyperliquid.xyz', 'stats-data.hyperliquid.xyz', 'api.hypurrscan.io', 'api.dune.com', 'ultrasound.money', 'www.theblockbeats.info', 'api.polymarket.com',
  ],
};
