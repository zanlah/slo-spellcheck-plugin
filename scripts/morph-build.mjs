// Builds src/taskpane/dict/sl-morph.bin: Sloleks lemmas with their inflection templates.
//
// Every word form is stored as  form = P + lemma[0 .. len - removed.length] + added,
// so a paradigm is a list of (msd, P, removed, added) rows. Only 942 distinct paradigms
// ("templates") exist across 372k Sloleks entries, which keeps the file small, and the
// same rows can be inverted to analyse a form (form -> lemma + grammatical features).
//
// Layout (little-endian, sections padded to 4 bytes):
//   0   "SLMORPH1"
//   8   u32 JSON byte length J, then J bytes of UTF-8 JSON:
//         { msds: [[msd, {feature: value}]], lex: [{category, ...lemma features}],
//           templates: [[[msdIndex, P, removed, added], ...]] }
//   ..  u32 DAWG byte length D, then a DAWG (scripts/dawg-encode.mjs) of the distinct lemma
//       strings; its 4-bit value is the lemma's Gigafida frequency class.
//   ..  u32 lemma count L, u32 record count R
//   ..  u32[L + 1] first record of each lemma (records are grouped by lemma, sorted)
//   ..  u16[R] template index of each record
//   ..  u16[R] lex index of each record (part of speech + lemma-level features)
//   ..  u8[R]  Gigafida frequency class of each record: 0, or 1 + floor(8 * log2(freq))

import { encodeDawg } from "./dawg-encode.mjs";

const MAGIC = "SLMORPH1";

// Prefixes that some forms add in front of the lemma (superlatives: lep -> najlepši).
const PREFIXES = ["", "naj"];

function encodeForm(lemma, form) {
  let best = null;
  for (const P of PREFIXES) {
    if (P && !form.startsWith(P)) continue;
    const f = form.slice(P.length);
    let i = 0;
    while (i < f.length && i < lemma.length && f[i] === lemma[i]) i++;
    const cand = [P, lemma.slice(i), f.slice(i)];
    if (!best || cand[1].length + cand[2].length < best[1].length + best[2].length) best = cand;
  }
  return best;
}

function freqClass(n) {
  return n <= 0 ? 0 : Math.min(15, 1 + Math.floor(Math.log2(n)));
}

function fineFreqClass(n) {
  return n <= 0 ? 0 : Math.min(255, 1 + Math.floor(8 * Math.log2(n)));
}

export class MorphBuilder {
  constructor() {
    this.msdIndex = new Map(); // msd -> index
    this.msds = []; // [msd, features]
    this.lexIndex = new Map();
    this.lex = [];
    this.templateIndex = new Map();
    this.templates = [];
    this.records = []; // { lemma, template, lex, freq, autoLemma }
  }

  addEntry(lemma, category, lexFeatures, lemmaFreq, forms, autoLemma) {
    if (!lemma || forms.length === 0 || /[^\u0000-￿]/.test(lemma)) return;
    const rows = new Set();
    for (const [msd, feats, form] of forms) {
      let mi = this.msdIndex.get(msd);
      if (mi === undefined) {
        mi = this.msds.length;
        this.msdIndex.set(msd, mi);
        this.msds.push([msd, { ...feats }]);
      }
      const [P, removed, added] = encodeForm(lemma, form);
      rows.add(JSON.stringify([mi, P, removed, added]));
    }
    const sig = Array.from(rows).sort().join("\n");
    let ti = this.templateIndex.get(sig);
    if (ti === undefined) {
      ti = this.templates.length;
      this.templateIndex.set(sig, ti);
      this.templates.push(Array.from(rows).sort().map((r) => JSON.parse(r)));
    }
    const lexObj = { category, ...lexFeatures };
    const lexKey = JSON.stringify(lexObj);
    let li = this.lexIndex.get(lexKey);
    if (li === undefined) {
      li = this.lex.length;
      this.lexIndex.set(lexKey, li);
      this.lex.push(lexObj);
    }
    this.records.push({ lemma, template: ti, lex: li, freq: lemmaFreq, autoLemma });
  }

  encode(droppedLemmas) {
    const recs = this.records
      .filter((r) => !(r.autoLemma && droppedLemmas.has(r.autoLemma)))
      .sort((a, b) => (a.lemma < b.lemma ? -1 : a.lemma > b.lemma ? 1 : a.template - b.template || a.lex - b.lex));
    if (this.templates.length > 65535 || this.lex.length > 65535) throw new Error("Too many templates for u16");

    const lemmas = [];
    const lemmaFreq = [];
    const starts = [];
    for (let i = 0; i < recs.length; i++) {
      if (i === 0 || recs[i].lemma !== recs[i - 1].lemma) {
        lemmas.push(recs[i].lemma);
        lemmaFreq.push(0);
        starts.push(i);
      }
      lemmaFreq[lemmaFreq.length - 1] += recs[i].freq;
    }
    starts.push(recs.length);

    const json = new TextEncoder().encode(JSON.stringify({ msds: this.msds, lex: this.lex, templates: this.templates }));
    const dawg = encodeDawg(lemmas, Uint8Array.from(lemmaFreq, freqClass));
    const pad4 = (n) => (n + 3) & ~3;
    const size =
      8 + 4 + pad4(json.length) + 4 + pad4(dawg.length) + 8 + starts.length * 4 + pad4(recs.length * 2) * 2 + pad4(recs.length);
    const buf = new ArrayBuffer(size);
    const bytes = new Uint8Array(buf);
    const view = new DataView(buf);
    for (let i = 0; i < 8; i++) bytes[i] = MAGIC.charCodeAt(i);
    let p = 8;
    view.setUint32(p, json.length, true);
    bytes.set(json, p + 4);
    p += 4 + pad4(json.length);
    view.setUint32(p, dawg.length, true);
    bytes.set(dawg, p + 4);
    p += 4 + pad4(dawg.length);
    view.setUint32(p, lemmas.length, true);
    view.setUint32(p + 4, recs.length, true);
    p += 8;
    starts.forEach((s, i) => view.setUint32(p + i * 4, s, true));
    p += starts.length * 4;
    recs.forEach((r, i) => view.setUint16(p + i * 2, r.template, true));
    p += pad4(recs.length * 2);
    recs.forEach((r, i) => view.setUint16(p + i * 2, r.lex, true));
    p += pad4(recs.length * 2);
    recs.forEach((r, i) => view.setUint8(p + i, fineFreqClass(r.freq)));
    console.log(
      `  morphology: ${recs.length} entries (${this.records.length - recs.length} junk proper nouns dropped), ` +
        `${lemmas.length} lemmas, ${this.templates.length} templates, ${this.msds.length} MSDs, ${this.lex.length} lexical classes`
    );
    return bytes;
  }
}
