import test from "node:test";
import assert from "node:assert/strict";
import { checkPunctuation } from "../src/taskpane/checkers/locila.js";

const flagged = (text) => checkPunctuation(text).map((i) => `${i.word} → ${i.suggestions[0]}`);

test("real spacing errors are still found", () => {
  assert.deepEqual(flagged("To je beseda , ki manjka.Drugi stavek ima vejico,brez presledka."), [
    "beseda , → beseda,",
    "vejico,brez → vejico, brez",
    "manjka.Drugi → manjka. Drugi",
  ]);
  assert.deepEqual(flagged("Vojna 1939-1945 je trajala. Stane 17% več, meri 12cm in 1,5kg."), [
    "1939-1945 → 1939–1945",
    "7% → 7 %",
    "12cm → 12 cm",
    "1,5kg → 1,5 kg",
  ]);
});

test("no false alarms on e-mails, files, phones, dates, ellipses", () => {
  assert.deepEqual(
    flagged(
      "Pišite na jan.Novak@gmail.com ali odprite Poročilo.Docx in datoteko .docx. " +
        "Pokličite 041-123-456 ali 01-2345678. Datum 2024-05-01. To je ... no, ne vem. " +
        "Format A4m, F1s, COVID-19, ISBN 978-3-16-148410-0, pot C:\\Dokumenti\\Novo.Leto, x=a,b"
    ),
    []
  );
});
