var SL_WORD = "[a-zA-ZčćđžšČĆĐŽŠ]+";

var phraseList = [
  // "in" + explanatory / subordinating conjunction
  "in sicer", "in to",
  "in če", "in ko", "in da", "in ker", "in ki",
  // "ter" + subordinating conjunction (same pattern as "in")
  "ter če", "ter ko", "ter da", "ter ker", "ter ki",
  // "kot" + clause indicators
  "kot da", "kot bi", "kot če",
  "kot sem", "kot si", "kot je", "kot sva", "kot sta",
  "kot smo", "kot ste", "kot so",
  "kot bom", "kot boš", "kot bo", "kot bova", "kot bosta",
  "kot bomo", "kot boste", "kot bodo",
  // negation + conjunction ("ne da bi" = without having to)
  "ne da",
  // compound conjunctions (večbesedni vezniki)
  "zato da", "zato ker", "zato če", "zato kadar",
  "razen če", "razen da",
  "tako da",
  "potem ko",
  "brez da",
  "medtem ko",
  "namesto da",
  "že ko",
  "češ da",
  "prej ko",
  "toliko da",
  "še ko",
  "vtem ko",
  "brž ko",
  "šele ko",
  "posebno ko",
  "zlasti če",
  "zlasti ko",
  "zlasti kadar",
  // three-word compound conjunctions
  "kljub temu da",
  "s tem da",
];

export function checkCommas(text) {
  var issues = [];
  var seen = new Set();
  var usedRanges = [];

  // 1. Multi-word phrases that need a comma before them.
  //    Check these FIRST so single-conjunction check can skip overlapping matches.
  var phraseAlt = phraseList.map(function (p) {
    return p.replace(/ /g, "\\s+");
  }).join("|");
  var phraseRe = new RegExp(
    "(" + SL_WORD + ")\\s+(" + phraseAlt + ")(?=\\s+(" + SL_WORD + "))",
    "gi"
  );
  var m;
  while ((m = phraseRe.exec(text)) !== null) {
    var before = m[1];
    var phrase = m[2].replace(/\s+/g, " ");
    var after = m[3];
    var original = before + " " + phrase + " " + after;
    var key = original.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    usedRanges.push([m.index, m.index + m[0].length + after.length + 1]);
    issues.push({
      word: original,
      suggestions: [before + ", " + phrase + " " + after],
      isGrammar: true,
      grammarType: "vejica",
    });
  }

  // Build a set of protected word pairs from phraseList so the single-conjunction
  // check won't split known phrases (e.g. "kot da" won't be flagged as "kot, da").
  var phrasePairs = new Set();
  phraseList.forEach(function (p) {
    var parts = p.split(" ");
    if (parts.length >= 2) {
      // Protect last two words from single-conjunction splitting
      // e.g. "kljub temu da" → protects "temu da" from being flagged as "temu, da"
      phrasePairs.add(parts[parts.length - 2].toLowerCase() + " " + parts[parts.length - 1].toLowerCase());
    }
  });

  // 2. Single subordinating & adversative conjunctions that need a comma before them.
  //    Uses a lookahead for the word after so consecutive conjunctions aren't missed.
  var conjunctions = [
    "ki", "ker", "da", "ko", "če",
    "vendar", "ampak", "toda", "temveč",
    "čeprav", "četudi", "kadar", "dokler", "oziroma",
    "preden", "odkar", "saj",
  ];
  var conjAlt = conjunctions.join("|");
  var conjRe = new RegExp(
    "(" + SL_WORD + ")\\s+(" + conjAlt + ")(?=\\s+(" + SL_WORD + "))",
    "gi"
  );
  while ((m = conjRe.exec(text)) !== null) {
    // Skip if this region was already covered by a phrase match
    var mStart = m.index;
    var mEnd = m.index + m[0].length;
    var overlaps = usedRanges.some(function (r) {
      return mStart < r[1] && mEnd > r[0];
    });
    if (overlaps) continue;

    var before = m[1];
    var conj = m[2];
    var after = m[3];

    // Skip if word + conjunction is a known phrase (e.g. "kot da", "medtem ko")
    if (phrasePairs.has(before.toLowerCase() + " " + conj.toLowerCase())) continue;

    var original = before + " " + conj + " " + after;
    var key = original.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push({
      word: original,
      suggestions: [before + ", " + conj + " " + after],
      isGrammar: true,
      grammarType: "vejica",
    });
  }

  // 3. Comma incorrectly placed BETWEEN parts of a multi-word conjunction.
  //    e.g. "vzmet zato, da se" → should be "vzmet, zato da se"
  //    Per SP 2001 §329: comma goes before the first part, not between parts.
  var splitConjunctions = [
    ["zato", "da"],
    ["zato", "ker"],
    ["zato", "če"],
    ["zato", "kadar"],
    ["namesto", "da"],
    ["češ", "da"],
    ["medtem", "ko"],
    ["tako", "da"],
    ["prej", "ko"],
    ["toliko", "da"],
    ["potem", "ko"],
    ["že", "ko"],
    ["še", "ko"],
    ["vtem", "ko"],
    ["brž", "ko"],
    ["šele", "ko"],
    ["posebno", "ko"],
    ["zlasti", "če"],
    ["zlasti", "ko"],
    ["zlasti", "kadar"],
    ["razen", "če"],
    ["razen", "da"],
    ["brez", "da"],
    ["kljub temu", "da"],
    ["s tem", "da"],
  ];

  splitConjunctions.forEach(function (pair) {
    var part1 = pair[0];
    var part2 = pair[1];
    var part1Re = part1.replace(/ /g, "\\s+");
    var re = new RegExp(
      "(" + SL_WORD + ")(,?)\\s+(" + part1Re + "),\\s+(" + part2 + ")(?=\\s+(" + SL_WORD + "))",
      "gi"
    );
    var m;
    while ((m = re.exec(text)) !== null) {
      var before = m[1];
      var hadComma = m[2] === ",";
      var matchedPart1 = m[3].replace(/\s+/g, " ");
      var matchedPart2 = m[4];
      var after = m[5];
      var original = before + (hadComma ? ", " : " ") + matchedPart1 + ", " + matchedPart2 + " " + after;
      var key = original.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push({
        word: original,
        suggestions: [before + ", " + matchedPart1 + " " + matchedPart2 + " " + after],
        isGrammar: true,
        grammarType: "vejica",
      });
    }
  });

  return issues;
}
