// api/account.js — READ-ONLY account facts for the hub (v2, Oct 4 2026; SYSTEM.md §5a): Coinbase Advanced balances, open orders, fills with fees.
// Self-contained (Node crypto + fetch only). Drop it into the hub repo's api/ folder: it is served at /api/account (a file in api/ wins over the /api/:fn rewrite).
// It can NEVER trade: it only issues GET requests, and it REFUSES TO RUN if the key can trade or transfer.
// Env (Vercel → Project → Settings → Environment Variables):
//   COINBASE_KEY_NAME     organizations/{org_id}/apiKeys/{key_id}            (CDP Secret API key, signature algorithm ECDSA, permission: VIEW only)
//   COINBASE_PRIVATE_KEY  -----BEGIN EC PRIVATE KEY----- … -----END EC PRIVATE KEY-----   (real line breaks or literal \n sequences are both accepted)
//   HUB_READ_TOKEN        OPTIONAL: a long random string Nathan chooses; FULL mode needs ?k=<token>. Leave it unset and FULL mode is simply off.
// TWO MODES:
//   CHECK (no token):  GET /api/account?check=1[&since_days=10][&expect=HYPE:397.4747,NEAR:3670.94,…][&orders=HYPE:S:25@101,ONDO:S:4000@0.61,…][&maybe=NEAR:S:918@5.35,…]
//        It never REVEALS an amount: it only CONFIRMS or DENIES what the caller already knows.
//        → key permissions · COUNTS of open orders and of filled orders per coin · per-coin 'match / mismatch / absent' against the quantities the caller
//          expects (0.1%) · per-ORDER status for every order the caller lists (coin : S|B : size @ limit, no thousands separators):
//          open · open-partly-filled · filled (with the fill time and the fee as a PERCENT) · closed-partly-filled · absent (cancelled, expired or never placed)
//          · the same for `maybe` (recommended tickets that may not be placed yet: open = now placed exactly as listed)
//          · how many open orders and fills match NOTHING the caller listed (unrecorded orders / fills). No balance, size, price or dollar fee is returned.
//   FULL  (token):     GET /api/account?k=<token>[&since_days=14][&text=1]   → balances, every open order with size and limit, every fill with its fee.
// Sources (docs.cdp.coinbase.com, fetched Oct 4 2026): JWT = ES256, header {alg, kid, nonce, typ}, payload {iss:"cdp", nbf, exp:+120, sub, uri:"GET api.coinbase.com<path>"};
//   GET /api/v3/brokerage/key_permissions → {can_view, can_trade, can_transfer, portfolio_uuid, portfolio_type}
//   GET /api/v3/brokerage/accounts (limit ≤ 250, cursor, has_next) · GET /api/v3/brokerage/orders/historical/batch (order_status=OPEN, limit, cursor, has_next)
//   GET /api/v3/brokerage/orders/historical/fills (start_sequence_timestamp RFC3339, limit, cursor)
// Robinhood (ETH, LINK) is NOT read here yet — phase 2, after its key format is verified against the live docs.
import crypto from 'node:crypto';
export const config = { maxDuration: 30 };

const HOST = 'api.coinbase.com';
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const num = (x) => { const v = Number(x); return Number.isFinite(v) ? v : null; };
const VERSION = 'account v2 (2026-10-04)';
const baseOf = (pid) => String(pid || '').split('-')[0].toUpperCase(); // HYPE-USD and HYPE-USDC are the same book: match on the coin
const near = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(1e-12, Math.abs(b) * tol);
const rnd = (x, d) => (Number.isFinite(x) ? Number(x.toFixed(d)) : null);

export function normalizePem(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1);
  s = s.replace(/\\n/g, '\n').replace(/\r/g, '').trim();
  return s.endsWith('\n') ? s : s + '\n';
}

