// Grammar rules for word forms (sklon, število), using Sloleks readings from morph.js:
//   1. dual after dva/dve/oba/obe      "z dvema prijatelji"  -> "prijateljema"
//   2. plural after trije/tri/štirje…  "tri avtomobila"      -> "avtomobili"
//   3. genitive plural after 5+        "pet avtomobili"      -> "avtomobilov"
//   4. case required by a preposition  "brez mizo"           -> "mize"
//
// Every Slovene form is ambiguous (mize = rod. ed. / im. mn. / tož. mn.), so a word is only
// flagged when NONE of its readings fits. The scan stops at anything that could make the
// rule inapplicable: punctuation, verbs, adverbs, conjunctions, unknown words.

var NOM_ACC = ["nominative", "accusative"];
var GEN_LOC = ["genitive", "locative"];
var DAT_INS = ["dative", "instrumental"];
var MASC = ["masculine"];
var FEM_NEU = ["feminine", "neuter"];
var ANY_GENDER = ["masculine", "feminine", "neuter"];

// form -> required number, allowed cases, allowed genders
var SMALL_NUMERALS = {
  dva: ["dual", NOM_ACC, MASC],
  dve: ["dual", NOM_ACC, FEM_NEU],
  // "oba/obe" are left out on purpose: they often float away from their noun
  // ("sta oba romantični osebi", "Obema ljubezen pomeni"), which made them unreliable.
  dveh: ["dual", GEN_LOC, ANY_GENDER],
  dvema: ["dual", DAT_INS, ANY_GENDER],
  trije: ["plural", ["nominative"], MASC],
  štirje: ["plural", ["nominative"], MASC],
  tri: ["plural", NOM_ACC, ANY_GENDER],
  štiri: ["plural", NOM_ACC, ANY_GENDER],
  treh: ["plural", GEN_LOC, ANY_GENDER],
  štirih: ["plural", GEN_LOC, ANY_GENDER],
  trem: ["plural", ["dative"], ANY_GENDER],
  štirim: ["plural", ["dative"], ANY_GENDER],
  tremi: ["plural", ["instrumental"], ANY_GENDER],
  štirimi: ["plural", ["instrumental"], ANY_GENDER],
};

var UNITS = "(?:pet|šest|sedem|osem|devet)";
var TENS = "(?:dvajset|trideset|štirideset|petdeset|šestdeset|sedemdeset|osemdeset|devetdeset)";
// Cardinals 5+ in their base (nominative/accusative) form: followed by genitive plural.
var BIG_NUMERAL_RE = new RegExp(
  "^(?:" + UNITS + "|deset|enajst|dvanajst|trinajst|štirinajst|petnajst|šestnajst|sedemnajst|osemnajst|devetnajst|" +
    "(?:(?:ena|dva|tri|štiri|" + UNITS + ")in)?" + TENS + "|(?:dve|tri|štiri|" + UNITS + ")?sto|tisoč)$"
);
// Declined forms (petih, petim, petimi, dvajsetih …): same case, plural.
var BIG_NUMERAL_DECLINED_RE = new RegExp(
  "^(" + UNITS + "|deset|(?:enajst|dvanajst|trinajst|štirinajst|petnajst|šestnajst|sedemnajst|osemnajst|devetnajst)|" +
    "(?:(?:ena|dva|tri|štiri|" + UNITS + ")in)?" + TENS + ")(ih|im|imi)$"
);
var DECLINED_CASES = { ih: GEN_LOC, im: ["dative"], imi: ["instrumental"] };

var PREPOSITIONS = {
  brez: ["genitive"],
  do: ["genitive"],
  iz: ["genitive"],
  izmed: ["genitive"],
  izpod: ["genitive"],
  izza: ["genitive"],
  od: ["genitive"],
  zaradi: ["genitive"],
  blizu: ["genitive"],
  sredi: ["genitive"],
  namesto: ["genitive"],
  okoli: ["genitive"],
  okrog: ["genitive"],
  poleg: ["genitive"],
  vzdolž: ["genitive"],
  k: ["dative"],
  h: ["dative"],
  proti: ["dative"],
  kljub: ["dative"],
  čez: ["accusative"],
  skozi: ["accusative"],
  zoper: ["accusative"],
  pri: ["locative"],
  v: ["locative", "accusative"],
  na: ["locative", "accusative"],
  ob: ["locative", "accusative"],
  po: ["locative", "accusative"],
  o: ["locative", "accusative"],
  med: ["instrumental", "accusative"],
  nad: ["instrumental", "accusative"],
  pod: ["instrumental", "accusative"],
  pred: ["instrumental", "accusative"],
  s: ["instrumental", "genitive"],
  z: ["instrumental", "genitive"],
  za: ["instrumental", "accusative", "genitive"],
};

