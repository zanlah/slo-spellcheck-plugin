/* global Office */

import { checkSZ } from "./checkers/predlogi-sz";
import { checkKH } from "./checkers/predlogi-kh";
import { checkCommas } from "./checkers/vejice";
import { checkPunctuation } from "./checkers/locila";
import { createSpeller } from "./speller";

let spellerPromise = null;

// Word list: Sloleks 3.1 + LibreOffice Hunspell sl_SI, built by scripts/build-dictionary.mjs.
function loadSpellChecker() {
  if (!spellerPromise) {
    spellerPromise = createSpellerFromServer().catch(function (err) {
      spellerPromise = null;
      throw err;
    });
  }
  return spellerPromise;
}

async function createSpellerFromServer() {
  const path = window.location.pathname.replace(/\/[^/]*$/, "");
  const base = window.location.origin + path + (path.endsWith("/") ? "" : "/") + "dict/";
  const res = await fetch(base + "sl.dawg");
  if (!res.ok) throw new Error("Slovar ni na voljo (" + res.status + ")");
  const speller = createSpeller(await res.arrayBuffer());

  // Static supplemental word list (one word per line)
  try {
    const customRes = await fetch(base + "custom.dic");
    if (customRes.ok) {
      (await customRes.text()).split(/\r?\n/).forEach(function (line) {
        const w = line.trim();
        if (w && !w.startsWith("#")) speller.add(w);
      });
    }
  } catch (e) {
    // custom.dic is optional — ignore errors
  }

  getUserDictWords().forEach(function (w) {
    speller.add(w);
  });
  return speller;
}