export function keyProblem(env) { // returns a plain-English problem with the configured key, or null
  const name = String(env.COINBASE_KEY_NAME || '').trim(); const pem = normalizePem(env.COINBASE_PRIVATE_KEY);
  if (!name || !pem) return 'not configured: set COINBASE_KEY_NAME and COINBASE_PRIVATE_KEY in the Vercel environment, then redeploy';
  if (!/^organizations\/[^/\s]+\/apiKeys\/[^/\s]+$/.test(name)) return 'COINBASE_KEY_NAME must look like organizations/<org id>/apiKeys/<key id> (the "name" line of the key file)';
  if (!/-----BEGIN (EC )?PRIVATE KEY-----/.test(pem)) return 'COINBASE_PRIVATE_KEY is not a PEM key: it must start with -----BEGIN EC PRIVATE KEY----- (create the key with signature algorithm ECDSA, not Ed25519, and paste the whole "privateKey" value)';
  try { const k = crypto.createPrivateKey(pem); if (k.asymmetricKeyType !== 'ec') return 'COINBASE_PRIVATE_KEY is not an ECDSA key (re-create the key with signature algorithm ECDSA)'; }
  catch { return 'COINBASE_PRIVATE_KEY could not be read as a PEM key (paste the whole value, from -----BEGIN EC PRIVATE KEY----- to -----END EC PRIVATE KEY-----)'; }
  return null;
}

export function buildJwt(keyName, pem, method, path, nowSec = Math.floor(Date.now() / 1000)) {
  const header = { alg: 'ES256', kid: keyName, nonce: crypto.randomBytes(16).toString('hex'), typ: 'JWT' };
  const payload = { iss: 'cdp', nbf: nowSec, exp: nowSec + 120, sub: keyName, uri: `${method} ${HOST}${path}` }; // path WITHOUT the query string
  const input = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
  const sig = crypto.sign('sha256', Buffer.from(input), { key: crypto.createPrivateKey(pem), dsaEncoding: 'ieee-p1363' });
  return `${input}.${b64u(sig)}`;
}

