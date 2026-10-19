// Isolated world: cleans Ctrl+C copies and answers the page-world clipboard hook.
(() => {
  const LC = globalThis.LinkClean;
  let settings = { autoClean: true, strict: false };

  chrome.storage.sync.get(settings, (s) => (settings = s));
  chrome.storage.onChanged.addListener((changes) => {
    for (const [k, { newValue }] of Object.entries(changes)) settings[k] = newValue;
  });

  // Requests from content-main.js, which hooks navigator.clipboard in the page.
  const root = document.documentElement;
  root.addEventListener("linkclean:clean", (e) => {
    if (!settings.autoClean || typeof e.detail !== "string") return;
    root.setAttribute("data-linkclean-out", LC.cleanText(e.detail, { strict: settings.strict }));
  });

  function selectedText() {
    const el = document.activeElement;
    if (el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && /^(text|url|search)$/i.test(el.type)))) {
      try { return { text: el.value.slice(el.selectionStart, el.selectionEnd), range: null }; } catch {}
    }
    const sel = getSelection();
    return { text: sel ? sel.toString() : "", range: sel && sel.rangeCount ? sel.getRangeAt(0) : null };
  }

  // Rebuild the selection's HTML with every link and URL cleaned.
  function cleanedHtml(range, opts) {
    const div = document.createElement("div");
    div.appendChild(range.cloneContents());
    for (const a of div.querySelectorAll("a[href]")) a.setAttribute("href", LC.clean(a.href, opts));
    const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode()); ) n.nodeValue = LC.cleanText(n.nodeValue, opts);
    return div.innerHTML;
  }

  // Bubble phase on window, so a page's own copy handler has already run.
  window.addEventListener("copy", (e) => {
    if (!settings.autoClean || !e.clipboardData) return;
    const opts = { strict: settings.strict };
    const dt = e.clipboardData;
    if (e.defaultPrevented) {
      // The page set the clipboard itself (a "copy link" button); clean what it set.
      const text = dt.getData("text/plain");
      const cleaned = text && LC.cleanText(text, opts);
      if (cleaned && cleaned !== text) dt.setData("text/plain", cleaned);
      return;
    }
    const { text, range } = selectedText();
    const cleaned = LC.cleanText(text, opts);
    if (!text || cleaned === text) return;
    dt.setData("text/plain", cleaned);
    if (range) dt.setData("text/html", cleanedHtml(range, opts));
    e.preventDefault();
  });
})();
