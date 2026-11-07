import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadMorph } from "../src/taskpane/morph.js";

const buf = readFileSync(new URL("../src/taskpane/dict/sl-morph.bin", import.meta.url));
const morph = loadMorph(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
const readings = (w) => morph.analyzeWord(w).map((r) => `${r.lemma}:${r.features.number}:${r.features.case}`);

test("analysis finds lemma, number and case, including stem changes", () => {
  assert.ok(readings("psa").includes("pes:singular:genitive"));
  assert.ok(readings("dneva").includes("dan:dual:nominative"));
  assert.ok(readings("prijateljema").includes("prijatelj:dual:instrumental"));
  assert.ok(!readings("prijatelji").some((r) => r.includes(":dual:")));
  assert.ok(readings("Ljubljani").includes("Ljubljana:singular:locative"));
  assert.ok(morph.analyzeWord("najlepših").some((r) => r.lemma === "lep" && r.features.degree === "superlative"));
  assert.ok(morph.analyzeWord("šel").some((r) => r.lemma === "iti" && r.features.vform === "participle"));
});

test("paradigms: most frequent entry first", () => {
  const [pes] = morph.entries("psom");
  assert.equal(pes.lemma, "pes");
  const forms = (e, pred) => e.forms.filter((f) => pred(f.features)).map((f) => f.form);
  assert.deepEqual(forms(pes, (f) => f.number === "plural" && f.case === "genitive"), ["psov"]);
  const [dober] = morph.entries("dober");
  assert.equal(dober.lex.category, "adjective");
  assert.ok(forms(dober, (f) => f.degree === "comparative").includes("boljši"));
  const [iti] = morph.entries("grem");
  assert.equal(iti.lemma, "iti");
  assert.equal(morph.entries("xqzv").length, 0);
});
