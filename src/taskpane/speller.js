// Spell checker on top of the word automaton: casing rules, extra word lists
// (custom.dic + user dictionary), hyphenated compounds and ranked suggestions.

import { loadDawg } from "./dawg.js";

const UPPER_RE = /^\p{Lu}+$/u;
const TITLE_RE = /^\p{Lu}[^\p{Lu}]*$/u;

function capitalize(w) {
  return w.charAt(0).toUpperCase() + w.slice(1);
}

function recase(word, like) {
  if (like.length > 1 && UPPER_RE.test(like)) return word.toUpperCase();
  if (TITLE_RE.test(like) && /^\p{Ll}/u.test(word)) return capitalize(word);
  return word;
}

export function createSpeller(arrayBuffer) {
  const dawg = loadDawg(arrayBuffer);
  const extra = new Set();

  function known(w) {
    return dawg.has(w) || extra.has(w);
  }

  // Same casing rules as Hunspell: "miza" also accepts "Miza" (sentence start) and "MIZA";
  // a proper noun "Pariz" accepts "PARIZ" but not "pariz".
  function correctSimple(word) {
    if (known(word)) return true;
    const lower = word.toLowerCase();
    if (TITLE_RE.test(word)) return known(lower);
    if (word.length > 1 && UPPER_RE.test(word)) return known(lower) || known(capitalize(lower));
    return false;
  }

  function correct(word) {
    word = word.replace(/’/g, "'");
    if (correctSimple(word)) return true;
    // Sloleks stores names like O'Brien without the apostrophe ("OBrien").
    if (word.indexOf("'") !== -1 && correctSimple(word.replace(/'/g, ""))) return true;
    // Hyphenated or apostrophe compounds ("e-pošta", "SMS-sporočilo"): every part must be correct.
    const parts = word.split(/['-]/);
    return parts.length > 1 && parts.every((p) => p.length === 0 || correctSimple(p));
  }

  // Slovene text is often typed without č/š/ž. A rare dictionary word whose diacritic
  // variant is vastly more common ("drzava" — a form of the verb "drzati" — vs "država")
  // is far more likely a typo, so report it with the variant as the first suggestion.
  const DIACRITIC_GROUPS = { c: "cčć", č: "cčć", ć: "cčć", s: "sš", š: "sš", z: "zž", ž: "zž" };
  const MAX_RARE_CLASS = 6; // seen at most 63 times in the 1.1-billion-word Gigafida corpus
  const MIN_CLASS_GAP = 7; // variant at least ~128x more frequent

  function diacriticVariant(word) {
    const lower = word.toLowerCase();
    if (extra.has(word) || extra.has(lower)) return null;
    const base = dawg.has(word) ? word : lower;
    const own = dawg.freqClass(base);
    if (own < 0 || own > MAX_RARE_CLASS) return null;
    const slots = [];
    for (let i = 0; i < base.length; i++) if (DIACRITIC_GROUPS[base[i]]) slots.push(i);
    if (slots.length === 0 || slots.length > 8) return null;
    let best = null;
    let bestClass = own + MIN_CLASS_GAP - 1;
    const chars = base.split("");
    (function vary(k) {
      if (k === slots.length) {
        const v = chars.join("");
        if (v === base) return;
        const fc = dawg.freqClass(v);
        if (fc > bestClass) {
          bestClass = fc;
          best = v;
        }
        return;
      }
      const i = slots[k];
      const orig = chars[i];
      for (const c of DIACRITIC_GROUPS[orig]) {
        chars[i] = c;
        vary(k + 1);
      }
      chars[i] = orig;
    })(0);
    return best && recase(best, word);
  }

  /** null if the word looks fine, otherwise a ranked list of suggestions (may be empty). */
  function check(word) {
    if (!correct(word)) return suggest(word);
    const variant = diacriticVariant(word.replace(/’/g, "'"));
    if (!variant) return null;
    return [variant].concat(suggest(word).filter((s) => s !== variant)).slice(0, 6);
  }

  function suggest(word, limit = 6) {
    word = word.replace(/’/g, "'");
    const lower = word.toLowerCase();
    // Short words get only single edits, otherwise "je" would match half the dictionary.
    const maxDist = lower.length <= 3 ? 1 : 2;
    const candidates = dawg.nearWords(lower, maxDist);
    for (const w of extra) {
      if (Math.abs(w.length - lower.length) <= maxDist && w.toLowerCase() !== lower) {
        const d = editDistance(w.toLowerCase(), lower);
        if (d <= maxDist) candidates.push({ word: w, dist: d, freq: 8 });
      }
    }
    // Rank: edit distance dominates; corpus frequency (log2 classes 0-15) breaks near-ties.
    // 0.5 distance ≈ 7 frequency classes ≈ 128x more frequent.
    const score = (c) => c.dist * 2 - c.freq * 0.14;
    candidates.sort((a, b) => score(a) - score(b) || (a.word < b.word ? -1 : 1));
    const seen = new Set();
    const out = [];
    for (const c of candidates) {
      const w = recase(c.word, word);
      if (w === word || seen.has(w)) continue;
      seen.add(w);
      out.push(w);
      if (out.length >= limit) break;
    }
    return out;
  }

  return {
    wordCount: dawg.wordCount,
    correct,
    check,
    suggest,
    add(word) {
      if (word) extra.add(word.replace(/’/g, "'"));
    },
    remove(word) {
      extra.delete(word);
    },
  };
}

function editDistance(a, b) {
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}
