// Encodes a sorted word list into the binary DAWG format read by src/taskpane/dawg.js.
//
// The automaton is minimised (shared prefixes *and* suffixes), which suits Slovene
// inflection well. Edges carry subtree word counts so every word has a numeric index
// (its position in the sorted list); that index looks up a 4-bit frequency class.
//
// Layout (little-endian):
//   0   "SLDAWG01"                 magic
//   8   u32 alphabet size A
//   12  u32 edge count E
//   16  u32 word count W
//   20  u32 char width (1 or 2 bytes per edge char)
//   24  u16[A] alphabet (UTF-16 code units), padded to 4 bytes
//   ..  u32[E] edges: target << 2 | final << 1 | last
//           target = index of the first edge of the target node (0 = no outgoing edges)
//           final  = a word ends after taking this edge
//           last   = last edge of its node
//   ..  u32[E] word count below each edge (including a word ending on it)
//   ..  u8|u16[E] alphabet index of each edge's char, padded to 4 bytes
//   ..  u8[ceil(W/2)] frequency classes, two 4-bit values per byte (low nibble first)

export const MAGIC = "SLDAWG01";

class Node {
  constructor() {
    this.final = false;
    this.chars = [];
    this.kids = [];
    this.id = -1;
  }
}

export function encodeDawg(words, freqClasses) {
  // --- Build a minimal automaton from sorted input (Daciuk et al. 2000) ---
  const root = new Node();
  const register = new Map();
  const registered = []; // in id order: children always precede parents
  const unchecked = []; // [parent, child] along the last inserted word
  let prev = "";

  const signature = (n) => {
    let s = n.final ? "1" : "0";
    for (let i = 0; i < n.chars.length; i++) s += n.chars[i] + n.kids[i].id + ",";
    return s;
  };
  const minimize = (downTo) => {
    while (unchecked.length > downTo) {
      const [parent, child] = unchecked.pop();
      const sig = signature(child);
      const existing = register.get(sig);
      if (existing) {
        parent.kids[parent.kids.length - 1] = existing;
      } else {
        child.id = registered.length;
        registered.push(child);
        register.set(sig, child);
      }
    }
  };

  for (const word of words) {
    if (word <= prev && prev !== "") throw new Error(`Input not sorted/unique at "${word}"`);
    let cp = 0;
    while (cp < word.length && cp < prev.length && word[cp] === prev[cp]) cp++;
    minimize(cp);
    let node = unchecked.length ? unchecked[unchecked.length - 1][1] : root;
    for (let i = cp; i < word.length; i++) {
      const child = new Node();
      node.chars.push(word[i]);
      node.kids.push(child);
      unchecked.push([node, child]);
      node = child;
    }
    node.final = true;
    prev = word;
  }
  minimize(0);
  root.id = registered.length;
  registered.push(root);
  register.clear();

  // --- Subtree word counts (children precede parents in `registered`) ---
  const below = new Map();
  for (const n of registered) {
    let total = 0;
    for (const k of n.kids) total += (k.final ? 1 : 0) + below.get(k);
    below.set(n, total);
  }
  if (below.get(root) !== words.length) throw new Error("Word count mismatch while encoding");

  // --- Lay out edge blocks: root first (offset 0), then BFS order ---
  const offset = new Map([[root, 0]]);
  const order = [root];
  let edgeCount = root.kids.length;
  for (let q = 0; q < order.length; q++) {
    for (const k of order[q].kids) {
      if (k.kids.length === 0 || offset.has(k)) continue;
      offset.set(k, edgeCount);
      edgeCount += k.kids.length;
      order.push(k);
    }
  }
  if (edgeCount >= 2 ** 30) throw new Error("Automaton too large for 30-bit targets");

  const alphabet = Array.from(new Set(words.join(""))).sort();
  if (alphabet.some((c) => c.length !== 1)) throw new Error("Non-BMP characters are not supported");
  const charIndex = new Map(alphabet.map((c, i) => [c, i]));
  const charWidth = alphabet.length <= 256 ? 1 : 2;

  const pad4 = (n) => (n + 3) & ~3;
  const alphaBytes = pad4(alphabet.length * 2);
  const charBytes = pad4(edgeCount * charWidth);
  const freqBytes = Math.ceil(words.length / 2);
  const size = 24 + alphaBytes + edgeCount * 8 + charBytes + freqBytes;
  const buf = new ArrayBuffer(size);
  const view = new DataView(buf);
  for (let i = 0; i < 8; i++) view.setUint8(i, MAGIC.charCodeAt(i));
  view.setUint32(8, alphabet.length, true);
  view.setUint32(12, edgeCount, true);
  view.setUint32(16, words.length, true);
  view.setUint32(20, charWidth, true);
  let p = 24;
  alphabet.forEach((c, i) => view.setUint16(p + i * 2, c.charCodeAt(0), true));
  p += alphaBytes;
  const edgesAt = p;
  const countsAt = edgesAt + edgeCount * 4;
  const charsAt = countsAt + edgeCount * 4;
  const freqAt = charsAt + charBytes;

  for (const n of order) {
    const base = offset.get(n);
    n.kids.forEach((k, i) => {
      const e = base + i;
      const target = k.kids.length ? offset.get(k) : 0;
      const packed = target * 4 + (k.final ? 2 : 0) + (i === n.kids.length - 1 ? 1 : 0);
      view.setUint32(edgesAt + e * 4, packed, true);
      view.setUint32(countsAt + e * 4, (k.final ? 1 : 0) + below.get(k), true);
      const ci = charIndex.get(n.chars[i]);
      if (charWidth === 1) view.setUint8(charsAt + e, ci);
      else view.setUint16(charsAt + e * 2, ci, true);
    });
  }
  for (let w = 0; w < words.length; w++) {
    const fc = freqClasses[w] & 15;
    const at = freqAt + (w >> 1);
    view.setUint8(at, view.getUint8(at) | (w & 1 ? fc << 4 : fc));
  }
  console.log(`  automaton: ${registered.length} states, ${edgeCount} edges, alphabet ${alphabet.length}`);
  return new Uint8Array(buf);
}
