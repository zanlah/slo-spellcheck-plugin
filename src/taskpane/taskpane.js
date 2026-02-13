/* global Office */

let nspellInstance = null;

async function loadSpellChecker() {
  if (nspellInstance) return nspellInstance;
  const NSpell = (await import("nspell")).default;
  const path = window.location.pathname.replace(/\/[^/]*$/, "");
  const base = window.location.origin + path + (path.endsWith("/") ? "" : "/") + "dict/";
  const affRes = await fetch(base + "index.aff");
  const dicRes = await fetch(base + "index.dic");
  if (!affRes.ok || !dicRes.ok) throw new Error("Dictionary files not found");
  const aff = await affRes.text();
  const dic = await dicRes.text();
  nspellInstance = NSpell(aff, dic);
  return nspellInstance;
}

function tokenize(text) {
  const words = [];
  // Include Slovenian chars: č, š, ž, ć, đ (and apostrophe for contractions)
  const re = /[a-zA-ZčćđžšČĆĐŽŠ']+/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    words.push({ word: m[0], index: m.index });
  }
  return words;
}

function getDocumentText() {
  return Word.run(function (context) {
    const body = context.document.body;
    body.load("text");
    return context.sync().then(function () {
      return body.text;
    });
  });
}

function replaceInDocument(word, replacement) {
  return Word.run(function (context) {
    const searchResults = context.document.body.search(word, {
      matchCase: true,
      matchWholeWord: true,
    });
    searchResults.load("items");
    return context.sync().then(function () {
      if (searchResults.items.length === 0) return;
      var replaced = searchResults.items[0].insertText(replacement, "Replace");
      replaced.select();
      return context.sync();
    });
  });
}

function scrollToWord(word) {
  return Word.run(function (context) {
    var results = context.document.body.search(word, {
      matchCase: true,
      matchWholeWord: true,
    });
    results.load("items");
    return context.sync().then(function () {
      if (results.items.length > 0) {
        results.items[0].select();
        return context.sync();
      }
    });
  });
}

function setStatus(msg, isError) {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className = "status" + (isError ? " error" : "");
}

function showResults(issues) {
  const container = document.getElementById("results");
  container.innerHTML = "";
  if (issues.length === 0) {
    const p = document.createElement("p");
    p.className = "no-issues";
    p.textContent = "Ni pravopisnih napak.";
    container.appendChild(p);
    return;
  }
  issues.forEach(function (item) {
    const div = document.createElement("div");
    div.className = "result-item";
    div.innerHTML =
      '<span class="word">' +
      escapeHtml(item.word) +
      '</span><button class="show-btn" type="button">Prikaži</button>' +
      '<div class="suggestions"></div>';
    div.querySelector(".show-btn").addEventListener("click", function () {
      scrollToWord(item.word);
    });
    const suggestionsEl = div.querySelector(".suggestions");
    var sugs = (item.suggestions || []).slice(0, 6);
    if (sugs.length === 0) {
      var noSug = document.createElement("span");
      noSug.className = "no-suggestions";
      noSug.textContent = "Ni predlogov";
      suggestionsEl.appendChild(noSug);
    }
    sugs.forEach(function (sug) {
      const btn = document.createElement("button");
      btn.textContent = sug;
      btn.type = "button";
      btn.addEventListener("click", function () {
        replaceInDocument(item.word, sug)
          .then(function () {
            setStatus('Zamenjano "' + item.word + '" z "' + sug + '".');
            runSpellCheck();
          })
          .catch(function (err) {
            setStatus("Zamenjava ni uspela: " + err.message, true);
          });
      });
      suggestionsEl.appendChild(btn);
    });
    container.appendChild(div);
  });
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

async function runSpellCheck() {
  const btn = document.getElementById("run-check");
  btn.disabled = true;
  setStatus("Nalaganje slovarja…");

  try {
    const spell = await loadSpellChecker();
    setStatus("Branje dokumenta…");
    const text = await getDocumentText();
    const words = tokenize(text);
    const seen = new Set();
    const issues = [];

    setStatus("Preverjanje črkovanja…");
    for (let i = 0; i < words.length; i++) {
      const { word } = words[i];
      const key = word.toLowerCase();
      if (seen.has(key)) continue;
      if (word.length < 2) continue;
      if (!spell.correct(word)) {
        seen.add(key);
        const suggestions = spell.suggest(word);
        issues.push({ word, suggestions });
      }
    }

    setStatus(issues.length ? "Najdenih " + issues.length + " možnih napak." : "");
    showResults(issues);
  } catch (err) {
    setStatus("Napaka: " + (err.message || String(err)), true);
    document.getElementById("results").innerHTML = "";
  } finally {
    btn.disabled = false;
  }
}

Office.onReady(function (info) {
  if (info.host === Office.HostType.Word) {
    document.getElementById("run-check").addEventListener("click", runSpellCheck);
  }
});
