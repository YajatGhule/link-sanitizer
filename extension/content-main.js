// Page world: sites' "Copy link" / "Share" buttons call navigator.clipboard
// directly, which no copy event sees. Wrap those calls so content.js (which
// owns the cleaner and the settings) can clean the text first.
(() => {
  const clip = navigator.clipboard;
  if (!clip) return;
  const root = document.documentElement;

  // dispatchEvent is synchronous, so content.js has answered when it returns.
  const fix = (text) => {
    if (typeof text !== "string") return text;
    root.dispatchEvent(new CustomEvent("linkclean:clean", { detail: text }));
    const out = root.getAttribute("data-linkclean-out");
    root.removeAttribute("data-linkclean-out");
    return out ?? text;
  };

  const proto = Object.getPrototypeOf(clip);
  const writeText = proto.writeText;
  const write = proto.write;

  proto.writeText = function (text) {
    return writeText.call(this, fix(text));
  };

  if (write && typeof ClipboardItem !== "undefined") {
    proto.write = function (items) {
      const cleaned = Array.from(items || [], (item) => {
        if (!item.types.includes("text/plain")) return item;
        const parts = {};
        for (const type of item.types) {
          parts[type] = type === "text/plain"
            ? item.getType(type).then((b) => b.text()).then((t) => new Blob([fix(t)], { type }))
            : item.getType(type);
        }
        return new ClipboardItem(parts);
      });
      // Called synchronously so the click's user activation still counts.
      return write.call(this, cleaned);
    };
  }
})();
