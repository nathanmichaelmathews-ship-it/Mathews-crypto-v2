// scripts/snapshot.mjs — run by the GitHub Action (hourly) and by hand: `node scripts/snapshot.mjs [--full]`.
// Writes data/latest.json (the whole /api/all payload), data/brief.txt (the text digest), and once per UTC day an archive copy
// data/daily/YYYY-MM-DD.json — so any session can read exact numbers with plain curl from raw.githubusercontent.com.
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { all, brief } from '../lib/derived.mjs';

const full = process.argv.includes('--full') || new Date().getUTCHours() === 0; // the midnight run carries onchain/polymarket/dat
const t0 = Date.now();
const payload = await all({ full });
mkdirSync('data', { recursive: true }); mkdirSync('data/daily', { recursive: true });
writeFileSync('data/latest.json', JSON.stringify(payload));
let text = '';
try { text = await brief(); writeFileSync('data/brief.txt', text); } catch (e) { writeFileSync('data/brief.txt', `brief failed: ${e.message}\n`); }
const day = payload.generated_utc.slice(0, 10);
const dailyPath = `data/daily/${day}.json`;
if (!existsSync(dailyPath) || full) writeFileSync(dailyPath, JSON.stringify(payload));
const fails = Object.entries(payload.status).filter(([, v]) => v.startsWith('FAIL'));
console.log(`snapshot ${payload.generated_utc} in ${Date.now() - t0} ms · full=${full} · sections ok ${Object.keys(payload.status).length - fails.length}/${Object.keys(payload.status).length}`);
for (const [k, v] of fails) console.log(`  FAIL ${k}: ${v.slice(0, 200)}`);
