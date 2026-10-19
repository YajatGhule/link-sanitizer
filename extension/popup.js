const $ = (id) => document.getElementById(id);
const DEFAULTS = { autoClean: true, strict: false };
let settings = { ...DEFAULTS };
let clipText = "";
let tabUrl = "";

const opts = () => ({ strict: settings.strict });

function renderDiff(el, before, after, emptyMsg) {
  el.replaceChildren();
  const div = (cls, text) => Object.assign(document.createElement("div"), { className: cls, textContent: text });
  if (!before) return el.append(div("empty", emptyMsg));
  if (before === after) return el.append(div("same", after + "\n✓ already clean"));
  el.append(div("old", before), div("new", after));
}

async function readClipboard() {
  try { clipText = await navigator.clipboard.readText(); } catch { clipText = ""; }
  render();
}

function render() {
  const cleanedClip = LinkClean.cleanText(clipText, opts());
  renderDiff($("clipDiff"), clipText.slice(0, 2000), cleanedClip.slice(0, 2000), "Clipboard is empty or not text");
  $("cleanClip").disabled = !clipText || cleanedClip === clipText;
  $("cleanClip").textContent = clipText && cleanedClip === clipText ? "Clipboard is clean" : "Clean clipboard";

  const isWeb = /^https?:/.test(tabUrl);
  renderDiff($("tabDiff"), isWeb ? tabUrl : "", isWeb ? LinkClean.clean(tabUrl, opts()) : "", "Not a web page");
  $("copyTab").disabled = !isWeb;

  const input = $("input").value;
  $("inputDiff").hidden = $("copyInput").hidden = !input.trim();
  if (input.trim()) renderDiff($("inputDiff"), input, LinkClean.cleanText(input, opts()), "");

  $("autoClean").checked = settings.autoClean;
  $("strict").checked = settings.strict;
  $("status").textContent = settings.autoClean
    ? "Auto-clean on copy is on" : "Auto-clean is off; use the buttons or shortcut";
}

async function copy(text, btn, label) {
  await navigator.clipboard.writeText(text);
  btn.textContent = "Copied ✓";
  setTimeout(() => { btn.textContent = label; readClipboard(); }, 900);
}

$("cleanClip").onclick = () => copy(LinkClean.cleanText(clipText, opts()), $("cleanClip"), "Clean clipboard");
$("copyTab").onclick = () => copy(LinkClean.clean(tabUrl, opts()), $("copyTab"), "Copy clean URL");
$("input").oninput = render;
$("copyInput").onclick = () => copy(LinkClean.cleanText($("input").value, opts()), $("copyInput"), "Copy cleaned text");
for (const key of ["autoClean", "strict"]) {
  $(key).onchange = (e) => {
    settings[key] = e.target.checked;
    chrome.storage.sync.set({ [key]: settings[key] });
    render();
  };
}

chrome.commands.getAll((cmds) => {
  const c = cmds.find((c) => c.name === "clean-clipboard");
  $("shortcut").textContent = c?.shortcut || "not set";
});

(async () => {
  settings = await chrome.storage.sync.get(DEFAULTS);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabUrl = tab?.url || "";
  await readClipboard();
})();
