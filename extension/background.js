importScripts("linkclean.js");

const DEFAULTS = { autoClean: true, strict: false };
const getSettings = () => chrome.storage.sync.get(DEFAULTS);

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "copy-link", title: "Copy clean link", contexts: ["link"] });
    chrome.contextMenus.create({ id: "copy-page", title: "Copy clean page URL", contexts: ["page", "frame"] });
    chrome.contextMenus.create({ id: "copy-media", title: "Copy clean media URL", contexts: ["image", "video", "audio"] });
    chrome.contextMenus.create({ id: "clean-clipboard", title: "Clean clipboard links", contexts: ["action"] });
  });
});

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["CLIPBOARD"],
    justification: "Read and write the clipboard to clean links",
  });
}

async function offscreen(msg) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ target: "offscreen", ...msg });
}

function flash(ok, tabId) {
  const opts = tabId ? { tabId } : {};
  chrome.action.setBadgeBackgroundColor({ color: ok ? "#1f8a70" : "#b42318", ...opts });
  chrome.action.setBadgeText({ text: ok ? "✓" : "–", ...opts });
  setTimeout(() => chrome.action.setBadgeText({ text: "", ...opts }), 1500);
}

async function copyClean(url, tabId) {
  const { strict } = await getSettings();
  const res = await offscreen({ type: "write", text: LinkClean.clean(url, { strict }) });
  flash(res?.ok, tabId);
}

async function cleanClipboard(tabId) {
  const { strict } = await getSettings();
  const { text } = (await offscreen({ type: "read" })) || {};
  if (!text) return flash(false, tabId);
  const cleaned = LinkClean.cleanText(text, { strict });
  if (cleaned !== text) await offscreen({ type: "write", text: cleaned });
  flash(true, tabId);
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const tabId = tab?.id;
  if (info.menuItemId === "copy-link") copyClean(info.linkUrl, tabId);
  else if (info.menuItemId === "copy-page") copyClean(info.frameUrl || info.pageUrl, tabId);
  else if (info.menuItemId === "copy-media") copyClean(info.srcUrl, tabId);
  else if (info.menuItemId === "clean-clipboard") cleanClipboard(tabId);
});

chrome.commands.onCommand.addListener((cmd, tab) => {
  if (cmd === "clean-clipboard") cleanClipboard(tab?.id);
});
