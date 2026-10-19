// The service worker has no DOM, so clipboard reads and writes happen here.
const buf = document.getElementById("buf");

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.target !== "offscreen") return;
  if (msg.type === "read") {
    buf.value = "";
    buf.focus();
    document.execCommand("paste");
    reply({ text: buf.value });
  } else if (msg.type === "write") {
    buf.value = msg.text;
    buf.select();
    reply({ ok: document.execCommand("copy") });
  }
});
