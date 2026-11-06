import test from "node:test";
import assert from "node:assert/strict";
import { checkSZ } from "../src/taskpane/checkers/predlogi-sz.js";
import { checkKH } from "../src/taskpane/checkers/predlogi-kh.js";

const flagged = (fn, text) => fn(text).map((i) => `${i.word} → ${i.suggestions[0]}`);

test("s/z by first sound of ordinary words", () => {
  assert.deepEqual(flagged(checkSZ, "Šel je z prijateljem s mamo in s Tinom."), [
    "z prijateljem → s prijateljem",
    "s mamo → z mamo",
  ]);
  assert.deepEqual(flagged(checkSZ, "Z Petrom in s Hrvaško, z Ljubljano, s čajem."), ["Z Petrom → S Petrom"]);
});

test("s/z for acronyms spelled out letter by letter", () => {
  // SDS = es-de-es, FBI = ef-be-i? (has a vowel: ambiguous → skipped), GZS = ge-zed-es
  assert.deepEqual(flagged(checkSZ, "Pogovor z SDS in z NLB, s KZS."), []);
  assert.deepEqual(flagged(checkSZ, "Pogovor s SDS in s NLB."), ["s SDS → z SDS", "s NLB → z NLB"]);
  assert.deepEqual(flagged(checkSZ, "z FBI, s FBI, z NATO, s SAZU"), []); // could be read either way
  assert.deepEqual(flagged(checkSZ, "z SDS-om"), []);
});

test("s/z before numbers uses the spoken number", () => {
  assert.deepEqual(flagged(checkSZ, "s 5 osebami, z 2 avtoma, z 8 ljudmi, s 3 psi, s 100 evri, z 200 evri"), []);
  assert.deepEqual(flagged(checkSZ, "z 5 osebami in s 8 ljudmi"), ["z 5 → s 5", "s 8 → z 8"]);
  assert.deepEqual(flagged(checkSZ, "s 1.000 evri, z 2.000 evri, s 25 leti, z 21 leti, s 17 leti, z 18 leti"), []);
  assert.deepEqual(flagged(checkSZ, "s 1. mestom in z 1 mestom"), []); // 1. = prvi
});

test("s/z is not matched inside words, abbreviations or across lines", () => {
  assert.deepEqual(flagged(checkSZ, "d.o.o. s.p. jež s.\nz\nmamo čez mizo"), []);
});

test("k/h", () => {
  assert.deepEqual(flagged(checkKH, "Grem k Gregorju h Kranju, h mami in k hiši."), [
    "k Gregorju → h Gregorju",
    "h mami → k mami",
  ]);
  assert.deepEqual(flagged(checkKH, "h GZS, h KZS, k 5 ljudem, k 2. točki"), []);
  assert.deepEqual(flagged(checkKH, "k GZS in h NLB"), ["k GZS → h GZS", "h NLB → k NLB"]);
});
