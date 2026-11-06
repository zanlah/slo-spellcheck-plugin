// Pronunciation helpers for the s/z and k/h rules. The choice of preposition depends on
// the first *sound* of the next word, which differs from its first letter for acronyms
// read letter by letter ("z SDS" — es-de-es) and for numbers ("s 5" — pet, "z 8" — osem).

// First sound of each letter name when an acronym is spelled out.
var LETTER_NAME_SOUND = {
  a: "a", b: "b", c: "c", č: "č", ć: "ć", d: "d", đ: "đ", e: "e", f: "e", g: "g",
  h: "h", i: "i", j: "j", k: "k", l: "e", m: "e", n: "e", o: "o", p: "p", q: "k",
  r: "e", s: "e", š: "e", t: "t", u: "u", v: "v", w: "d", x: "i", y: "i", z: "z", ž: "ž",
};

// First letter of the pronounced form of 0-9 (nič, ena, dva, tri, štiri, pet, šest, sedem, osem, devet).
var DIGIT_SOUND = ["n", "e", "d", "t", "š", "p", "š", "s", "o", "d"];
// 10-19: deset, enajst, dvanajst, trinajst, štirinajst, petnajst, šestnajst, sedemnajst, osemnajst, devetnajst
var TEEN_SOUND = ["d", "e", "d", "t", "š", "p", "š", "s", "o", "d"];

/** First letter of the Slovene pronunciation of a non-negative integer. */
function numberSound(n) {
  if (n >= 1000000) {
    var millions = Math.floor(n / 1000000);
    return millions === 1 ? "m" : numberSound(millions); // milijon / dva milijona
  }
  if (n >= 1000) {
    var thousands = Math.floor(n / 1000);
    return thousands === 1 ? "t" : numberSound(thousands); // tisoč / dva tisoč
  }
  if (n >= 100) {
    var hundreds = Math.floor(n / 100);
    return hundreds === 1 ? "s" : DIGIT_SOUND[hundreds]; // sto / dvesto, tristo …
  }
  if (n >= 20) {
    // Units are read first: 25 = petindvajset, 20 = dvajset
    return n % 10 ? DIGIT_SOUND[n % 10] : DIGIT_SOUND[Math.floor(n / 10)];
  }
  if (n >= 10) return TEEN_SOUND[n - 10];
  return DIGIT_SOUND[n];
}

var HAS_VOWEL = /[AEIOU]/;
var ALL_CAPS = /^\p{Lu}{2,}$/u;

/**
 * First sound (a lowercase letter) of the token following a preposition, or null when it
 * cannot be determined reliably (e.g. acronyms that may be read as a word or spelled out).
 * `token` is a run of letters or a number; `nextChar` is the character after it.
 */
export function firstSound(token, nextChar) {
  if (/^\d/.test(token)) {
    // "1." is an ordinal (prvi) and would be pronounced differently from 1 (ena).
    if (/^1$/.test(token) && nextChar === ".") return null;
    var digits = /^\d{1,3}(?:\.\d{3})+(?!\d)/.test(token)
      ? token.replace(/\./g, "").replace(/,.*$/, "")
      : token.replace(/[.,].*$/, "");
    var n = parseInt(digits, 10);
    return isNaN(n) ? null : numberSound(n);
  }
  if (ALL_CAPS.test(token)) {
    var first = token.charAt(0).toLowerCase();
    var spelled = LETTER_NAME_SOUND[first];
    if (!spelled) return null;
    // Without vowels it can only be spelled out (SDS, GZS); otherwise both readings must agree.
    if (!HAS_VOWEL.test(token)) return spelled;
    return spelled === first ? first : null;
  }
  return token.charAt(0).toLowerCase();
}

// Matches a lone s/z/k/h preposition followed by the next word or number.
export function prepositionRegex(letters) {
  return new RegExp(
    "(?<![\\p{L}\\p{N}.'\\u2019-])([" + letters + "])[ \\t\\u00A0]+(\\p{L}+|\\d[\\d.,]*\\d|\\d)",
    "giu"
  );
}
