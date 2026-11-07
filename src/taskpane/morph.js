// Runtime reader for dict/sl-morph.bin (format: scripts/morph-build.mjs).
// - analyze(form): every Sloleks reading of a word form (lemma + grammatical features)
// - entries(word): lemma entries a word can belong to, with their full paradigms

import { loadDawg } from "./dawg.js";

const MAGIC = "SLMORPH1";

export function loadMorph(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  for (let i = 0; i < 8; i++) {
    if (view.getUint8(i) !== MAGIC.charCodeAt(i)) throw new Error("Neveljavna oblikoslovna datoteka");
  }
  const pad4 = (n) => (n + 3) & ~3;
  let p = 8;
  const jsonLen = view.getUint32(p, true);
  const data = JSON.parse(new TextDecoder().decode(new Uint8Array(arrayBuffer, p + 4, jsonLen)));
  p += 4 + pad4(jsonLen);
  const dawgLen = view.getUint32(p, true);
  const lemmas = loadDawg(arrayBuffer, p + 4);
  p += 4 + pad4(dawgLen);
  const lemmaCount = view.getUint32(p, true);
  const recordCount = view.getUint32(p + 4, true);
  p += 8;
  const starts = new Uint32Array(arrayBuffer, p, lemmaCount + 1);
  p += (lemmaCount + 1) * 4;
  const recTemplate = new Uint16Array(arrayBuffer, p, recordCount);
  p += pad4(recordCount * 2);
  const recLex = new Uint16Array(arrayBuffer, p, recordCount);
  p += pad4(recordCount * 2);
  const recFreq = new Uint8Array(arrayBuffer, p, recordCount);

  const msds = data.msds.map(([msd, features]) => ({ msd, features }));
  const lex = data.lex;
  const templates = data.templates;

  // added suffix -> [{ P, removed, byTemplate: Map(template -> [msd index]) }]
  const suffixIndex = new Map();
  templates.forEach((rows, t) => {
    for (const [mi, P, removed, added] of rows) {
      let groups = suffixIndex.get(added);
      if (!groups) suffixIndex.set(added, (groups = []));
      let g = groups.find((x) => x.P === P && x.removed === removed);
      if (!g) groups.push((g = { P, removed, byTemplate: new Map() }));
      const list = g.byTemplate.get(t);
      if (list) list.push(mi);
      else g.byTemplate.set(t, [mi]);
    }
  });

  function recordsOf(lemma) {
    const li = lemmas.indexOf(lemma);
    if (li < 0) return [];
    const out = [];
    for (let r = starts[li]; r < starts[li + 1]; r++) out.push(r);
    return out;
  }

  /** All readings of an exact (case-sensitive) form: [{ lemma, record, category, lex, msd, features }]. */
  function analyze(form) {
    const out = [];
    const cache = new Map();
    for (let k = 0; k <= form.length; k++) {
      const groups = suffixIndex.get(form.slice(k));
      if (!groups) continue;
      for (const g of groups) {
        if (k < g.P.length || (g.P && !form.startsWith(g.P))) continue;
        const lemma = form.slice(g.P.length, k) + g.removed;
        if (!lemma) continue;
        let recs = cache.get(lemma);
        if (!recs) cache.set(lemma, (recs = recordsOf(lemma)));
        for (const r of recs) {
          const mis = g.byTemplate.get(recTemplate[r]);
          if (!mis) continue;
          const lx = lex[recLex[r]];
          for (const mi of mis) {
            out.push({
              lemma,
              record: r,
              freq: recFreq[r],
              category: lx.category,
              lex: lx,
              msd: msds[mi].msd,
              features: msds[mi].features,
            });
          }
        }
      }
    }
    return out;
  }

  /** Readings of a word as written in running text (also tries "Miza" -> "miza"). */
  function analyzeWord(word) {
    const readings = analyze(word);
    const lower = word.toLowerCase();
    if (lower !== word) for (const r of analyze(lower)) readings.push(r);
    return readings;
  }

  function paradigm(record) {
    const li = lemmaIndexOfRecord(record);
    const lemma = lemmaStrings.get(li);
    const forms = templates[recTemplate[record]].map(([mi, P, removed, added]) => ({
      msd: msds[mi].msd,
      features: msds[mi].features,
      form: P + lemma.slice(0, lemma.length - removed.length) + added,
    }));
    return { lemma, record, freq: recFreq[record], lex: lex[recLex[record]], forms };
  }

  // Record -> lemma string: only needed for records found through analyze/entries, so we
  // remember the strings we have seen instead of storing them separately.
  const lemmaStrings = new Map();
  function lemmaIndexOfRecord(record) {
    let lo = 0;
    let hi = lemmaCount - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= record) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
  function remember(lemma) {
    const li = lemmas.indexOf(lemma);
    if (li >= 0) lemmaStrings.set(li, lemma);
  }

  /**
   * Lemma entries a word belongs to (as a lemma or as any inflected form), most frequent
   * first, each with its full paradigm.
   */
  function entries(word) {
    word = word.trim().replace(/’/g, "'");
    if (!word) return [];
    const recs = new Map();
    const add = (lemma, r) => {
      remember(lemma);
      if (!recs.has(r)) recs.set(r, lemma);
    };
    for (const v of new Set([word, word.toLowerCase(), word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()])) {
      for (const r of recordsOf(v)) add(v, r);
      for (const a of analyze(v)) add(a.lemma, a.record);
    }
    return Array.from(recs.entries())
      .map(([r, lemma]) => ({ r, lemma, exact: lemma === word, freq: recFreq[r] }))
      .sort((a, b) => b.exact - a.exact || b.freq - a.freq || a.r - b.r)
      .map((x) => paradigm(x.r));
  }

  /** Full paradigm of a record found through analyze() (its lemma string is known). */
  function paradigmOf(lemma, record) {
    remember(lemma);
    return paradigm(record);
  }

  return { analyze, analyzeWord, entries, paradigmOf, lemmaFrequency: (l) => lemmas.freqClass(l) };
}
