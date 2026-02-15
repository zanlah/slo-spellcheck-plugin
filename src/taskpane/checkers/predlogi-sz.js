var S_LETTERS = "cčfhkpsšt";

function correctSZ(nextChar) {
  var ch = nextChar.toLowerCase();
  if (S_LETTERS.indexOf(ch) !== -1) return "s";
  return "z";
}

export function checkSZ(text) {
  var issues = [];
  var seen = new Set();
  var re = /\b([sz])\s+([a-zA-ZčćđžšČĆĐŽŠ]+)/gi;
  var m;
  while ((m = re.exec(text)) !== null) {
    var prep = m[1];
    var nextWord = m[2];
    var nextChar = nextWord.charAt(0);
    var lower = prep.toLowerCase();
    var correct = correctSZ(nextChar);

    if (lower !== correct) {
      var original = m[1] + " " + nextWord;
      var key = original.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      var fixedPrep = prep === prep.toUpperCase() ? correct.toUpperCase() : correct;
      var suggestion = fixedPrep + " " + nextWord;
      issues.push({
        word: original,
        suggestions: [suggestion],
        isGrammar: true,
        grammarType: "predlog",
      });
    }
  }
  return issues;
}
