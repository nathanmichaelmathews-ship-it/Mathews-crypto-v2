// verify the weekly aggregation + gate math on a hand-built series: 60 weeks of daily candles with known Sunday closes
const DAY=86400; const today=new Date(); today.setUTCHours(0,0,0,0);
// find last Sunday strictly before today (completed) 
let d=new Date(today); while(d.getUTCDay()!==0) d=new Date(d.getTime()-86400000); if (d.getTime()===today.getTime()) d=new Date(d.getTime()-7*86400000);
const lastSun=d; const weeks=60; const rows=[]; const sundayCloses=[];
for(let w=weeks-1; w>=0; w--){ const sun=new Date(lastSun.getTime()-w*7*86400000); const wc=1000+w; sundayCloses.push(wc);
  for(let k=6;k>=0;k--){ const day=new Date(sun.getTime()-k*86400000); const close = k===0? wc : wc+50; rows.push([Math.floor(day.getTime()/1000), close-1, close+1, close, close, 1]); } }
// add the in-progress week: days after lastSun up to today (partial)
for(let t=lastSun.getTime()+86400000; t<=today.getTime(); t+=86400000) rows.push([Math.floor(t/1000), 5000, 5000, 5000, 5000, 1]);
globalThis.fetch = async (url)=>{ const u=new URL(url); const s=Math.floor(new Date(u.searchParams.get('start')).getTime()/1000), e=Math.floor(new Date(u.searchParams.get('end')).getTime()/1000); const body=JSON.stringify(rows.filter(r=>r[0]>=s-DAY&&r[0]<=e).reverse()); return {ok:true,status:200,headers:new Map(),text:async()=>body}; };
const D=await import('../lib/derived.mjs');
const st=await D.btcStructure({days:60*7+10});
const closes=sundayCloses; // oldest→newest, the last 60 completed Sunday closes: 1000+59 ... 1000+0 → wait: w from 59..0 → values 1059..1000
const n=closes.length; const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
console.log('completed_weeks', st.completed_weeks, 'expected', n);
console.log('last close', st.last_completed_week.close, 'expected', closes[n-1]);
console.log('sma20', st.last_completed_week.sma20, 'expected', mean(closes.slice(n-20)));
console.log('sma50', st.last_completed_week.sma50, 'expected', mean(closes.slice(n-50)));
console.log('gate_50w', st.next_close_gates.gate_50w, 'expected', mean(closes.slice(n-49)));
console.log('gate_20w', st.next_close_gates.gate_20w, 'expected', mean(closes.slice(n-19)));
console.log('x_for_50w_to_rise', st.next_close_gates.x_for_50w_to_rise, 'expected (close 50 wks ago)', closes[n-50]);
console.log('x_for_20w_to_rise_strict', st.next_close_gates.x_for_20w_to_rise_strict, 'expected', closes[n-20]);
const s20_4=mean(closes.slice(n-23,n-3)); console.log('x_for_20w_4wk', st.next_close_gates.x_for_20w_to_rise_4wk_slope, 'expected', 20*s20_4 - closes.slice(n-19).reduce((s,v)=>s+v,0));
console.log('in_progress', st.in_progress_week, 'spot', st.spot);
console.log('rising strict (series is falling 1059→1000 so false expected):', st.last_completed_week.sma20_rising_strict, st.last_completed_week.sma50_rising);
console.log('weekly_closes_last12', st.weekly_closes_last12.map(w=>w.close).join(','));
