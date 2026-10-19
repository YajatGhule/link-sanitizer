# link-sanitizer

`linkclean` strips links down to the bare minimum. No dependencies, just Python 3.

- **Unwraps redirects**: Google `/url`, Facebook/Instagram/Messenger `l.php`, YouTube `/redirect`, DuckDuckGo, Reddit, Steam, LinkedIn, Slack, Bing, href.li
- **Removes trackers**: `utm_*`, `fbclid`, `gclid`, `si`, `igsh`, `mc_cid`, `_hsenc`, `srsltid`, and many more
- **Canonicalizes known sites**: Amazon → `/dp/ASIN`, eBay → `/itm/ID`, YouTube → `?v=ID[&t=]`, X/Instagram/Reddit/Spotify/TikTok → path only, Google search → `?q=`
- Drops `#:~:text=` highlight fragments and normalizes scheme/host/default ports

## Usage

```sh
linkclean 'https://www.amazon.com/Long-Name/dp/B08N5WRWNW/ref=sr_1_3?crid=..'
# https://www.amazon.com/dp/B08N5WRWNW

echo "look at https://youtu.be/abc?si=xyz" | linkclean   # cleans every URL in the text
linkclean -c          # clean the Wayland clipboard in place (wl-paste/wl-copy)
linkclean -s URL      # strict: drop all query/fragment on unknown sites too
linkclean -e URL      # expand shorteners (bit.ly, t.co, amzn.to...) first; uses network
```

## Tests

```sh
python3 test_linkclean.py
```
