# Link Sanitizer

Strips links down to the bare minimum: no tracking parameters, no redirect wrappers, no share IDs.

**Website:** https://yajatghule.github.io/link-sanitizer/ · **Chrome extension** · **CLI**

| Before | After |
|---|---|
| `https://www.amazon.com/Kindle-Paperwhite/dp/B08KTZ8249/ref=sr_1_3?crid=2X1Y&keywords=kindle&qid=1697` | `https://www.amazon.com/dp/B08KTZ8249` |
| `https://youtu.be/dQw4w9WgXcQ?si=Xyz123AbC&t=43` | `https://youtu.be/dQw4w9WgXcQ?t=43` |
| `https://www.google.com/url?sa=t&url=https%3A%2F%2Fwiki.archlinux.org%2Ftitle%2FHyprland&usg=AOv` | `https://wiki.archlinux.org/title/Hyprland` |
| `https://example.com/article?id=42&utm_source=newsletter&fbclid=IwAR3x` | `https://example.com/article?id=42` |

## What it does

- **Unwraps redirects**: Google `/url`, Facebook/Instagram/Messenger `l.php`, YouTube `/redirect`, DuckDuckGo, Reddit, Steam, LinkedIn, Slack, Bing, href.li
- **Removes trackers**: `utm_*`, `fbclid`, `gclid`, `si`, `igsh`, `mc_cid`, `_hsenc`, `srsltid`, and many more
- **Canonicalizes known sites**: Amazon → `/dp/ASIN`, eBay → `/itm/ID`, YouTube → `?v=ID[&t=]`, X/Instagram/Reddit/Spotify/TikTok → path only, Google search → `?q=`
- **Keeps what matters**: on other sites, real parameters like `?id=42` stay. Strict mode drops everything after the path.

## Chrome extension

Cleans links as they go onto the clipboard:

- <kbd>Ctrl</kbd>+<kbd>C</kbd> on selected text or in a text box
- a site's own "Copy link" / "Share" button (hooks `navigator.clipboard.writeText` and `write`)
- right-click → **Copy clean link** / **Copy clean page URL** / **Copy clean media URL**
- <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> cleans whatever is already on the clipboard (e.g. after Chrome's own "Copy link address"); change it at `chrome://extensions/shortcuts`
- the popup shows the clipboard before/after, copies a clean URL of the current tab, and has the auto-clean and strict-mode switches

**Install:** download `link-sanitizer-extension.zip` from the [latest release](https://github.com/YajatGhule/link-sanitizer/releases/latest), unzip it somewhere permanent, open `chrome://extensions`, enable **Developer mode**, click **Load unpacked** and pick the folder.

## CLI

One Python file with no dependencies.

```sh
curl -Lo ~/.local/bin/linkclean https://raw.githubusercontent.com/YajatGhule/link-sanitizer/main/linkclean.py
chmod +x ~/.local/bin/linkclean

linkclean 'https://…'                  # clean one or more links
echo "text with links" | linkclean     # clean every URL inside the text
linkclean -c                           # clean the Wayland clipboard in place (wl-clipboard)
linkclean -s URL                       # strict: drop all params on unknown sites too
linkclean -e URL                       # expand shorteners (bit.ly, t.co, amzn.to…) first; uses network
```

## Development

`extension/linkclean.js` is the cleaner used by both the website and the extension; `linkclean.py` mirrors it for the CLI. `tests/cases.json` holds the shared test cases, run against both:

```sh
python3 test_linkclean.py
node tests/test_linkclean.mjs
```

Package the extension with `cd extension && zip -r ../link-sanitizer-extension.zip .`
