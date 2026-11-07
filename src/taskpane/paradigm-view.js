// Renders Sloleks paradigms (from morph.entries) as declension / conjugation tables.

const CASES = [
  ["nominative", "imenovalnik", "kdo, kaj"],
  ["genitive", "rodilnik", "koga, česa"],
  ["dative", "dajalnik", "komu, čemu"],
  ["accusative", "tožilnik", "koga, kaj"],
  ["locative", "mestnik", "pri kom, pri čem"],
  ["instrumental", "orodnik", "s kom, s čim"],
];
const NUMBERS = [
  ["singular", "ednina"],
  ["dual", "dvojina"],
  ["plural", "množina"],
];
const PERSONS = [
  ["first", "1. oseba"],
  ["second", "2. oseba"],
  ["third", "3. oseba"],
];
const GENDERS = [
  ["masculine", "moški spol"],
  ["feminine", "ženski spol"],
  ["neuter", "srednji spol"],
];
const DEGREES = [
  ["positive", "osnovnik"],
  ["comparative", "primernik"],
  ["superlative", "presežnik"],
];
const VFORMS = [
  ["infinitive", "nedoločnik"],
  ["supine", "namenilnik"],
  ["present", "sedanjik"],
  ["future", "prihodnjik"],
  ["imperative", "velelnik"],
  ["conditional", "pogojnik"],
  ["participle", "deležnik na -l"],
];
const CATEGORY = {
  noun: "samostalnik",
  adjective: "pridevnik",
  verb: "glagol",
  pronoun: "zaimek",
  numeral: "števnik",
  adverb: "prislov",
  preposition: "predlog",
  conjunction: "veznik",
  particle: "členek",
  interjection: "medmet",
  abbreviation: "okrajšava",
};
const LEX_LABELS = {
  gender: { masculine: "moškega spola", feminine: "ženskega spola", neuter: "srednjega spola" },
  aspect: { perfective: "dovršni", progressive: "nedovršni", biaspectual: "dvovidski" },
  type: {
    proper: "lastno ime",
    possessive: "svojilni",
    participle: "deležniški",
    cardinal: "glavni",
    ordinal: "vrstilni",
    personal: "osebni",
    reflexive: "povratni",
    demonstrative: "kazalni",
    interrogative: "vprašalni",
    relative: "oziralni",
    indefinite: "nedoločni",
  },
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function describe(entry) {
  const lex = entry.lex;
  const parts = [CATEGORY[lex.category] || lex.category];
  for (const key of ["type", "gender", "aspect"]) {
    const label = LEX_LABELS[key][lex[key]];
    if (label) parts.push(label);
  }
  return parts.join(", ");
}

/** Joins the distinct forms matching `pred` with " / " (e.g. animate/inanimate accusative). */
function cell(forms, pred) {
  const out = [];
  for (const f of forms) if (pred(f.features) && out.indexOf(f.form) === -1) out.push(f.form);
  return out.join(" / ");
}

// Table with `rows` × `cols`, each cell holding forms matching both features.
function grid(forms, rowKey, rows, colKey, cols, extra) {
  const usedRows = rows.filter(([v]) => forms.some((f) => f.features[rowKey] === v));
  const usedCols = cols.filter(([v]) => forms.some((f) => f.features[colKey] === v));
  if (usedRows.length === 0 || usedCols.length === 0) return null;
  const table = el("table", "paradigm-table");
  const head = el("tr");
  head.appendChild(el("th"));
  usedCols.forEach(([, label]) => head.appendChild(el("th", null, label)));
  table.appendChild(head);
  usedRows.forEach(([rv, label, hint]) => {
    const tr = el("tr");
    const th = el("th", "row-label", label);
    if (hint) th.title = hint;
    tr.appendChild(th);
    usedCols.forEach(([cv]) => {
      tr.appendChild(el("td", null, cell(forms, (x) => x[rowKey] === rv && x[colKey] === cv && (!extra || extra(x)))));
    });
    table.appendChild(tr);
  });
  return table;
}

function section(title, content, open) {
  const details = el("details", "paradigm-section");
  if (open) details.open = true;
  details.appendChild(el("summary", null, title));
  details.appendChild(content);
  return details;
}

function group(nodes) {
  const div = el("div");
  nodes.filter(Boolean).forEach((n) => div.appendChild(n));
  return div;
}

function renderCaseTables(forms) {
  // Gender tables only when gender is inflectional (adjectives, "on/ona/ono"), not when just a
  // few forms carry it (personal pronouns: "midva/medve").
  const cased = forms.filter((f) => f.features.case);
  const hasGender = cased.filter((f) => f.features.gender).length >= cased.length * 0.9;
  const hasDegree = forms.some((f) => f.features.degree);
  if (!hasGender) {
    return grid(forms, "case", CASES, "number", NUMBERS);
  }
  const byDegree = hasDegree ? DEGREES.filter(([d]) => forms.some((f) => f.features.degree === d)) : [[null, null]];
  const out = el("div");
  byDegree.forEach(([degree, degreeLabel], di) => {
    const inDegree = forms.filter((f) => !degree || f.features.degree === degree);
    const tables = NUMBERS.map(([num, numLabel]) => {
      const t = grid(inDegree.filter((f) => f.features.number === num), "case", CASES, "gender", GENDERS);
      return t && section(numLabel, t, num === "singular");
    });
    const content = group(tables);
    out.appendChild(degreeLabel && byDegree.length > 1 ? section(degreeLabel, content, di === 0) : content);
  });
  return out;
}

function renderVerb(forms) {
  const out = el("div");
  const single = [];
  VFORMS.forEach(([vform, label]) => {
    const inForm = forms.filter((f) => f.features.vform === vform);
    if (inForm.length === 0) return;
    if (vform === "infinitive" || vform === "supine") {
      single.push([label, cell(inForm, () => true)]);
      return;
    }
    const negatives = [false, true].filter((neg) => inForm.some((f) => (f.features.negative === "yes") === neg));
    negatives.forEach((neg) => {
      const sub = inForm.filter((f) => (f.features.negative === "yes") === neg);
      const t = sub.some((f) => f.features.person)
        ? grid(sub, "person", PERSONS, "number", NUMBERS)
        : grid(sub, "gender", GENDERS, "number", NUMBERS);
      if (t) out.appendChild(section(label + (neg ? " (nikalni)" : ""), t, vform === "present" && !neg));
    });
  });
  if (single.length) {
    const dl = el("dl", "paradigm-basic");
    single.forEach(([label, value]) => {
      dl.appendChild(el("dt", null, label));
      dl.appendChild(el("dd", null, value));
    });
    out.insertBefore(dl, out.firstChild);
  }
  return out;
}

function renderEntry(entry) {
  const card = el("div", "paradigm-entry");
  const head = el("div", "paradigm-head");
  head.appendChild(el("span", "paradigm-lemma", entry.lemma));
  head.appendChild(el("span", "paradigm-pos", describe(entry)));
  card.appendChild(head);

  const forms = entry.forms;
  let body;
  if (entry.lex.category === "verb") body = renderVerb(forms);
  else if (forms.some((f) => f.features.case)) body = renderCaseTables(forms);
  else if (forms.some((f) => f.features.degree) && forms.length > 1) body = renderDegreeList(forms);
  if (!body) body = el("p", "paradigm-note", "Nepregibna beseda.");
  card.appendChild(body);
  return card;
}

// Adverbs: osnovnik / primernik / presežnik in one line.
function renderDegreeList(forms) {
  const dl = el("dl", "paradigm-basic");
  DEGREES.forEach(([d, label]) => {
    const v = cell(forms, (x) => x.degree === d);
    if (!v) return;
    dl.appendChild(el("dt", null, label));
    dl.appendChild(el("dd", null, v));
  });
  return dl;
}

/** Fills `container` with tables for the given entries (first one expanded). */
export function renderParadigms(container, entries, query) {
  container.innerHTML = "";
  if (entries.length === 0) {
    container.appendChild(el("p", "no-issues", "Besede »" + query + "« ni v Sloleksu."));
    return;
  }
  entries.slice(0, 8).forEach((entry, i) => {
    const card = renderEntry(entry);
    if (i === 0) {
      container.appendChild(card);
    } else {
      const wrap = section(entry.lemma + " – " + describe(entry), card, false);
      wrap.classList.add("paradigm-more");
      container.appendChild(wrap);
    }
  });
}
