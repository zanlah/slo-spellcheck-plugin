#!/usr/bin/env node
// Builds src/taskpane/dict/sl.dawg — a compact word automaton containing
//   * standard word forms from the Sloleks 3.1 morphological lexicon (CC BY-SA 4.0)
//   * every word form accepted by the LibreOffice Hunspell sl_SI dictionary (dictionary-sl)
// plus a corpus-frequency class per word (Gigafida 2.0 counts from Sloleks), used to
// rank suggestions and to spot likely missing diacritics.
//
// Usage:
//   node scripts/build-dictionary.mjs <path/to/Sloleks.3.1.zip>
//
// Sloleks 3.1: http://hdl.handle.net/11356/2080 (the `unzip` CLI is used to stream the archive).

import { spawn, execFileSync } from "node:child_process";
import { createInterface } from "node:readline";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeDawg } from "./dawg-encode.mjs";
import { MorphBuilder } from "./morph-build.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const OUT = join(root, "src/taskpane/dict/sl.dawg");
const MORPH_OUT = join(root, "src/taskpane/dict/sl-morph.bin");

// A token as produced by the add-in tokenizer: letters, optionally joined by ' or -.
const WORD_RE = /^\p{L}+(?:['-]\p{L}+)*$/u;

// Proper nouns that Sloleks generated automatically from the Gigafida corpus were never
// checked by hand and include corpus typos ("Ljubljna", "Slovenja") and tokenisation junk
// ("LjubljanaV", "nMOSKVA"). Such a lemma is dropped when it is one edit away from a
// capitalised form that is at least NEAR_DUP_RATIO times more frequent (and >= NEAR_DUP_MIN).
const NEAR_DUP_RATIO = 50;
const NEAR_DUP_MIN = 2000;
const JUNK_CASE_RE = /\p{Ll}\p{Lu}{1,2}$|^\p{Ll}\p{Lu}{2,}/u;

const zipPath = process.argv[2];
if (!zipPath) {
  console.error("Usage: node scripts/build-dictionary.mjs <path/to/Sloleks.3.1.zip>");
  process.exit(1);
}

/** form -> summed Gigafida frequency, for manually checked entries and common words */
const freq = new Map();
/** unchecked proper-noun lemma -> { freq, forms: Map(form -> freq) } */
const autoProper = new Map();
let rows = 0;
let skippedNonStandard = 0;
const morph = new MorphBuilder();

function normalize(form) {
  return unescapeXml(form).replace(/\u2019/g, "'");
}

function clean(form) {
  form = normalize(form);
  return WORD_RE.test(form) ? form : null;
}

function bump(map, key, f) {
  map.set(key, (map.get(key) || 0) + f);
}

// Streams one XML part. The files are pretty-printed with one element per line, so a
// line scanner is much faster than a real XML parser here.
function extractPart(name) {
  return new Promise((resolve, reject) => {
    const proc = spawn("unzip", ["-p", zipPath, name]);
    const rl = createInterface({ input: proc.stdout, crlfDelay: Infinity });
    let status = "";
    let lemma = "";
    let proper = false;
    let lemmaFreq = 0;
    let inHead = false;
    let inOrth = false;
    let form = null;
    let f = 0;
    let norm = "";
    let wfNorm = "";
    let entry = null; // autoProper record for the current entry, if any
    let autoLemma = null; // cleaned lemma if this entry is an unchecked proper noun
    let category = "";
    let lex = {};
    let msd = "";
    let wfFeats = {};
    let entryForms = []; // [msd, features, form] of standard forms, for the morphology data

    rl.on("line", (line) => {
      const s = line.trimStart();
      if (s.charCodeAt(0) !== 60 /* < */) return;
      if (s.startsWith("<entry")) {
        status = lemma = category = "";
        proper = false;
        lemmaFreq = 0;
        inHead = false;
        entry = null;
        autoLemma = null;
        lex = {};
        entryForms = [];
      } else if (s.startsWith("</entry>")) {
        morph.addEntry(normalize(lemma), category, lex, lemmaFreq, entryForms, autoLemma);
      } else if (s.startsWith("<head>")) {
        inHead = true;
      } else if (s.startsWith("</head>")) {
        inHead = false;
        if (status === "AUTOMATIC" && proper) {
          const l = clean(lemma);
          autoLemma = l;
          if (l) {
            entry = autoProper.get(l);
            if (!entry) autoProper.set(l, (entry = { freq: 0, forms: new Map() }));
            entry.freq += lemmaFreq;
          } else {
            entry = { freq: 0, forms: new Map() }; // unusable lemma: collect and discard
          }
        }
      } else if (inHead && s.startsWith("<status>")) {
        status = s.slice(8, s.indexOf("<", 8));
      } else if (inHead && s.startsWith("<lemma>")) {
        lemma = s.slice(7, s.indexOf("<", 7));
      } else if (inHead && s.startsWith("<category>")) {
        category = s.slice(10, s.indexOf("<", 10));
      } else if (s.startsWith("<grammarFeature ")) {
        const m = /^<grammarFeature name="([^"]+)">([^<]*)</.exec(s);
        if (!m) return;
        if (inHead) {
          lex[m[1]] = m[2];
          if (m[1] === "type" && m[2] === "proper") proper = true;
        } else {
          wfFeats[m[1]] = m[2];
        }
      } else if (s.startsWith("<msd")) {
        msd = s.slice(s.indexOf(">") + 1, s.indexOf("</"));
      } else if (inHead && s.startsWith('<measure type="frequency"')) {
        lemmaFreq = parseInt(s.slice(s.indexOf(">") + 1), 10) || 0;
      } else if (s.startsWith("<wordForm")) {
        const m = /norm="([^"]*)"/.exec(s);
        wfNorm = m ? m[1] : "";
        msd = "";
        wfFeats = {};
      } else if (s.startsWith("<orthography")) {
        const m = /norm="([^"]*)"/.exec(s);
        norm = m ? m[1] : wfNorm;
        inOrth = true;
        form = null;
        f = 0;
      } else if (inOrth && s.startsWith("<form>")) {
        form = s.slice(6, s.indexOf("<", 6));
      } else if (inOrth && s.startsWith('<measure type="frequency"')) {
        f = parseInt(s.slice(s.indexOf(">") + 1), 10) || 0;
      } else if (s.startsWith("</orthography>")) {
        inOrth = false;
        if (form === null) return;
        rows++;
        if (norm === "non-standard") {
          skippedNonStandard++;
          return;
        }
        entryForms.push([msd, wfFeats, normalize(form)]);
        const w = clean(form);
        if (!w) return;
        if (entry) bump(entry.forms, w, f);
        else bump(freq, w, f);
      }
    });
    rl.on("close", resolve);
    proc.on("error", reject);
    proc.on("exit", (code) => code && reject(new Error(`unzip exited with ${code} for ${name}`)));
  });
}

