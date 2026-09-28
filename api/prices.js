// api/prices.js — the legacy feed (/prices.json via vercel.json rewrite). Schema unchanged; coverage = every configured coin
// (portfolio + weekly + monthly + bench — NEAR and SYRUP included). Coinbase last price for Coinbase-listed names, CoinGecko
// for market cap / volume / 24h change. Cache-Control: no-store. Optional ?group=portfolio · ?symbols=BTC,ETH,NEAR
import { legacyFeed } from '../lib/derived.mjs';
import { nowIso } from '../lib/util.mjs';

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const q = Object.fromEntries(url.searchParams.entries());
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const out = await legacyFeed({ group: q.group, symbols: q.symbols });
    res.status(200).json(out);
  } catch (e) {
    res.status(200).json({ timestamp_utc: nowIso(), source: 'hub', fetch_duration_ms: 0, error: String(e && e.message || e), prices: [] });
  }
}
