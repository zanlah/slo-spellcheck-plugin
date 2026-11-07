import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadMorph } from "../src/taskpane/morph.js";
import { createFormChecker } from "../src/taskpane/checkers/oblike.js";

const buf = readFileSync(new URL("../src/taskpane/dict/sl-morph.bin", import.meta.url));
const checker = createFormChecker(loadMorph(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)));
const flagged = (text) => checker.check(text).map((i) => `${i.word} → ${i.suggestions[0]}`);

test("preposition + case (errors from the Šolar corpus)", () => {
  assert.deepEqual(flagged("Ukvarjajo se z otroci."), ["z otroci → z otroki"]);
  assert.deepEqual(flagged("Namesto poroko je bila tragedija."), ["Namesto poroko → Namesto poroke"]);
  assert.deepEqual(flagged("Odšel je k družinskem prijatelju."), ["k družinskem → k družinskemu"]);
  assert.deepEqual(flagged("Snov je vzeta iz življenje njegove mame."), ["iz življenje → iz življenja"]);
  assert.deepEqual(flagged("Gremo z družina loviti ribe."), ["z družina → z družino"]);
});

test("dual and numerals", () => {
  assert.deepEqual(flagged("Govoril je z dvema prijatelji."), ["dvema prijatelji → dvema prijateljema"]);
  assert.deepEqual(flagged("Za vodjo sta se borila dva mravlji."), ["dva mravlji → dve mravlji"]);
  assert.deepEqual(flagged("Kupil je pet avtomobili."), ["pet avtomobili → pet avtomobilov"]);
  assert.deepEqual(flagged("Sestavljena je iz trinajstih poglavji."), ["trinajstih poglavji → trinajstih poglavij"]);
});

test("correct text is not flagged", () => {
  const ok =
    "Z dvema prijateljema sva šla v Ljubljano. Pet avtomobilov je stalo pred hišo. " +
    "V sto letih se je veliko spremenilo. Brez mize ne gre. Pri njej je vzrok drugje. " +
    "Do nje je bila ljubezen velika. Čez dobrih 6 let je umrl. Trajalo je od l. 1830 do 1849. " +
    "Sta oba romantični osebi. Z njo je bil srečen. Deset tisoč evrov. V tem primeru ne. " +
    "Ob 7. h zjutraj. Kljub temu borec ne odneha. Na to, kdo je kriv, ne gleda.";
  assert.deepEqual(flagged(ok), []);
});