function tokenize(text) {
  const words = [];
  // Letters of any alphabet (č, š, ž, ć, đ, é, ü …), optionally joined by an apostrophe or
  // hyphen ("e-pošta", "O'Brien"). Leading/trailing quotes and hyphens are not part of a word.
  const re = /\p{L}+(?:['\u2019-]\p{L}+)*/gu;
  let m;
  while ((m = re.exec(text)) !== null) {
    words.push({ word: m[0], index: m.index });
  }
  return words;
}

// Replace URLs, e-mail addresses and file names with a neutral placeholder so they are not
// spell/grammar checked. The placeholder is not a letter or punctuation, so it can't create
// new matches such as "na ." for the punctuation rules.
function maskNonProse(text) {
  return text
    .replace(/https?:\/\/[^\s]+/gi, " \u00A4 ")
    .replace(/www\.[^\s]+/gi, " \u00A4 ")
    .replace(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu, " \u00A4 ")
    .replace(/[\p{L}\p{N}_-]+\.(?:docx?|xlsx?|pptx?|pdf|txt|csv|rtf|odt|ods|jpe?g|png|gif|svg|zip|html?|xml|json)\b/giu, " \u00A4 ");
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
    var extraClass = "";
    if (item.grammarType === "predlog") extraClass = " grammar-item";
    else if (item.grammarType === "vejica") extraClass = " grammar-item comma-item";
    else if (item.grammarType === "ločilo") extraClass = " grammar-item punct-item";
    div.className = "result-item" + extraClass;

    var label = "";
    if (item.grammarType === "predlog") {
      label = '<span class="grammar-label">predlog</span>';
    } else if (item.grammarType === "vejica") {
      label = '<span class="grammar-label comma-label">vejica</span>';
    } else if (item.grammarType === "ločilo") {
      label = '<span class="grammar-label punct-label">ločilo</span>';
    }
    var dictBtnHtml = item.isGrammar
      ? ""
      : '<button class="dict-btn" type="button">V slovar</button>';
    div.innerHTML =
      label +
      '<span class="word">' +
      escapeHtml(item.word) +
      '</span><button class="show-btn" type="button">Prikaži</button>' +
      dictBtnHtml +
      '<div class="suggestions"></div>';
    div.querySelector(".show-btn").addEventListener("click", function () {
      if (item.isGrammar) {
        scrollToPhrase(item.word);
      } else {
        scrollToWord(item.word);
      }
    });
    var dictBtn = div.querySelector(".dict-btn");
    if (dictBtn) {
      dictBtn.addEventListener("click", function () {
        addToUserDict(item.word);
      });
    }
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
        var doReplace = item.isGrammar
          ? replacePhrase(item.word, sug)
          : replaceInDocument(item.word, sug);
        doReplace
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

// --- Replace a phrase (multi-word) in the document ---

function replacePhrase(phrase, replacement) {
  return Word.run(function (context) {
    var searchResults = context.document.body.search(phrase, {
      matchCase: true,
      matchWholeWord: false,
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

function scrollToPhrase(phrase) {
  return Word.run(function (context) {
    var results = context.document.body.search(phrase, {
      matchCase: true,
      matchWholeWord: false,
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

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function getUserDictWords() {
  try {
    return JSON.parse(localStorage.getItem("userDict") || "[]");
  } catch (e) {
    return [];
  }
}

function addToUserDict(word) {
  var userWords = getUserDictWords();
  if (userWords.indexOf(word) === -1) {
    userWords.push(word);
    localStorage.setItem("userDict", JSON.stringify(userWords));
  }
  if (spellerPromise) {
    spellerPromise.then(function (speller) {
      speller.add(word);
    });
  }
  runSpellCheck();
}

function removeFromUserDict(word) {
  var userWords = getUserDictWords();
  var idx = userWords.indexOf(word);
  if (idx !== -1) {
    userWords.splice(idx, 1);
    localStorage.setItem("userDict", JSON.stringify(userWords));
  }
  if (spellerPromise) {
    spellerPromise.then(function (speller) {
      speller.remove(word);
    });
  }
  renderUserDictList();
}

function renderUserDictList() {
  var container = document.getElementById("user-dict-list");
  if (!container) return;
  container.innerHTML = "";
  var words = getUserDictWords();
  if (words.length === 0) {
    var empty = document.createElement("p");
    empty.className = "user-dict-empty";
    empty.textContent = "Slovar je prazen.";
    container.appendChild(empty);
    return;
  }
  words.slice().sort(function (a, b) {
    return a.localeCompare(b, "sl");
  }).forEach(function (word) {
    var item = document.createElement("div");
    item.className = "user-dict-item";
    var span = document.createElement("span");
    span.textContent = word;
    var btn = document.createElement("button");
    btn.className = "remove-word-btn";
    btn.type = "button";
    btn.textContent = "Odstrani";
    btn.addEventListener("click", function () {
      removeFromUserDict(word);
    });
    item.appendChild(span);
    item.appendChild(btn);
    container.appendChild(item);
  });
}

function switchTab(tabId) {
  var panels = document.querySelectorAll(".tab-panel");
  var buttons = document.querySelectorAll(".tab-btn");
  panels.forEach(function (p) { p.style.display = "none"; });
  buttons.forEach(function (b) { b.classList.remove("active"); });
  document.getElementById(tabId).style.display = "";
  document.querySelector('[data-tab="' + tabId + '"]').classList.add("active");
  if (tabId === "tab-dict") renderUserDictList();
}

function toggleSettings() {
  var mainView = document.getElementById("main-view");
  var settingsView = document.getElementById("settings-view");
  var settingsBtn = document.getElementById("settings-btn");
  var isSettings = settingsView.style.display !== "none";
  if (isSettings) {
    settingsView.style.display = "none";
    mainView.style.display = "";
    settingsBtn.classList.remove("active");
  } else {
    mainView.style.display = "none";
    settingsView.style.display = "";
    settingsBtn.classList.add("active");
    switchTab("tab-dict");
  }
}

async function runSpellCheck() {
  const btn = document.getElementById("run-check");
  btn.disabled = true;
  setStatus("Nalaganje slovarja…");

  try {
    const spell = await loadSpellChecker();
    setStatus("Branje dokumenta…");
    const rawText = await getDocumentText();
    const text = maskNonProse(rawText);
    const words = tokenize(text);
    const seen = new Set();
    const issues = [];

    setStatus("Preverjanje črkovanja…");
    for (let i = 0; i < words.length; i++) {
      const { word } = words[i];
      // Exact-case key: "Pariz" is fine but "pariz" is not. Replacement is case-sensitive too.
      if (word.length < 2 || seen.has(word)) continue;
      seen.add(word);
      const suggestions = spell.check(word);
      if (suggestions) {
        issues.push({ word, suggestions });
      }
    }

    // Check s/z and k/h preposition grammar
    var szIssues = checkSZ(text);
    var khIssues = checkKH(text);
    // Check comma placement (disabled for now)
    // var commaIssues = checkCommas(text);
    // Check punctuation spacing (ločila in presledki)
    var punctIssues = checkPunctuation(text);
    var grammarIssues = szIssues.concat(khIssues, punctIssues);
    var allIssues = grammarIssues.concat(issues);

    var spellCount = issues.length;
    var grammarCount = grammarIssues.length;
    var parts = [];
    if (grammarCount) parts.push(grammarCount + " slovničn" + (grammarCount === 1 ? "a" : grammarCount === 2 ? "i" : "e") + " napak" + (grammarCount === 1 ? "a" : grammarCount === 2 ? "i" : ""));
    if (spellCount) parts.push(spellCount + " pravopisn" + (spellCount === 1 ? "a" : spellCount === 2 ? "i" : "e") + " napak" + (spellCount === 1 ? "a" : spellCount === 2 ? "i" : ""));
    setStatus(parts.length ? "Najdenih " + parts.join(" in ") + "." : "");
    showResults(allIssues);
  } catch (err) {
    setStatus("Napaka: " + (err.message || String(err)), true);
    document.getElementById("results").innerHTML = "";
  } finally {
    btn.disabled = false;
  }
}

function getSelectedText() {
  return Word.run(function (context) {
    var selection = context.document.getSelection();
    selection.load("text");
    return context.sync().then(function () {
      return selection.text;
    });
  });
}

function readAloud() {
  var btn = document.getElementById("read-aloud");

  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    btn.textContent = "Preberi na glas";
    setStatus("");
    return;
  }

  btn.disabled = true;

  getSelectedText()
    .then(function (text) {
      text = (text || "").trim();
      if (!text) {
        setStatus("Najprej označi besedilo v dokumentu.", true);
        btn.disabled = false;
        return;
      }

      var voices = window.speechSynthesis.getVoices();
      var slVoice = voices.find(function (v) {
        return v.lang && v.lang.toLowerCase().startsWith("sl");
      });

      if (!slVoice) {
        setStatus("Slovenski glas ni na voljo v tem brskalniku.", true);
        btn.disabled = false;
        return;
      }

      var utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = slVoice;
      utterance.lang = "sl-SI";
      utterance.onend = function () {
        btn.textContent = "Preberi na glas";
        btn.disabled = false;
      };
      utterance.onerror = function () {
        setStatus("Napaka pri predvajanju govora.", true);
        btn.textContent = "Preberi na glas";
        btn.disabled = false;
      };
      setStatus("Predvajanje…");
      btn.textContent = "Ustavi branje";
      btn.disabled = false;
      window.speechSynthesis.speak(utterance);
    })
    .catch(function (err) {
      setStatus("Napaka: " + (err.message || String(err)), true);
      btn.disabled = false;
    });
}

Office.onReady(function (info) {
  if (info.host === Office.HostType.Word) {
    document.getElementById("run-check").addEventListener("click", runSpellCheck);
    document.getElementById("read-aloud").addEventListener("click", readAloud);
    document.getElementById("settings-btn").addEventListener("click", toggleSettings);
    document.querySelectorAll(".tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        switchTab(btn.getAttribute("data-tab"));
      });
    });

    // Pre-load voices (some browsers need this)
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = function () {
        window.speechSynthesis.getVoices();
      };
    }
  }
});