function unescapeXml(s) {
  return s.indexOf("&") === -1
    ? s
    : s.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

async function loadSloleks() {
  const parts = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8", maxBuffer: 1 << 24 })
    .split("\n")
    .filter((n) => /sloleks_[^/]*\.xml$/.test(n));
  if (parts.length === 0) throw new Error("No sloleks_*.xml parts found in " + zipPath);
  const started = Date.now();
  let done = 0;
  const queue = parts.slice();
  async function worker() {
    while (queue.length) {
      await extractPart(queue.shift());
      done++;
      if (done % 10 === 0 || done === parts.length) console.log(`  Sloleks: ${done}/${parts.length} parts`);
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  console.log(`  ${rows} orthographic rows, ${skippedNonStandard} non-standard skipped, ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

function deletes(w) {
  const out = [];
  for (let i = 0; i < w.length; i++) out.push(w.slice(0, i) + w.slice(i + 1));
  return out;
}

// Optimal-string-alignment distance, stopping early once it exceeds 1.
function withinOneEdit(a, b) {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // substitution
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // transposition
  }
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

function mergeAutoProper() {
  // Frequent capitalised forms from everything we have, indexed by single deletions.
  const total = new Map(freq);
  for (const { forms } of autoProper.values()) for (const [w, f] of forms) bump(total, w, f);
  const index = new Map();
  for (const [w, f] of total) {
    if (f < NEAR_DUP_MIN || !/^\p{Lu}/u.test(w)) continue;
    for (const k of [w, ...deletes(w)]) {
      const list = index.get(k);
      if (list) list.push(w);
      else index.set(k, [w]);
    }
  }
  const nearDuplicate = (w, f) => {
    if (w.length < 4) return false;
    const limit = Math.max(f, 1) * NEAR_DUP_RATIO;
    for (const k of [w, ...deletes(w)]) {
      for (const c of index.get(k) || []) if (total.get(c) >= limit && withinOneEdit(w, c)) return true;
    }
    return false;
  };
  const droppedLemmas = new Set();
  let dropped = 0;
  let droppedForms = 0;
  let junk = 0;
  for (const [lemma, { freq: lf, forms }] of autoProper) {
    if (JUNK_CASE_RE.test(lemma)) {
      junk++;
      droppedLemmas.add(lemma);
      continue;
    }
    if (nearDuplicate(lemma, lf)) {
      dropped++;
      droppedLemmas.add(lemma);
      continue;
    }
    for (const [w, f] of forms) {
      if (w !== lemma && nearDuplicate(w, f)) droppedForms++;
      else bump(freq, w, f);
    }
  }
  console.log(`  unchecked proper nouns: ${autoProper.size} lemmas; dropped ${dropped} near-duplicate lemmas, ${droppedForms} near-duplicate forms, ${junk} case-junk lemmas`);
  return droppedLemmas;
}

function loadHunspellForms() {
  const NSpell = require("nspell");
  const dictDir = join(root, "node_modules/dictionary-sl");
  const spell = NSpell(readFileSync(join(dictDir, "index.aff"), "utf8"), readFileSync(join(dictDir, "index.dic"), "utf8"));
  let added = 0;
  let accepted = 0;
  for (const word of Object.keys(spell.data)) {
    if (!spell.correct(word)) continue; // skip NEEDAFFIX/forbidden stems etc.
    accepted++;
    if (!WORD_RE.test(word)) continue;
    if (!freq.has(word)) {
      freq.set(word, 0);
      added++;
    }
  }
  console.log(`  Hunspell: ${accepted} accepted forms, ${added} not in Sloleks`);
}

// log2-based frequency class 0..15 (0 = unseen in Gigafida).
function freqClass(n) {
  return n <= 0 ? 0 : Math.min(15, 1 + Math.floor(Math.log2(n)));
}

console.log("Reading Sloleks…");
await loadSloleks();
const droppedLemmas = mergeAutoProper();
const sloleksOnly = freq.size;
console.log("Reading Hunspell (dictionary-sl)…");
loadHunspellForms();

const words = Array.from(freq.keys()).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const classes = Uint8Array.from(words, (w) => freqClass(freq.get(w)));
console.log(`Building automaton for ${words.length} words…`);
const bytes = encodeDawg(words, classes);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, bytes);
console.log(`Wrote ${OUT}: ${(bytes.length / 1e6).toFixed(2)} MB (${sloleksOnly} from Sloleks, ${words.length - sloleksOnly} Hunspell-only)`);

console.log("Building morphology data…");
const morphBytes = morph.encode(droppedLemmas);
writeFileSync(MORPH_OUT, morphBytes);
console.log(`Wrote ${MORPH_OUT}: ${(morphBytes.length / 1e6).toFixed(2)} MB`);
