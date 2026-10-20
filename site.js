const $ = (id) => document.getElementById(id);
const input = $("input");
const output = $("output");
const removed = $("removed");
const URL_RE = /https?:\/\/[^\s<>"'`\])}]+/gi;

const opts = () => ({ strict: $("strict").checked });
const trimPunct = (url) => url.replace(/[.,;:!?]+$/, "");
const hostOf = (url) => (/^[a-z]+:\/\/([^/?#:]+)/i.exec(url) || [])[1] || "";

function queryKeys(url) {
  const q = /\?([^#]*)/.exec(url);
  if (!q) return [];
  return q[1].split("&").filter(Boolean).map((p) => {
    try { return decodeURIComponent(p.split("=")[0].replace(/\+/g, " ")); } catch { return p; }
  });
}

// Describe, per link, what the cleaner threw away.
function explain(text) {
  const chips = [];
  for (const raw of text.match(URL_RE) || []) {
    const url = trimPunct(raw);
    const unwrapped = LinkClean.unwrap(url);
    const cleaned = LinkClean.clean(url, opts());
    if (unwrapped !== url) chips.push(["note", `unwrapped ${hostOf(url)} redirect`]);
    const kept = new Set(queryKeys(cleaned));
    for (const k of queryKeys(unwrapped)) if (!kept.has(k)) chips.push(["param", k]);
    const frag = /#(.*)$/.exec(unwrapped);
    if (frag && !cleaned.includes("#")) chips.push(["param", "#" + frag[1].slice(0, 24)]);
    if (chips.length === 0 && cleaned !== unwrapped) chips.push(["note", "shortened to canonical form"]);
  }
  return chips;
}

function render() {
  const text = input.value.trim();
  const cleaned = text ? LinkClean.cleanText(text, opts()) : "";
  output.textContent = cleaned;
  $("copy").disabled = !cleaned;
  removed.replaceChildren();
  const saved = text.length - cleaned.length;
  $("stat").textContent = cleaned && saved > 0 ? `${saved} characters removed` : "";
  if (cleaned) {
    const chips = explain(text);
    if (!chips.length) chips.push(["note", text.match(URL_RE) ? "Already clean ✓" : "No links found"]);
    for (const [kind, label] of chips) {
      const li = document.createElement("li");
      if (kind === "note") { li.className = "note"; li.textContent = label; }
      else li.append(Object.assign(document.createElement("s"), { textContent: label }));
      removed.append(li);
    }
  }
}

function flash(btn, msg) {
  const label = btn.dataset.label || (btn.dataset.label = btn.textContent);
  btn.textContent = msg;
  clearTimeout(btn._t);
  btn._t = setTimeout(() => (btn.textContent = label), 1400);
}

$("copy").onclick = async () => {
  try { await navigator.clipboard.writeText(output.textContent); flash($("copy"), "Copied ✓"); }
  catch { flash($("copy"), "Copy failed"); }
};

// One click: read the clipboard, clean it and put the clean version back.
$("paste").onclick = async () => {
  try {
    input.value = await navigator.clipboard.readText();
    render();
    if (output.textContent) await navigator.clipboard.writeText(output.textContent);
    flash($("paste"), "Cleaned & copied ✓");
  } catch {
    flash($("paste"), "Clipboard blocked, paste with Ctrl+V");
  }
};

$("clear").onclick = () => { input.value = ""; render(); input.focus(); };
$("strict").onchange = render;
input.addEventListener("input", render);
for (const b of document.querySelectorAll("[data-ex]")) b.onclick = () => { input.value = b.dataset.ex; render(); };

// Cmd/Ctrl+Enter copies the result without reaching for the mouse.
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && output.textContent) $("copy").click();
});

// Shared links: index.html?url=<link> pre-fills the box.
const shared = new URLSearchParams(location.search).get("url");
if (shared) input.value = shared;

render();