var DECLINABLE = { noun: 1, adjective: 1, pronoun: 1, numeral: 1 };
var ABBREVIATIONS = { itd: 1, npr: 1, oz: 1, tj: 1, ipd: 1, idr: 1, ipd: 1, prim: 1, gl: 1, str: 1, št: 1, dr: 1, mag: 1, prof: 1, ga: 1, gos: 1, gdč: 1 };

var TOKEN_RE = /\p{L}+(?:['’-]\p{L}+)*|\d+(?:[.,]\d+)*|\S/gu;

function tokenize(text) {
  var tokens = [];
  var m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    tokens.push({
      text: m[0],
      start: m.index,
      end: m.index + m[0].length,
      isWord: /^\p{L}/u.test(m[0]),
      isNumber: /^\d/.test(m[0]),
    });
  }
  return tokens;
}

// Only spaces (no line break) between two tokens.
function adjacent(text, a, b) {
  return /^[ \t ]+$/.test(text.slice(a.end, b.start));
}

function recase(form, like) {
  if (like.length > 1 && like === like.toUpperCase()) return form.toUpperCase();
  if (like.charAt(0) !== like.charAt(0).toLowerCase()) return form.charAt(0).toUpperCase() + form.slice(1);
  return form;
}

export function createFormChecker(morph) {
  var cache = new Map();
  function readings(word) {
    var r = cache.get(word);
    if (!r) {
      r = morph.analyzeWord(word).filter(function (x) {
        // Unchecked/rare proper-noun homographs ("Mize") shouldn't hide errors in common words,
        // and letter names as nouns ("n" -> "nju") shouldn't produce readings at all.
        if (x.lex.type === "proper" && word.charAt(0) === word.charAt(0).toLowerCase()) return false;
        return !(x.category === "noun" && x.lemma.length <= 2);
      });
      cache.set(word, r);
    }
    return r;
  }

  // Classifies a word for a constraint: "ok" (some reading fits), "bad" (declinable, no reading
  // fits), "stop" (unknown or could be a non-declinable word — rule doesn't apply).
  function judge(word, fits) {
    var rs = readings(word);
    if (rs.length === 0) return { verdict: "stop" };
    for (var i = 0; i < rs.length; i++) {
      if (!DECLINABLE[rs[i].category] || !rs[i].features.case) return { verdict: "stop" };
    }
    var isNoun = rs.some(function (r) {
      return r.category === "noun";
    });
    var isPronoun = rs.some(function (r) {
      return r.category === "pronoun";
    });
    if (rs.some(fits)) return { verdict: "ok", isNoun: isNoun, isPronoun: isPronoun };
    return { verdict: "bad", readings: rs, isNoun: isNoun, isPronoun: isPronoun };
  }

  // Restrict a suggestion target to forms agreeing with the following noun, if any.
  function agreeing(bad, target) {
    if (!bad.agree || bad.agree.length === 0) return target;
    return function (x, orig) {
      if (!target(x, orig)) return false;
      return bad.agree.some(function (n) {
        var g = n.features.gender || n.lex.gender;
        return n.features.number === x.number && n.features.case === x.case && (!x.gender || !g || x.gender === g);
      });
    };
  }

  // Forms of the same lemma(s) that satisfy `target`, keeping the reading's other features.
  // Ranked by the order of `casePriority` (most usual case first), then forms that keep the
  // original number, then lemma frequency: "z otroci" -> "z otroki" (not "z otrok").
  function suggestionsFor(word, rs, target, casePriority) {
    var candidates = [];
    rs.forEach(function (r) {
      morph.paradigmOf(r.lemma, r.record).forms.forEach(function (f, order) {
        var x = f.features;
        if (!target(x, r.features)) return;
        var ci = casePriority ? casePriority.indexOf(x.case) : 0;
        candidates.push({
          form: recase(f.form, word),
          score: (ci < 0 ? 9 : ci) * 1000 + (x.number === r.features.number ? 0 : 500) - r.freq,
          order: order,
        });
      });
    });
    candidates.sort(function (a, b) {
      return a.score - b.score || a.order - b.order;
    });
    var out = [];
    candidates.forEach(function (c) {
      if (c.form !== word && out.indexOf(c.form) === -1) out.push(c.form);
    });
    return out.slice(0, 4);
  }

  function sameExcept(keys) {
    return function (x, orig) {
      for (var k in orig) {
        if (keys.indexOf(k) !== -1) continue;
        if (k === "animate" || k === "definiteness" || k === "clitic") continue;
        if (x[k] !== undefined && x[k] !== orig[k]) return false;
      }
      return true;
    };
  }

  // A word worth judging: lowercase (Sloleks covers names unevenly), not an abbreviation,
  // not another numeral ("deset tisoč", "z dvema" — the numeral rules handle that phrase).
  function judgeable(text, tokens, j) {
    var t = tokens[j];
    if (!t || !t.isWord || !adjacent(text, tokens[j - 1], t)) return false;
    if (t.text.charAt(0) !== t.text.charAt(0).toLowerCase()) return false;
    var tl = t.text.toLowerCase();
    if (text.charAt(t.end) === "." && (ABBREVIATIONS[tl] || t.text.length === 1 || /^\.[ \t\u00A0]*[\p{Ll}\d]/u.test(text.slice(t.end)))) {
      return false; // abbreviation: "od l. 1830", "iz slo. besede"
    }
    return !(SMALL_NUMERALS[tl] || BIG_NUMERAL_RE.test(tl) || BIG_NUMERAL_DECLINED_RE.test(tl));
  }

  // Walk the noun phrase after tokens[i] (adjectives/numerals up to the noun) and return the
  // first word no reading of which satisfies `fits`. Conservative by design:
  //  - a pronoun or a possible noun ends the phrase ("do nje velika", "v vojni večina");
  //  - a mismatching pronoun is never flagged ("med njemu lastnimi");
  //  - a mismatching adjective is only flagged if a fitting noun follows it, otherwise it is
  //    probably predicative ("z njo srečen", "dvema podoben").
  function scanPhrase(text, tokens, i, fits) {
    for (var j = i + 1, steps = 0; j < tokens.length && steps < 4; j++, steps++) {
      if (!judgeable(text, tokens, j)) return null;
      var t = tokens[j];
      var v = judge(t.text, fits);
      if (v.verdict === "stop") return null;
      if (v.verdict === "ok") {
        if (v.isNoun || v.isPronoun) return null;
        continue;
      }
      if (v.isPronoun) return null;
      // Quantity before a number: "čez dobrih 6 let", "slabih 10 minut"
      var after = tokens[j + 1];
      if (after && after.isNumber && adjacent(text, t, after)) return null;
      var agree = null;
      if (!v.isNoun) {
        if (!judgeable(text, tokens, j + 1)) return null;
        var next = judge(tokens[j + 1].text, fits);
        if (next.verdict !== "ok" || !next.isNoun || next.isPronoun) return null;
        // The adjective should take the number/gender of the noun it modifies ("do drugih ljudi").
        agree = readings(tokens[j + 1].text).filter(fits);
      }
      return { token: t, index: j, readings: v.readings, agree: agree };
    }
    return null;
  }

  function issue(text, from, bad, suggestions, type) {
    var phrase = text.slice(from.start, bad.token.end);
    var prefix = text.slice(from.start, bad.token.start);
    return {
      word: phrase,
      suggestions: suggestions.map(function (s) {
        return prefix + s;
      }),
      isGrammar: true,
      grammarType: "oblika",
      rule: type,
      start: from.start,
      end: bad.token.end,
      flaggedStart: bad.token.start,
    };
  }

  function check(text) {
    var tokens = tokenize(text);
    var issues = [];
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (!t.isWord) continue;
      var lower = t.text.toLowerCase();
      var prev = tokens[i - 1];
      if (prev && (prev.isNumber || ((prev.text === "-" || prev.text === ".") && tokens[i - 2] && tokens[i - 2].isNumber))) continue;
      // Preposition governing an undeclined numeral, possibly with an adverb in between
      // ("v sto letih", "v skoraj dvesto letih").
      var prevPrep = null;
      for (var back = 1; back <= 2 && i - back >= 0; back++) {
        var pt = tokens[i - back];
        if (!pt.isWord || !adjacent(text, pt, tokens[i - back + 1])) break;
        prevPrep = PREPOSITIONS[pt.text.toLowerCase()] || null;
        if (prevPrep) break;
      }

      // 1 + 2: dva/dve/oba/obe, trije/tri/štirje/štiri and their declined forms
      var small = SMALL_NUMERALS[lower];
      if (small) {
        var number = small[0];
        var cases = small[1];
        var genders = small[2];
        var bad = scanPhrase(text, tokens, i, function (r) {
          var f = r.features;
          if (f.number !== number || cases.indexOf(f.case) === -1) return false;
          var g = f.gender || r.lex.gender;
          return !g || genders.indexOf(g) !== -1;
        });
        if (bad) {
          var sugg = suggestionsFor(
            bad.token.text,
            bad.readings,
            agreeing(bad, function (x, orig) {
              return x.number === number && cases.indexOf(x.case) !== -1 && sameExcept(["number", "case"])(x, orig);
            }),
            cases
          );
          var gendered = { dva: "dve", dve: "dva" }[lower];
          var genderOnly =
            gendered &&
            bad.readings.some(function (r) {
              return r.features.number === number && cases.indexOf(r.features.case) !== -1;
            });
          if (genderOnly) {
            // "dva mravlji" -> "dve mravlji": the noun is fine, the numeral has the wrong gender
            issues.push({
              word: text.slice(t.start, bad.token.end),
              suggestions: [recase(gendered, t.text) + text.slice(t.end, bad.token.end)],
              isGrammar: true,
              grammarType: "oblika",
              rule: "dvojina",
              start: t.start,
              end: bad.token.end,
              flaggedStart: t.start,
            });
          } else {
            issues.push(issue(text, t, bad, sugg, number === "dual" ? "dvojina" : "množina"));
          }
        }
        continue;
      }

      // 3: pet, šest … (genitive plural) and petih, petim, petimi (same case, plural)
      var bigCases = null;
      if (BIG_NUMERAL_RE.test(lower)) {
        bigCases = ["genitive"];
        // "v sto letih": an undeclined numeral after a preposition takes the preposition's case
        if (prevPrep) bigCases = bigCases.concat(prevPrep);
      } else {
        var dm = BIG_NUMERAL_DECLINED_RE.exec(lower);
        if (dm) bigCases = DECLINED_CASES[dm[2]];
      }
      if (bigCases) {
        var bad3 = scanPhrase(text, tokens, i, function (r) {
          return r.features.number === "plural" && bigCases.indexOf(r.features.case) !== -1;
        });
        if (bad3) {
          var sugg3 = suggestionsFor(
            bad3.token.text,
            bad3.readings,
            agreeing(bad3, function (x, orig) {
              return x.number === "plural" && bigCases.indexOf(x.case) !== -1 && sameExcept(["number", "case"])(x, orig);
            }),
            bigCases
          );
          issues.push(issue(text, t, bad3, sugg3, "števnik"));
        }
        continue;
      }

      // 4: preposition + case
      var prepCases = PREPOSITIONS[lower];
      if (prepCases) {
        var bad4 = scanPhrase(text, tokens, i, function (r) {
          return prepCases.indexOf(r.features.case) !== -1;
        });
        if (bad4) {
          var sugg4 = suggestionsFor(
            bad4.token.text,
            bad4.readings,
            agreeing(bad4, function (x, orig) {
              return prepCases.indexOf(x.case) !== -1 && sameExcept(["case", "number", "gender"])(x, orig);
            }),
            prepCases
          );
          issues.push(issue(text, t, bad4, sugg4, "sklon"));
        }
      }
    }
    return issues;
  }

  return { check: check };
}
