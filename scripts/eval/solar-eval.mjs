// Evaluates the grammar rules on the Šolar 3.0 learner corpus (http://hdl.handle.net/11356/1589,
// CC BY-NC-SA 4.0 — download it yourself, it is not part of this repo):
//   python3 scripts/eval/solar_extract.py Solar.TEI.zip solar.jsonl
//   node scripts/eval/solar-eval.mjs solar.jsonl [samples.json]
// "annotated-error hits" counts flags on tokens the teachers marked as wrong. Teachers did not
// mark every error, so unannotated flags must be reviewed by hand (see samples.json).
import fs from 'fs'; import readline from 'readline';
const R=new URL('../../src/taskpane/', import.meta.url).pathname;
const [input, samplesOut='solar-samples.json'] = process.argv.slice(2);
if (!input) { console.error('Usage: node scripts/eval/solar-eval.mjs solar.jsonl [samples.json]'); process.exit(1); }
const { loadMorph } = await import(R+'morph.js');
const { createFormChecker } = await import(R+'checkers/oblike.js');
const { checkSZ } = await import(R+'checkers/predlogi-sz.js');
const { checkKH } = await import(R+'checkers/predlogi-kh.js');
const b=fs.readFileSync(R+'dict/sl-morph.bin'); const morph=loadMorph(b.buffer.slice(b.byteOffset,b.byteOffset+b.length));
const forms=createFormChecker(morph);
function build(tokens){ let text='', spans=[]; for (const [t,sp] of tokens){ spans.push([text.length, text.length+t.length]); text+=t+(sp?' ':''); } return {text,spans}; }
function tokAt(spans, pos){ return spans.findIndex(([a,b])=>pos>=a && pos<b); }
const stats={}; const samples={}; const st=(k)=>stats[k]??={tp:0,fp:0,corrFlags:0};
const rl=readline.createInterface({input:fs.createReadStream(input)});
let n=0, words=0, corrWords=0; const t0=Date.now(); const goldCounts={};
for await (const line of rl){
  const d=JSON.parse(line); n++;
  const o=build(d.orig); words+=d.orig.length; corrWords+=d.corr.length;
  for (const [,,e] of d.orig) if (e) for (const x of new Set(e)) if (/^(O\/KAT|Č\/PRED)/.test(x)) goldCounts[x]=(goldCounts[x]||0)+1;
  const run=(text)=>[
    ...forms.check(text).map(i=>({rule:i.rule, pos:i.flaggedStart, i})),
    ...checkSZ(text).map(i=>({rule:'s/z', pos:text.indexOf(i.word), i})),
    ...checkKH(text).map(i=>({rule:'k/h', pos:text.indexOf(i.word), i})),
  ];
  for (const f of run(o.text)){
    const ti=tokAt(o.spans, f.pos); const err=ti>=0 && d.orig[ti][2];
    const s=st(f.rule);
    if (err) s.tp++; else s.fp++;
    const key=f.rule+(err?' TP':' FP'); (samples[key]??=[]); if (samples[key].length<400) samples[key].push(`${f.i.word} → ${f.i.suggestions[0]||'?'}   [${err?err.join(','):''}]   «${o.text.slice(Math.max(0,f.pos-40), f.pos+40)}»`);
  }
  if (d.corr.length){ const c=build(d.corr); for (const f of run(c.text)){ st(f.rule).corrFlags++; const key=f.rule+' CORR'; (samples[key]??=[]); if (samples[key].length<400) samples[key].push(`${f.i.word} → ${f.i.suggestions[0]||'?'}   «${c.text.slice(Math.max(0,f.pos-40), f.pos+40)}»`); } }
}
console.log(`${n} sentences, ${words} orig tokens, ${corrWords} corrected tokens, ${((Date.now()-t0)/1000).toFixed(1)}s`);
for (const [k,s] of Object.entries(stats)) console.log(k.padEnd(9), `flags on orig: ${s.tp+s.fp}  annotated-error hits: ${s.tp}  precision≈${(100*s.tp/Math.max(1,s.tp+s.fp)).toFixed(0)}%   flags on corrected text: ${s.corrFlags} (${(s.corrFlags/corrWords*1e4).toFixed(2)} per 10k tokens)`);
fs.writeFileSync(samplesOut, JSON.stringify(samples,null,1));
