// Runtime reader for the word automaton built by scripts/build-dictionary.mjs
// (format documented in scripts/dawg-encode.mjs).

const MAGIC = "SLDAWG01";

// Slovene diacritics that are often typed without the hook (and similar letters).
const BASE_LETTER = { č: "c", ć: "c", š: "s", ž: "z", đ: "d" };

function baseOf(ch) {
  const lower = ch.toLowerCase();
  return BASE_LETTER[lower] || lower.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function loadDawg(arrayBuffer, byteOffset = 0) {
  const view = new DataView(arrayBuffer, byteOffset);
  for (let i = 0; i < 8; i++) {
    if (view.getUint8(i) !== MAGIC.charCodeAt(i)) throw new Error("Neveljavna datoteka slovarja");
  }
  const alphaSize = view.getUint32(8, true);
  const edgeCount = view.getUint32(12, true);
  const wordCount = view.getUint32(16, true);
  const charWidth = view.getUint32(20, true);
  const pad4 = (n) => (n + 3) & ~3;

  let p = byteOffset + 24;
  const alphabet = new Array(alphaSize);
  for (let i = 0; i < alphaSize; i++) alphabet[i] = String.fromCharCode(view.getUint16(p - byteOffset + i * 2, true));
  p += pad4(alphaSize * 2);
  const edges = new Uint32Array(arrayBuffer, p, edgeCount);
  p += edgeCount * 4;
  const counts = new Uint32Array(arrayBuffer, p, edgeCount);
  p += edgeCount * 4;
  const chars = charWidth === 1 ? new Uint8Array(arrayBuffer, p, edgeCount) : new Uint16Array(arrayBuffer, p, edgeCount);
  p += pad4(edgeCount * charWidth);
  const freqs = new Uint8Array(arrayBuffer, p, Math.ceil(wordCount / 2));

  // UTF-16 code unit -> alphabet index (-1 = not in alphabet)
  const charToIndex = new Int16Array(65536).fill(-1);
  alphabet.forEach((c, i) => {
    charToIndex[c.charCodeAt(0)] = i;
  });

  // Substitution cost between two alphabet letters: same letter but different case is
  // cheap, a missing/wrong diacritic (c/č, s/š, z/ž…) is half an edit, anything else is 1.
  const lowerOf = alphabet.map((c) => c.toLowerCase());
  const baseOfIdx = alphabet.map(baseOf);

  /** Index of `word` in the sorted word list, or -1. Exact (case-sensitive) match. */
  function indexOf(word) {
    let edge = 0;
    let idx = 0;
    for (let i = 0; i < word.length; i++) {
      const c = charToIndex[word.charCodeAt(i)];
      if (c < 0) return -1;
      let e = edge;
      while (chars[e] !== c) {
        if (edges[e] & 1) return -1;
        idx += counts[e];
        e++;
      }
      const packed = edges[e];
      if (i === word.length - 1) return packed & 2 ? idx : -1;
      if (packed & 2) idx++;
      edge = packed >>> 2;
      if (edge === 0) return -1;
    }
    return -1;
  }

  function freqClassAt(idx) {
    const b = freqs[idx >> 1];
    return idx & 1 ? b >> 4 : b & 15;
  }

  /**
   * All words within weighted Damerau-Levenshtein distance `maxDist` of `input`.
   * Returns [{ word, dist, freq }]. Walks the automaton once, pruning branches whose
   * best possible distance already exceeds maxDist.
   */
  function nearWords(input, maxDist) {
    const n = input.length;
    const inLower = Array.from(input, (c) => c.toLowerCase());
    const inBase = Array.from(input, baseOf);
    const out = [];
    const prefix = [];

    function subCost(ci, j) {
      const ch = alphabet[ci];
      if (ch === input[j]) return 0;
      if (lowerOf[ci] === inLower[j]) return 0.25;
      if (baseOfIdx[ci] === inBase[j]) return 0.5;
      return 1;
    }

    const first = new Float32Array(n + 1);
    for (let j = 0; j <= n; j++) first[j] = j;

    function walk(edgeStart, idxBase, prevRow, prevPrevRow, prevChar) {
      let idx = idxBase;
      for (let e = edgeStart; ; e++) {
        const ci = chars[e];
        const packed = edges[e];
        const row = new Float32Array(n + 1);
        row[0] = prevRow[0] + 1;
        let best = row[0];
        for (let j = 1; j <= n; j++) {
          let v = Math.min(prevRow[j] + 1, row[j - 1] + 1, prevRow[j - 1] + subCost(ci, j - 1));
          // adjacent transposition (ab -> ba)
          if (prevPrevRow && j > 1 && prevChar >= 0 && subCost(ci, j - 2) === 0 && subCost(prevChar, j - 1) === 0) {
            v = Math.min(v, prevPrevRow[j - 2] + 1);
          }
          row[j] = v;
          if (v < best) best = v;
        }
        if (best <= maxDist) {
          prefix.push(alphabet[ci]);
          if (packed & 2 && row[n] <= maxDist) {
            out.push({ word: prefix.join(""), dist: row[n], freq: freqClassAt(idx) });
          }
          const target = packed >>> 2;
          if (target !== 0) walk(target, idx + (packed & 2 ? 1 : 0), row, prevRow, ci);
          prefix.pop();
        }
        if (packed & 1) break;
        idx += counts[e];
      }
    }

    walk(0, 0, first, null, -1);
    return out;
  }

  return {
    wordCount,
    indexOf,
    has(word) {
      return indexOf(word) >= 0;
    },
    freqClass(word) {
      const i = indexOf(word);
      return i < 0 ? -1 : freqClassAt(i);
    },
    nearWords,
  };
}
