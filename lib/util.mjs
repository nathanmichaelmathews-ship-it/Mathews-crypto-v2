// lib/util.mjs — shared helpers for the Mathews data hub (fetch with timeout/retry/cache, math, dates, HTML→text).
// Runs on Vercel (Node 22 serverless) and in GitHub Actions (node scripts/snapshot.mjs). No dependencies.

export const HUB_VERSION = '1.0.0';
export const UA = 'mathews-crypto-hub/1.0 (+https://github.com/nathanmichaelmathews-ship-it/mathews-crypto-v2)';
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

const cache = new Map(); // url -> { t: epoch ms, v: value }
export function cacheGet(key, ttlMs) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  return undefined;
}
export function cacheSet(key, v) { cache.set(key, { t: Date.now(), v }); if (cache.size > 500) cache.delete(cache.keys().next().value); return v; }

export const nowIso = () => new Date().toISOString();
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** fetch with timeout, one retry, optional in-memory TTL cache. Returns { status, headers, text }. */
export async function fetchRaw(url, opts = {}) {
  const { timeout = 8000, headers = {}, method = 'GET', body, retries = 1, ttl = 0, browser = false, backoff = 400 } = opts;
  const key = method + ' ' + url + (body ? ' ' + body : '');
  if (ttl > 0) { const c = cacheGet(key, ttl); if (c !== undefined) return c; }
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, {
        method, body, signal: ctrl.signal, redirect: 'follow',
        headers: { 'user-agent': browser ? BROWSER_UA : UA, accept: 'application/json, text/plain, text/html, */*', ...(browser ? { 'accept-language': 'en-US,en;q=0.9' } : {}), ...headers },
      });
      const text = await res.text();
      clearTimeout(timer);
      const out = { status: res.status, ok: res.ok, headers: Object.fromEntries(res.headers.entries()), text, url };
      if (!res.ok) {
        // retry only on 5xx / 429
        if ((res.status >= 500 || res.status === 429) && attempt < retries) {
          // exponential backoff; honour Retry-After (seconds, capped at 8 s) on 429
          const ra = res.status === 429 ? parseFloat(res.headers.get('retry-after')) : NaN;
          await sleep(Number.isFinite(ra) ? Math.min(ra * 1000, 8000) : backoff * 2 ** attempt); continue;
        }
        const err = new Error(`HTTP ${res.status} ${url} :: ${text.slice(0, 160).replace(/\s+/g, ' ')}`);
        err.status = res.status; err.body = text.slice(0, 2000);
        throw err;
      }
      if (ttl > 0) cacheSet(key, out);
      return out;
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (e.name === 'AbortError') lastErr = new Error(`timeout ${timeout}ms ${url}`);
      if (e.status && e.status < 500 && e.status !== 429) throw lastErr;
      if (attempt < retries) { await sleep(300 * (attempt + 1)); continue; }
    }
  }
  throw lastErr;
}

export async function fetchJSON(url, opts = {}) {
  const r = await fetchRaw(url, opts);
  try { return JSON.parse(r.text); }
  catch (e) { throw new Error(`non-JSON from ${url}: ${r.text.slice(0, 120).replace(/\s+/g, ' ')}`); }
}
export async function fetchText(url, opts = {}) { return (await fetchRaw(url, opts)).text; }

/** run fn over items with bounded concurrency; returns results in order (errors captured as {error}) */
export async function pmap(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  async function worker() {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = { error: String(e && e.message || e) }; } }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

/** wrap a collector: never throws; returns {ok, ms, data | error} */
export async function timed(fn) {
  const t0 = Date.now();
  try { const data = await fn(); return { ok: true, ms: Date.now() - t0, data }; }
  catch (e) { return { ok: false, ms: Date.now() - t0, error: String(e && e.message || e) }; }
}

// ---------- numbers ----------
export const num = (x) => { const v = typeof x === 'string' ? parseFloat(x.replace(/[,$%\s]/g, '')) : Number(x); return Number.isFinite(v) ? v : null; };
export const round = (x, d = 2) => (x === null || x === undefined || !Number.isFinite(x)) ? null : Math.round(x * 10 ** d) / 10 ** d;
export const pctChange = (a, b) => (a === null || b === null || !b) ? null : a / b - 1;
export const mean = (a) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
export const std = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
export const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const sum = (a) => a.reduce((s, v) => s + v, 0);
/** "-3.20% (DOWN)" — an unambiguous label so summarizers cannot drop a minus sign */
export function pctLabel(frac, d = 2) {
  if (frac === null || frac === undefined || !Number.isFinite(frac)) return null;
  const p = frac * 100; const s = p < 0 ? 'DOWN' : p > 0 ? 'UP' : 'FLAT';
  return `${p < 0 ? '-' : '+'}${Math.abs(p).toFixed(d)}% (${s})`;
}
export const fmtUsd = (v, d = 0) => (v === null || v === undefined || !Number.isFinite(v)) ? 'n/a' : (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

// ---------- dates ----------
export const ymd = (d) => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);
export const daysAgoIso = (n, from = new Date()) => new Date(from.getTime() - n * 86400000).toISOString();
export const utcDayStart = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
export const isSunday = (epochSec) => new Date(epochSec * 1000).getUTCDay() === 0;
/** Sunday (UTC date) that ends the week containing this epoch-second UTC day */
export function weekEndingSunday(epochSec) {
  const d = new Date(epochSec * 1000); const dow = d.getUTCDay(); // 0 = Sunday
  const add = dow === 0 ? 0 : 7 - dow;
  return ymd(new Date(d.getTime() + add * 86400000));
}
export const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

// ---------- text ----------
export function htmlToText(html, maxChars = 20000) {
  let t = String(html || '');
  t = t.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  t = t.replace(/<\/(p|div|tr|li|h[1-6]|br|table|section|article|header|footer)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<\/t[dh]>/gi, ' | ');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
  t = t.replace(/[ \t\r\f\v]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return t.length > maxChars ? t.slice(0, maxChars) + `\n…[truncated ${t.length - maxChars} chars]` : t;
}
/** parse every <table> in an HTML string into arrays of rows of cell texts */
export function htmlTables(html) {
  const tables = [];
  const tre = /<table[\s\S]*?<\/table>/gi; let m;
  while ((m = tre.exec(html))) {
    const rows = [];
    const rre = /<tr[\s\S]*?<\/tr>/gi; let r;
    while ((r = rre.exec(m[0]))) {
      const cells = []; const cre = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi; let c;
      while ((c = cre.exec(r[0]))) cells.push(htmlToText(c[1], 400));
      if (cells.length) rows.push(cells);
    }
    if (rows.length) tables.push(rows);
  }
  return tables;
}
/** "(123.4)" → -123.4 ; "-" → 0 ; "1,234.5" → 1234.5 */
export function parseFlowNumber(s) {
  if (s === null || s === undefined) return null;
  const t = String(s).trim();
  if (t === '' || t === '-' || t === '–' || t === '—') return 0;
  const neg = /^\(.*\)$/.test(t) || t.startsWith('-') || t.startsWith('−');
  const v = parseFloat(t.replace(/[()$,\s−-]/g, ''));
  return Number.isFinite(v) ? (neg ? -v : v) : null;
}

/** simple CSV → rows of strings (no quoted-comma support needed for FRED) */
export function parseCsv(text) {
  return text.trim().split(/\r?\n/).map((l) => l.split(','));
}

/** SMA over the LAST n values of an array (oldest→newest) */
export function smaLast(arr, n) { if (arr.length < n) return null; return mean(arr.slice(arr.length - n)); }
