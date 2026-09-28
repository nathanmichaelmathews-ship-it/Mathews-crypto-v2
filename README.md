# Mathews Crypto Data Hub

One Vercel project = the live price feed (unchanged `/prices.json` schema, now every coin) + a JSON data hub that serves every
input the Mathews protocol needs (kill-switch signals, BTC 20W/50W/200W gates, book and resting-order distances, runner flags,
Wave Board stages, on-chain, macro, derivatives, DeFi value capture, ETF flows, Hormuz, prediction markets, filings, headlines) +
an hourly GitHub Actions snapshot committed to `data/` so a Claude session can read exact numbers with plain `curl`.

Nothing here trades. Positions and orders in `config/hub.config.mjs` are informational snapshots; `claude/STATE.md` and the
newest `Mathews_Crypto_Portfolio_vNN.xlsx` stay canonical.

## Layout

| path | what |
|---|---|
| `api/prices.js` | legacy feed → `/prices.json` (rewrite in `vercel.json`) |
| `api/hub.js` | the router: `/api/<endpoint>` → one collector or derived view |
| `lib/util.mjs` | fetch with timeout/retry/TTL cache, math, dates, HTML→text |
| `lib/collectors.mjs` | one function per upstream source |
| `lib/derived.mjs` | analytics: prices merge, structure, wave, flags, book, fred, stablecoins, funding, macro, onchain, KS pre-grade, `/api/all`, `/api/brief`, `/api/health` |
| `config/hub.config.mjs` | **the one file to edit**: universe (ids), positions, orders, runner flags, levels, thresholds, macro/FRED/DefiLlama lists, whitelist |
| `scripts/snapshot.mjs` | writes `data/latest.json`, `data/brief.txt`, `data/daily/YYYY-MM-DD.json` |
| `.github/workflows/snapshot.yml` | hourly cron (`7 * * * *`) + manual run |
| `index.html` | Command Deck v20 (phone dashboard on the hub) |
| `test/` | offline harness with mocked upstreams: `node test/run.mjs` |

## Endpoints (all `Cache-Control: no-store`; add `?cb=<stamp>` from a session anyway)

`/api/index` lists them with one-line docs. Highlights:

- `/prices.json` · `/api/prices` — prices (Coinbase last for Coinbase-listed names + CoinGecko mcap/volume/%/ATH/FDV; `?group=` `?symbols=`)
- `/api/all` (≈10–25 s; `?full=1` adds onchain, polymarket, dat) · `/api/brief` (plain text digest with explicit minus signs)
- `/api/book` · `/api/btc-structure` · `/api/candles?symbol=NEAR&days=100&since=2026-09-16` · `/api/wave?set=weekly|monthly` · `/api/flags` · `/api/depth?symbol=ONDO`
- `/api/fred` · `/api/stablecoins` · `/api/macro` · `/api/funding` · `/api/okx-oi?ccy=BTC` · `/api/derivatives?symbol=HYPE` · `/api/onchain`
- `/api/llama?symbols=HYPE,UNI` · `/api/llama-search?q=aerodrome` · `/api/etf-flows?asset=btc|eth|sol` · `/api/global` · `/api/fear-greed`
- `/api/polymarket?q=…` · `/api/hormuz` · `/api/dat` · `/api/coin?id=near` · `/api/chart?id=bitcoin&days=365` · `/api/search?q=aster` · `/api/coinbase-products`
- `/api/rss?feed=fed|sec|cftc|coindesk|…` · `/api/edgar?q="333-288870"&from=2026-09-01` · `/api/fetch?url=` · `/api/text?url=` (whitelisted hosts only)
- `/api/health` · `/api/config` · `/api/ks`

Snapshot (exact JSON, no summarizer, readable from the workspace shell):
`https://raw.githubusercontent.com/nathanmichaelmathews-ship-it/mathews-crypto-v2/main/data/latest.json`

## Install / deploy

1. Put these files in the repo root (replace `api/prices.js`, `index.html`, `vercel.json`; delete the stray `api/index.html`). Vercel redeploys on push.
2. Optional repository secrets (Actions) and Vercel environment variables: `COINGECKO_API_KEY` (free Demo key → 30 calls/min), `COINALYZE_API_KEY`, `SEC_CONTACT` ("Name email" for EDGAR fair access).
3. Actions → "hub snapshot" → Run workflow once; then confirm `data/latest.json` exists.
4. Open `/api/health` — every source should be `ok`. Then `/api/coinbase-products` (all configured ids listed?) and `/api/llama` (slugs resolve?).

## Verify at first run (things that could not be verified from the build sandbox)

- CoinGecko ids flagged with `cg_alt` (SYRUP, FET, ASTER, SPK, WAL) — `/api/search?q=` finds the right one.
- Coinbase product ids for GRASS, WAL, BNB, ASTER, SPK — `/api/coinbase-products` shows `missing`.
- DefiLlama slugs in `config.llama.protocols` — `/api/llama-search?q=` then fix the list.
- IMF PortWatch ArcGIS service URL / field names in `config.hormuz` — `/api/hormuz` shows the raw fields.
- Farside HTML layout (parser looks for the table with a `Total` column and `D Mon YYYY` dates).
- Yahoo `^MOVE`, `DX-Y.NYB`, `3350.T` symbols; Coinbase `/products/stats` all-products endpoint (falls back to per-product tickers automatically).

## Editing the config

`config/hub.config.mjs` → `as_of`, `positions`, `btc_sleeve`, `cash`, `orders`, `runner_flags`, `levels`. Keep the sheet/STATE canonical: change the config the same session a fill or order change is recorded. Adding a coin = one line in `coins` (symbol, cg id, cb product id, group, sectors, cycle high).
