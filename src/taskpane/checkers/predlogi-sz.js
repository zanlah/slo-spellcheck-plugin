import { firstSound, prepositionRegex } from "./izgovor.js";

// "s" before voiceless consonants (c, č, ć, f, h, k, p, s, š, t), otherwise "z".
var S_SOUNDS = "cčćfhkpsšt";

export function checkSZ(text) {
  return checkPreposition(text, "sz", function (sound) {
    return S_SOUNDS.indexOf(sound) !== -1 ? "s" : "z";
  });
}

export function checkPreposition(text, letters, expected) {
  var issues = [];
  var seen = new Set();
  var re = prepositionRegex(letters);
  var m;
  while ((m = re.exec(text)) !== null) {
    var prep = m[1];
    var nextWord = m[2];
    var sound = firstSound(nextWord, text.charAt(m.index + m[0].length));
    if (!sound) continue;
    var correct = expected(sound);
    if (prep.toLowerCase() === correct) continue;

    // Keep the exact whitespace so the replacement can find it in the document.
    var original = m[0];
    if (seen.has(original)) continue;
    seen.add(original);
    var fixedPrep = prep === prep.toUpperCase() ? correct.toUpperCase() : correct;
    issues.push({
      word: original,
      suggestions: [fixedPrep + original.slice(1)],
      isGrammar: true,
      grammarType: "predlog",
    });
  }
  return issues;
}