async function cbGet(fetchImpl, env, path, query = '') {
  const jwt = buildJwt(String(env.COINBASE_KEY_NAME).trim(), normalizePem(env.COINBASE_PRIVATE_KEY), 'GET', path); // a fresh JWT per request (they expire in 2 minutes)
  const res = await fetchImpl(`https://${HOST}${path}${query ? '?' + query : ''}`, { method: 'GET', headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/json', 'User-Agent': 'mathews-hub/account' } });
  const text = await res.text(); let body = null; try { body = JSON.parse(text); } catch { /* non-JSON */ }
  if (!res.ok) { const e = new Error(`coinbase ${path} → HTTP ${res.status}`); e.status = res.status; e.detail = body?.message || body?.error || text.slice(0, 200); throw e; }
  return body;
}

async function paged(fetchImpl, env, path, baseQuery, listKey, maxPages = 8) {
  let cursor = ''; const out = [];
  for (let p = 0; p < maxPages; p++) {
    const q = baseQuery + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
    const body = await cbGet(fetchImpl, env, path, q);
    const rows = body?.[listKey] || []; out.push(...rows);
    const next = body?.cursor; const more = body?.has_next === true || (body?.has_next === undefined && rows.length > 0 && next);
    if (!more || !next || next === cursor) break; cursor = next;
  }
  return out;
}

function orderShape(o) {
  const cfg = o.order_configuration || {}; const kind = Object.keys(cfg)[0] || null; const c = kind ? cfg[kind] : {};
  return { order_id: o.order_id, product_id: o.product_id, side: o.side, status: o.status, type: o.order_type || kind, time_in_force: o.time_in_force,
    size: num(c.base_size), limit_price: num(c.limit_price), stop_price: num(c.stop_price), post_only: c.post_only ?? null,
    filled_size: num(o.filled_size), average_filled_price: num(o.average_filled_price), completion_pct: num(o.completion_percentage), total_fees: num(o.total_fees),
    created_time: o.created_time || null, last_fill_time: o.last_fill_time || null,
    age_days: o.created_time ? Math.floor((Date.now() - Date.parse(o.created_time)) / 86400000) : null };
}

export async function collect(fetchImpl, env, { sinceDays = 14, now = Date.now() } = {}) {
  const perm = await cbGet(fetchImpl, env, '/api/v3/brokerage/key_permissions');
  if (perm?.can_trade === true || perm?.can_transfer === true) {
    const e = new Error('REFUSING TO RUN: this API key can ' + [perm.can_trade ? 'TRADE' : null, perm.can_transfer ? 'TRANSFER' : null].filter(Boolean).join(' and ') + '. Delete it in the CDP portal and create a VIEW-only key.');
    e.status = 500; e.hardFail = true; throw e;
  }
  if (perm?.can_view !== true) { const e = new Error('key has no view permission'); e.status = 500; throw e; }
  const since = new Date(now - Math.min(90, Math.max(1, sinceDays)) * 86400000).toISOString();
  const [accounts, open, fills] = await Promise.all([
    paged(fetchImpl, env, '/api/v3/brokerage/accounts', 'limit=250', 'accounts'),
    paged(fetchImpl, env, '/api/v3/brokerage/orders/historical/batch', 'order_status=OPEN&limit=100', 'orders'),
    paged(fetchImpl, env, '/api/v3/brokerage/orders/historical/fills', `start_sequence_timestamp=${encodeURIComponent(since)}&limit=250`, 'fills'),
  ]);
  const balances = accounts.map((a) => { const avail = num(a.available_balance?.value) ?? 0; const hold = num(a.hold?.value) ?? 0; return { currency: a.currency, available: avail, hold, total: avail + hold, type: a.type, updated_at: a.updated_at || null }; })
    .filter((b) => b.total > 0).sort((a, b) => a.currency.localeCompare(b.currency));
  const openOrders = open.map(orderShape).sort((a, b) => (a.product_id || '').localeCompare(b.product_id || '') || (a.limit_price ?? 0) - (b.limit_price ?? 0));
  const byOrder = new Map();
  for (const f of fills) {
    const k = f.order_id; const price = num(f.price) ?? 0; const fee = num(f.commission) ?? 0; let size = num(f.size) ?? 0;
    if (f.size_in_quote === true && price > 0) size = size / price; // size given in quote currency → convert to base
    const g = byOrder.get(k) || { order_id: k, product_id: f.product_id, side: f.side, qty: 0, notional: 0, fees: 0, first_time: f.trade_time, last_time: f.trade_time, n_fills: 0, liquidity: new Set() };
    g.qty += size; g.notional += size * price; g.fees += fee; g.n_fills += 1; if (f.liquidity_indicator) g.liquidity.add(f.liquidity_indicator);
    if (f.trade_time < g.first_time) g.first_time = f.trade_time; if (f.trade_time > g.last_time) g.last_time = f.trade_time; byOrder.set(k, g);
  }
  const filled = [...byOrder.values()].map((g) => ({ order_id: g.order_id, product_id: g.product_id, side: g.side, qty: g.qty, avg_price: g.qty > 0 ? g.notional / g.qty : null, gross: g.notional, fees: g.fees,
    net: g.side === 'SELL' ? g.notional - g.fees : -(g.notional + g.fees), fee_pct: g.notional > 0 ? (g.fees / g.notional) * 100 : null, n_fills: g.n_fills, liquidity: [...g.liquidity].join('/'), first_time: g.first_time, last_time: g.last_time }))
    .sort((a, b) => (a.last_time < b.last_time ? 1 : -1));
  return { generated_utc: new Date(now).toISOString(), venue: 'coinbase-advanced', version: VERSION, permissions: { can_view: perm.can_view === true, can_trade: perm.can_trade === true, can_transfer: perm.can_transfer === true, portfolio_type: perm.portfolio_type || null },
    balances, open_orders: openOrders, fills_since: since, filled_orders: filled, counts: { balances: balances.length, open_orders: openOrders.length, filled_orders: filled.length, raw_fills: fills.length },
    notes: ['READ-ONLY: GET requests only; refuses to run if the key can trade or transfer.', 'Robinhood (ETH, LINK) is not included — phase 2.', 'Realized price in the process = the resting limit; fees here are the actual commissions.'] };
}

export function parseOrders(str) { // "HYPE:S:25@101,ONDO:S:4000@0.61" → [{raw, base, side, size, price}]
  return String(str || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 80).map((raw) => {
    const m = /^([A-Za-z0-9]+):(S|B|SELL|BUY):([0-9]*\.?[0-9]+)@([0-9]*\.?[0-9]+)$/i.exec(raw);
    if (!m) return { raw, bad: true };
    return { raw, base: m[1].toUpperCase(), side: m[2][0].toUpperCase() === 'S' ? 'SELL' : 'BUY', size: Number(m[3]), price: Number(m[4]) };
  });
}

export function checkView(o, expectStr = '', ordersStr = '', { sinceDays = null, maybeStr = '' } = {}) { // the token-free view: counts, flags, percentages and times only — it confirms or denies, it never reveals
  const count = (rows, key) => rows.reduce((m, r) => { const k = key(r); m[k] = (m[k] || 0) + 1; return m; }, {});
  const openIds = new Set(o.open_orders.map((r) => r.order_id));
  if (sinceDays) { const cut = new Date(Date.parse(o.generated_utc) - sinceDays * 86400000).toISOString(); o = { ...o, fills_since: cut > o.fills_since ? cut : o.fills_since, filled_orders: o.filled_orders.filter((g) => !g.last_time || g.last_time >= cut) }; }
  const out = { generated_utc: o.generated_utc, venue: o.venue, mode: 'check', version: VERSION, permissions: o.permissions,
    open_orders_total: o.open_orders.length, open_orders_by_coin: count(o.open_orders, (r) => baseOf(r.product_id)), open_orders_by_product: count(o.open_orders, (r) => r.product_id),
    fills_since: o.fills_since, filled_orders_total: o.filled_orders.length, filled_orders_by_coin: count(o.filled_orders, (r) => baseOf(r.product_id)), filled_orders_by_product: count(o.filled_orders, (r) => r.product_id),
    fill_events: o.filled_orders.slice(0, 40).map((g) => ({ coin: baseOf(g.product_id), side: g.side, last_fill_utc: g.last_time || null, order_still_open: openIds.has(g.order_id) })),
    oldest_open_order_age_days: o.open_orders.reduce((m, r) => (r.age_days !== null && r.age_days > m ? r.age_days : m), 0) };
  const expect = String(expectStr || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 40);
  if (expect.length) {
    const bal = Object.fromEntries(o.balances.map((b) => [b.currency.toUpperCase(), b.total])); out.balance_check = {};
    for (const item of expect) { const [sym, q] = item.split(':'); const want = Number(q); const have = bal[String(sym).toUpperCase()];
      out.balance_check[String(sym).toUpperCase()] = q === undefined || q === '' || !Number.isFinite(want) ? 'bad-input' : have === undefined ? 'absent' : Math.abs(have - want) <= Math.max(1e-9, Math.abs(want) * 0.001) ? 'match' : 'mismatch'; }
    out.balance_check_tolerance = '0.1%';
  }
  const wanted = parseOrders(ordersStr); const maybe = parseOrders(maybeStr);
  if (wanted.length || maybe.length) {
    const open = o.open_orders.map((r) => ({ r, used: false })); const fillsById = new Map(o.filled_orders.map((g) => [g.order_id, g]));
    const closed = o.filled_orders.filter((g) => !openIds.has(g.order_id)).map((g) => ({ g, used: false }));
    const priceOk = (g, e) => (e.side === 'SELL' ? g.avg_price >= e.price * 0.999 && g.avg_price <= e.price * 1.05 : g.avg_price <= e.price * 1.001 && g.avg_price >= e.price * 0.95); // a limit order fills at its limit or better
    const matchList = (list, allowPartialClose) => { // each real order can satisfy one listed order only; `orders` is matched before `maybe`
      const res = {}; const pending = [];
      for (const e of list) { // pass 1: still open, or closed with the FULL size filled
        e.key = e.raw; for (let n = 2; e.key in res || pending.some((p) => p.key === e.key); n++) e.key = `${e.raw} #${n}`; // twin orders are reported separately
        if (e.bad) { res[e.key] = { status: 'bad-input' }; continue; }
        const op = open.find((x) => !x.used && baseOf(x.r.product_id) === e.base && x.r.side === e.side && near(x.r.size, e.size, 0.001) && near(x.r.limit_price, e.price, 0.001));
        if (op) { op.used = true; const g = fillsById.get(op.r.order_id); const pct = g ? (g.qty / e.size) * 100 : (op.r.completion_pct ?? 0);
          res[e.key] = pct > 0.05 ? { status: 'open-partly-filled', filled_pct: rnd(pct, 1), last_fill_utc: g?.last_time || op.r.last_fill_time || null, fee_pct: g ? rnd(g.fee_pct, 4) : null, age_days: op.r.age_days } : { status: 'open', age_days: op.r.age_days }; continue; }
        const cf = closed.find((x) => !x.used && baseOf(x.g.product_id) === e.base && x.g.side === e.side && priceOk(x.g, e) && near(x.g.qty, e.size, 0.001));
        if (cf) { cf.used = true; res[e.key] = { status: 'filled', filled_pct: 100, last_fill_utc: cf.g.last_time || null, fee_pct: rnd(cf.g.fee_pct, 4), price_vs_limit: near(cf.g.avg_price, e.price, 0.0005) ? 'at the limit' : 'better than the limit', liquidity: cf.g.liquidity || null }; continue; }
        pending.push(e);
      }
      for (const e of pending) { // pass 2: closed after a PARTIAL fill (the rest was cancelled), else absent
        const cp = allowPartialClose ? closed.find((x) => !x.used && baseOf(x.g.product_id) === e.base && x.g.side === e.side && priceOk(x.g, e) && x.g.qty < e.size) : null; // never guessed for a `maybe` ticket
        if (cp) { cp.used = true; res[e.key] = { status: 'closed-partly-filled', filled_pct: rnd((cp.g.qty / e.size) * 100, 1), last_fill_utc: cp.g.last_time || null, fee_pct: rnd(cp.g.fee_pct, 4) }; continue; }
        res[e.key] = { status: 'absent' };
      }
      return res;
    };
    const tally = (res) => Object.values(res).reduce((m, v) => { m[v.status] = (m[v.status] || 0) + 1; return m; }, {});
    if (wanted.length) { out.orders_check = matchList(wanted, true); out.orders_summary = { listed: wanted.length, ...tally(out.orders_check) }; }
    if (maybe.length) { out.maybe_check = matchList(maybe, false); out.maybe_summary = { listed: maybe.length, ...tally(out.maybe_check) }; }
    out.orders_check_tolerance = 'size and limit within 0.1%; a fill counts at the limit or better';
    out.unexpected_open_orders_total = open.filter((x) => !x.used).length; out.unexpected_open_orders_by_coin = count(open.filter((x) => !x.used), (x) => baseOf(x.r.product_id));
    out.unmatched_fills = closed.filter((x) => !x.used).map((x) => ({ coin: baseOf(x.g.product_id), side: x.g.side, last_fill_utc: x.g.last_time || null }));
  }
  out.notes = ['CHECK mode confirms or denies what the caller lists; it returns no balance, size, price or dollar fee.',
    'orders_check (orders the record says are resting): open = resting · filled = fully filled (fee in dollars = size × limit × fee_pct / 100) · absent = cancelled, expired or never placed.',
    'maybe_check (recommended tickets that may not be placed yet): open = now placed exactly as listed · absent = not placed.',
    'unexpected_open_orders = open orders in neither list (unrecorded) · unmatched_fills = fills on orders in neither list.'];
  return out;
}

export function digest(o) {
  const f = (x, d = 8) => (x === null || x === undefined ? 'NA' : Number(x.toFixed(d)).toString());
  const L = [];
  L.push(`ACCOUNT ${o.generated_utc} · ${o.venue} · key: view ${o.permissions.can_view ? 'YES' : 'NO'} · trade ${o.permissions.can_trade ? 'YES' : 'NO'} · transfer ${o.permissions.can_transfer ? 'YES' : 'NO'} · portfolio ${o.permissions.portfolio_type}`);
  L.push(`BALANCES (${o.balances.length}; total = available + on hold in orders): ` + o.balances.map((b) => `${b.currency} ${f(b.total)} (avail ${f(b.available)} / hold ${f(b.hold)})`).join(' · '));
  L.push(`OPEN ORDERS (${o.open_orders.length}):`);
  for (const r of o.open_orders) L.push(`  ${r.product_id} ${r.side} ${f(r.size)} @ ${f(r.limit_price)} · ${r.time_in_force || ''} · created ${r.created_time ? r.created_time.slice(0, 10) : 'NA'} (${r.age_days ?? 'NA'} d) · filled ${f(r.completion_pct, 2)}% · id ${String(r.order_id).slice(0, 8)}`);
  L.push(`FILLED ORDERS since ${o.fills_since.slice(0, 10)} (${o.filled_orders.length}):`);
  for (const r of o.filled_orders) L.push(`  ${r.last_time ? r.last_time.slice(0, 16).replace('T', ' ') : 'NA'} UTC · ${r.product_id} ${r.side} ${f(r.qty)} @ avg ${f(r.avg_price)} · gross $${f(r.gross, 2)} · fee $${f(r.fees, 2)} (${f(r.fee_pct, 3)}%) · net $${f(r.net, 2)} · ${r.liquidity || 'NA'} · ${r.n_fills} fill(s) · id ${String(r.order_id).slice(0, 8)}`);
  return L.join('\n');
}

function tokenOk(given, expected) {
  if (!given || !expected) return false; const a = Buffer.from(String(given)); const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const CHECK_WINDOW_DAYS = 14; // CHECK mode always collects the same window, so the public route has ONE cache slot
let cache = { at: 0, data: null }; // 60-second per-instance cache: a public CHECK can cause at most one burst of exchange calls per minute
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Access-Control-Allow-Origin', '*');
  const env = process.env; const q = req.query || {}; const isCheck = q.check === '1'; const stamp = () => new Date().toISOString();
  const problem = keyProblem(env);
  if (problem) return res.status(503).json({ error: problem, version: VERSION, generated_utc: stamp() });
  if (!isCheck && !tokenOk(q.k, env.HUB_READ_TOKEN)) return res.status(401).json({ error: 'unauthorized (FULL mode needs ?k=<HUB_READ_TOKEN>; ?check=1 needs no token)', version: VERSION, generated_utc: stamp() });
  try {
    if (isCheck) {
      if (!(cache.data && Date.now() - cache.at < 60000)) { const data = await collect(fetch, env, { sinceDays: CHECK_WINDOW_DAYS }); cache = { at: Date.now(), data }; }
      const days = Math.min(CHECK_WINDOW_DAYS, Math.max(1, parseInt(q.since_days || '10', 10) || 10));
      return res.status(200).json(checkView(cache.data, q.expect, q.orders, { sinceDays: days, maybeStr: q.maybe }));
    }
    const out = await collect(fetch, env, { sinceDays: parseInt(q.since_days || '14', 10) || 14 }); // FULL mode is never cached
    if (q.text === '1') { res.setHeader('Content-Type', 'text/plain; charset=utf-8'); return res.status(200).send(digest(out)); }
    return res.status(200).json(out);
  } catch (e) {
    return res.status(e.hardFail ? 500 : e.status && e.status >= 400 ? 502 : 500).json({ error: String(e.message || e), detail: e.detail || null, hard_fail: e.hardFail === true, version: VERSION, generated_utc: stamp() });
  }
}
export function _resetCacheForTests() { cache = { at: 0, data: null }; }
