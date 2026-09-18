#!/usr/bin/env node
// Supportability of ungrounded verdicts: for each above-none verdict in the
// ungrounded baseline, did the SAME model produce >=1 verifiable (verbatim NFC
// + substantive) quote for that outcome under the grounded contract?
// "Unsupportable by the model's own lights" = no such quote exists.
import fs from 'node:fs';
const norm=s=>String(s??'').normalize('NFC').replace(/[‘’‛]/g,"'").replace(/[“”]/g,'"').replace(/[–—]/g,'-').replace(/\s+/g,' ').trim().toLowerCase();
const subst=n=>n.length>=20&&(n.match(/[a-z]{3,}/g)?.length??0)>=3;
const idx=JSON.parse(fs.readFileSync('eval/results-spectrum/_index/index.json','utf8'));
const byId=new Map(idx.chunks.map(c=>[c.id,norm(c.text)]));
const out={models:{},totals:{above:0,aboveUnsup:0,high:0,highUnsup:0}};
for(const m of ['gpt-4o-mini','gpt-4o','gpt-5.5']){
  const ung=new Map(fs.readFileSync(`eval/results-ungrounded/raw_openai_${m}.jsonl`,'utf8').trim().split('\n').map(l=>{const r=JSON.parse(l);return[r.id,r.raw_coverage];}));
  const grec=new Map(fs.readFileSync(`eval/results-spectrum/raw_openai_${m}.jsonl`,'utf8').trim().split('\n').map(l=>{const r=JSON.parse(l);return[r.id,r];}));
  const s={above:0,aboveUnsup:0,high:0,highUnsup:0,unsupportableIds:[]};
  for(const [id,cov] of ung){
    if(cov==='none')continue;
    const g=grec.get(id);
    const verified=(g?.raw_evidence??[]).some(e=>{const n=norm(e.quote);return n&&subst(n)&&(g.hit_chunk_ids??[]).some(cid=>byId.get(cid)?.includes(n));});
    s.above++; if(!verified){s.aboveUnsup++;s.unsupportableIds.push(id);}
    if(cov==='substantial'||cov==='full'){s.high++; if(!verified)s.highUnsup++;}
  }
  out.models[m]=s; out.totals.above+=s.above;out.totals.aboveUnsup+=s.aboveUnsup;out.totals.high+=s.high;out.totals.highUnsup+=s.highUnsup;
}
fs.mkdirSync('eval/results-ungrounded',{recursive:true});
fs.writeFileSync('eval/results-ungrounded/supportability.json',JSON.stringify(out,null,2));
console.log(JSON.stringify(out.totals),'-> saved eval/results-ungrounded/supportability.json');
