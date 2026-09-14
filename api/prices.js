// api/prices.js — Mathews crypto feed (drop-in replacement)
// Adds: NEAR · Cache-Control: no-store (fixes daily-stale cache)
// Schema identical to existing feed output.

const COINS = [
  { symbol: "BTC",    id: "bitcoin" },
  { symbol: "ETH",    id: "ethereum" },
  { symbol: "XRP",    id: "ripple" },
  { symbol: "HYPE",   id: "hyperliquid" },
  { symbol: "LINK",   id: "chainlink" },
  { symbol: "SUI",    id: "sui" },
  { symbol: "TAO",    id: "bittensor" },
  { symbol: "ONDO",   id: "ondo-finance" },
  { symbol: "MORPHO", id: "morpho" },
  { symbol: "AERO",   id: "aerodrome-finance" },
  { symbol: "ATH",    id: "aethir" },
  { symbol: "PLUME",  id: "plume" },
  { symbol: "NEAR",   id: "near" } ,   { symbol: "SYRUP",  id: "syrup" },
  { symbol: "SKY",    id: "sky" },
         // ← added Jul 20 2026
];

export default async function handler(req, res) {
  const t0 = Date.now();
  const ids = COINS.map(c => c.id).join(",");
  const url =
    "https://api.coingecko.com/api/v3/simple/price?ids=" + ids +
    "&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true" +
    "&include_market_cap=true&include_last_updated_at=true";

  let error = null;
  let prices = [];

  try {
    const r = await fetch(url, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error("CoinGecko HTTP " + r.status);
    const data = await r.json();
    prices = COINS
      .filter(c => data[c.id])
      .map(c => ({
        symbol: c.symbol,
        coingecko_id: c.id,
        usd: data[c.id].usd,
        change_24h_pct: data[c.id].usd_24h_change,
        volume_24h_usd: data[c.id].usd_24h_vol,
        market_cap_usd: data[c.id].usd_market_cap,
        last_updated_unix: data[c.id].last_updated_at
      }));
  } catch (e) {
    error = String(e.message || e);
  }

  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({
    timestamp_utc: new Date().toISOString(),
    source: "CoinGecko v3 /simple/price",
    fetch_duration_ms: Date.now() - t0,
    error,
    prices
  });
}
