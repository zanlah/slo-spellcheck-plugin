// Checker for punctuation spacing rules (ločila in presledki)
// Based on: https://www.lektorsko-drustvo.si/predavanja-in-delavnice/locila-in-presledki/

var SL_WORD = "[a-zA-ZčćđžšČĆĐŽŠ]+";
var SL_UPPER = "[A-ZČĆĐŽŠ]";
// Letters + closing brackets/parens/quotes — characters that can validly precede punctuation
var BEFORE_PUNCT = "[a-zA-ZčćđžšČĆĐŽŠ)\\]»\"']+";

// True when the match sits inside an e-mail address, path, URL, file name or code-like token
// ("jan.Novak@gmail.com", "C:\\Dokumenti", "Poročilo.Docx"), where spacing rules don't apply.
function inTechnicalToken(text, start, end) {
  var from = start;
  while (from > 0 && !/\s/.test(text.charAt(from - 1))) from--;
  var to = end;
  while (to < text.length && !/\s/.test(text.charAt(to))) to++;
  var token = text.slice(from, to);
  return /[@\/\\_=<>{}|#]|:\/\//.test(token) || FILE_EXT_RE.test(token);
}

var FILE_EXT_RE = /\.(docx?|xlsx?|pptx?|pdf|txt|csv|rtf|odt|ods|jpe?g|png|gif|svg|zip|html?|xml|json|js|py|exe|mp3|mp4)\b/i;

export function checkPunctuation(text) {
  var issues = [];
  var seen = new Set();
  var m;

  // 1. Space before comma, period, semicolon, question mark, exclamation mark
  //    e.g. "beseda ," → "beseda,", "zaposlenih) ." → "zaposlenih)."
  //    Not for ellipses ("To je ... no") or a dot that starts a token (".docx", ".5").
  var spaceBeforeRe = new RegExp(
    "(" + BEFORE_PUNCT + ") +([,;?!]|\\.(?![.\\p{L}\\p{N}]))(?!\\.)",
    "gu"
  );
  while ((m = spaceBeforeRe.exec(text)) !== null) {
    var original = m[0];
    if (inTechnicalToken(text, m.index + m[0].length - m[2].length, m.index + m[0].length)) continue;
    var suggestion = m[1] + m[2];
    if (seen.has(original)) continue;
    seen.add(original);
    issues.push({
      word: original,
      suggestions: [suggestion],
      isGrammar: true,
      grammarType: "ločilo",
    });
  }

  // 2. Missing space after comma or semicolon (when followed by a letter)
  //    e.g. "beseda,druga" → "beseda, druga", "enote),pa" → "enote), pa"
  //    Skips digits after comma (e.g. "1,5" is valid decimal notation)
  var missingAfterRe = new RegExp(
    "(" + BEFORE_PUNCT + ")([,;])(" + SL_WORD + ")",
    "g"
  );
  while ((m = missingAfterRe.exec(text)) !== null) {
    var original = m[0];
    if (inTechnicalToken(text, m.index, m.index + m[0].length)) continue;
    var suggestion = m[1] + m[2] + " " + m[3];
    if (seen.has(original)) continue;
    seen.add(original);
    issues.push({
      word: original,
      suggestions: [suggestion],
      isGrammar: true,
      grammarType: "ločilo",
    });
  }

  // 3. Missing space after period before a capitalized word (new sentence)
  //    e.g. "beseda.Druga" → "beseda. Druga"
  //    Only flags when a capital letter + more letters follow (avoids abbreviations like "d.o.o.")
  var missingAfterPeriodRe = new RegExp(
    "(" + SL_WORD + ")\\.(" + SL_UPPER + "[a-zA-ZčćđžšČĆĐŽŠ]+)",
    "g"
  );
  while ((m = missingAfterPeriodRe.exec(text)) !== null) {
    var original = m[0];
    if (inTechnicalToken(text, m.index, m.index + m[0].length)) continue;
    var suggestion = m[1] + ". " + m[2];
    if (seen.has(original)) continue;
    seen.add(original);
    issues.push({
      word: original,
      suggestions: [suggestion],
      isGrammar: true,
      grammarType: "ločilo",
    });
  }

  // 4. Hyphen used instead of en-dash in number ranges
  //    e.g. "1939-1945" → "1939–1945"
  //    Per rule 5: en-dash (pomišljaj) between different-type elements
  //    Skips phone numbers, dates and codes: more than two groups ("041-123-456",
  //    "2024-05-01"), leading zeros ("01-2345") or long digit groups.
  var hyphenRangeRe = /(?<![\d\p{L}.,\/-])([1-9]\d{1,5})-([1-9]\d{0,5})(?![\d\p{L}\/-]|[.,]\d)/gu;
  while ((m = hyphenRangeRe.exec(text)) !== null) {
    var original = m[0];
    if (inTechnicalToken(text, m.index, m.index + m[0].length)) continue;
    var suggestion = m[1] + "\u2013" + m[2];
    if (seen.has(original)) continue;
    seen.add(original);
    issues.push({
      word: original,
      suggestions: [suggestion],
      isGrammar: true,
      grammarType: "ločilo",
    });
  }

  // 5. Number + % without space
  //    e.g. "17%" → "17 %"
  //    Per rule 9: non-breaking space between number and symbol
  var percentRe = /(\d)%/g;
  while ((m = percentRe.exec(text)) !== null) {
    var original = m[0];
    var suggestion = m[1] + " %";
    if (seen.has(original)) continue;
    seen.add(original);
    issues.push({
      word: original,
      suggestions: [suggestion],
      isGrammar: true,
      grammarType: "ločilo",
    });
  }

  // 6. Number + unit without space
  //    e.g. "7cm" → "7 cm", "50kg" → "50 kg"
  //    Per rule 9: non-breaking space between number and unit symbol
  var units = [
    "mm", "cm", "km", "mg", "kg", "ml", "dl", "min",
    "m", "g", "l", "h", "s",
  ];
  var unitAlt = units.join("|");
  var unitRe = new RegExp(
    "(?<![\\p{L}\\d.,])(\\d+(?:[.,]\\d+)?)(" + unitAlt + ")(?![\\p{L}\\d])",
    "gu"
  );
  while ((m = unitRe.exec(text)) !== null) {
    var original = m[0];
    if (inTechnicalToken(text, m.index, m.index + m[0].length)) continue;
    var suggestion = m[1] + " " + m[2];
    if (seen.has(original)) continue;
    seen.add(original);
    issues.push({
      word: original,
      suggestions: [suggestion],
      isGrammar: true,
      grammarType: "ločilo",
    });
  }

  return issues;
}
