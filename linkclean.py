#!/usr/bin/env python3
"""linkclean - strip links down to the bare minimum.

Unwraps redirect wrappers (Google, Facebook, Reddit, YouTube, DuckDuckGo...),
removes tracking parameters, and rewrites well-known sites to their canonical
short form (e.g. Amazon -> /dp/ASIN, YouTube -> ?v=ID).

Usage:
    linkclean URL [URL ...]       clean the given URLs
    echo "text with links" | linkclean   clean every URL inside stdin text
    linkclean -c                  clean the clipboard in place (wl-paste/wl-copy)
Options:
    -s, --strict   also drop the whole query and fragment on unknown sites
    -e, --expand   follow redirects of URL shorteners (network access)
"""
import argparse
import base64
import re
import shutil
import subprocess
import sys
import urllib.request
from urllib.parse import parse_qsl, unquote, urlencode, urlsplit, urlunsplit

# Query params that are always tracking junk, on any site.
TRACKING_PARAMS = {
    "fbclid", "gclid", "gclsrc", "dclid", "gbraid", "wbraid", "msclkid", "yclid",
    "ttclid", "twclid", "li_fat_id", "igshid", "igsh", "mc_cid", "mc_eid",
    "_hsenc", "_hsmi", "__hssc", "__hstc", "__hsfp", "hsctatracking", "mkt_tok",
    "_ga", "_gl", "_gac", "srsltid", "epik", "spm", "scm", "trk", "trkinfo",
    "trackingid", "ref_src", "ref_url", "referrer", "cmpid", "icid", "ncid",
    "ocid", "sr_share", "share_id", "sharesource", "rcm", "vero_conv", "vero_id",
    "wickedid", "oly_anon_id", "oly_enc_id", "rb_clickid", "s_cid", "s_kwcid",
    "ef_id", "cvid", "campaign_id", "ad_id", "adgroupid", "guccounter",
    "guce_referrer", "guce_referrer_sig", "feature", "pp", "smid", "smtyp",
}
TRACKING_PREFIXES = ("utm_", "pk_", "mtm_", "itm_", "hmb_", "ss_", "__s")

# Redirect wrappers: (host regex, path regex, param holding the real URL).
REDIRECTORS = [
    (r"(www\.)?google\.[a-z.]+", r"/url", ("q", "url")),
    (r"l[m]?\.facebook\.com", r"/l\.php", ("u",)),
    (r"l\.instagram\.com", r"/", ("u",)),
    (r"l\.messenger\.com", r"/l\.php", ("u",)),
    (r"out\.reddit\.com", r"/", ("url",)),
    (r"(www\.)?youtube\.com", r"/redirect", ("q",)),
    (r"(www\.)?duckduckgo\.com", r"/l/", ("uddg",)),
    (r"steamcommunity\.com", r"/linkfilter/", ("url", "u")),
    (r"href\.li", r"/", ()),  # target is the query string itself
    (r"slack-redir\.net", r"/link", ("url",)),
    (r"(www\.)?linkedin\.com", r"/redir/redirect", ("url",)),
    (r"t\.umblr\.com", r"/redirect", ("z",)),
    (r"(click\.)?discord\.com", r"/ra/", ()),
    (r"(www\.)?bing\.com", r"/ck/a", ("u",)),
]

SHORTENERS = {
    "bit.ly", "t.co", "tinyurl.com", "goo.gl", "amzn.to", "amzn.eu", "a.co",
    "ow.ly", "buff.ly", "is.gd", "rebrand.ly", "t.ly", "cutt.ly", "lnkd.in",
    "fb.me", "trib.al", "shorturl.at", "s.id", "vm.tiktok.com", "vt.tiktok.com",
    "spoti.fi", "dlvr.it", "redd.it", "pin.it",
}

URL_RE = re.compile(r"https?://[^\s<>\"'`\])}]+", re.I)


def _host_is(host, *domains):
    return any(host == d or host.endswith("." + d) for d in domains)


def _keep(query, allowed):
    return [(k, v) for k, v in query if k in allowed]


def unwrap(url):
    """Peel redirect wrappers until the real destination remains."""
    for _ in range(10):
        p = urlsplit(url)
        host = p.hostname or ""
        for host_re, path_re, keys in REDIRECTORS:
            if not (re.fullmatch(host_re, host) and re.match(path_re, p.path)):
                continue
            target = None
            if host == "href.li":
                target = p.query
            elif "bing.com" in host:
                u = dict(parse_qsl(p.query)).get("u", "")
                if u.startswith("a1"):
                    b = u[2:]
                    try:
                        target = base64.urlsafe_b64decode(b + "=" * (-len(b) % 4)).decode()
                    except Exception:
                        target = None
            else:
                q = dict(parse_qsl(p.query))
                target = next((q[k] for k in keys if q.get(k)), None)
            if target and re.match(r"https?://", unquote(target), re.I):
                url = target if target.lower().startswith("http") else unquote(target)
                break
        else:
            return url
    return url


def site_rules(scheme, host, path, query):
    """Per-site minimal form. Returns (path, query, keep_fragment) or None."""
    h = host
    # YouTube
    if _host_is(h, "youtube.com", "youtube-nocookie.com"):
        if path == "/watch":
            return path, _keep(query, {"v", "t", "list"} if not any(k == "v" for k, _ in query) else {"v", "t"}), False
        if path.startswith("/shorts/"):
            return path, [], False
        if path == "/results":
            return path, _keep(query, {"search_query"}), False
        if path == "/playlist":
            return path, _keep(query, {"list"}), False
        return path, [], False
    if h == "youtu.be":
        return path, _keep(query, {"t"}), False
    # Amazon: /anything/dp/ASIN/... -> /dp/ASIN
    if re.search(r"(^|\.)amazon\.[a-z.]+$", h):
        m = re.search(r"/(?:dp|gp/product|gp/aw/d|exec/obidos/asin)/([A-Z0-9]{10})", path, re.I)
        if m:
            return f"/dp/{m.group(1).upper()}", [], False
        if path.startswith("/s"):
            return path, _keep(query, {"k"}), False
        return path, [], False
    # eBay: /itm/slug/123 -> /itm/123
    if re.search(r"(^|\.)ebay\.[a-z.]+$", h):
        m = re.search(r"/itm/(?:[^/]+/)?(\d+)", path)
        return (f"/itm/{m.group(1)}" if m else path), [], False
    if _host_is(h, "aliexpress.com", "aliexpress.us"):
        m = re.search(r"/item/(\d+)\.html", path)
        return (f"/item/{m.group(1)}.html" if m else path), [], False
    # Google search
    if re.fullmatch(r"(www\.)?google\.[a-z.]+", h) and path == "/search":
        return path, _keep(query, {"q", "tbm", "udm"}), False
    if h.startswith("maps.google.") or (re.fullmatch(r"(www\.)?google\.[a-z.]+", h) and path.startswith("/maps")):
        return path, _keep(query, {"q", "query", "api", "destination", "origin"}), False
    if _host_is(h, "news.ycombinator.com"):
        return path, _keep(query, {"id", "p"}), True
    if _host_is(h, "github.com"):
        return path, _keep(query, {"q", "tab", "type", "page"}), True
    if _host_is(h, "wikipedia.org"):
        return path, _keep(query, {"title", "oldid", "diff", "search"}), True
    if _host_is(h, "duckduckgo.com"):
        return path, _keep(query, {"q"}), False
    if _host_is(h, "bing.com"):
        return path, _keep(query, {"q"}), False
    # Sites where the path alone identifies the content.
    if _host_is(h, "twitter.com", "x.com", "instagram.com", "tiktok.com",
                "linkedin.com", "reddit.com", "spotify.com", "medium.com",
                "substack.com", "threads.net", "pinterest.com", "tumblr.com",
                "imgur.com", "twitch.tv", "soundcloud.com", "bsky.app",
                "music.apple.com", "apps.apple.com", "etsy.com", "walmart.com",
                "bestbuy.com", "flipkart.com", "nytimes.com", "theverge.com"):
        return path, [], False
    if _host_is(h, "facebook.com"):
        return path, _keep(query, {"story_fbid", "id", "v", "fbid"}), False
    return None


def clean(url, strict=False, expand=False):
    url = url.strip().rstrip(".,;:!?")
    if expand:
        url = expand_url(url)
    url = unwrap(url)
    p = urlsplit(url)
    scheme = p.scheme.lower()
    host = (p.hostname or "").lower()
    if not host:
        return url
    port = p.port
    if port and not ((scheme == "http" and port == 80) or (scheme == "https" and port == 443)):
        netloc = f"{host}:{port}"
    else:
        netloc = host
    if host.startswith("m.") and _host_is(host, "youtube.com", "facebook.com", "twitter.com", "x.com", "reddit.com"):
        netloc = netloc[2:]
    elif host.endswith(".m.wikipedia.org"):
        netloc = netloc.replace(".m.", ".")
    path = p.path or "/"
    query = parse_qsl(p.query, keep_blank_values=True)
    fragment = p.fragment

    rule = site_rules(scheme, host, path, query)
    if rule:
        path, query, keep_frag = rule
        if not keep_frag:
            fragment = ""
    elif strict:
        query, fragment = [], ""
    else:
        query = [(k, v) for k, v in query
                 if k.lower() not in TRACKING_PARAMS
                 and not k.lower().startswith(TRACKING_PREFIXES)]

    # Text-fragment highlights and tracking in fragments are never needed.
    if fragment.startswith(":~:") or re.search(r"(^|&)(utm_|xtor=|at_)", fragment):
        fragment = ""
    fragment = fragment.split(":~:")[0].rstrip("&")

    if path != "/" and path.endswith("/") and rule:
        path = path.rstrip("/")
    q = urlencode(query, doseq=True, safe=":/@!$'()*,;")
    return urlunsplit((scheme, netloc, path, q, fragment))


def expand_url(url):
    host = (urlsplit(url).hostname or "").lower()
    if host not in SHORTENERS:
        return url
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return r.geturl()
    except Exception:
        return url


def clean_text(text, **kw):
    return URL_RE.sub(lambda m: _clean_match(m.group(0), **kw), text)


def _clean_match(raw, **kw):
    # Keep trailing punctuation that belongs to the sentence, not the URL.
    trail = re.search(r"[.,;:!?]*$", raw).group(0)
    core = raw[: len(raw) - len(trail)] if trail else raw
    return clean(core, **kw) + trail


def main():
    ap = argparse.ArgumentParser(description="Strip links down to the bare minimum.")
    ap.add_argument("urls", nargs="*")
    ap.add_argument("-c", "--clipboard", action="store_true", help="clean the clipboard in place")
    ap.add_argument("-s", "--strict", action="store_true", help="drop all query/fragment on unknown sites")
    ap.add_argument("-e", "--expand", action="store_true", help="expand URL shorteners (network)")
    a = ap.parse_args()
    kw = {"strict": a.strict, "expand": a.expand}

    if a.clipboard:
        if not (shutil.which("wl-paste") and shutil.which("wl-copy")):
            sys.exit("linkclean: wl-clipboard not found")
        text = subprocess.run(["wl-paste", "-n"], capture_output=True, text=True).stdout
        out = clean_text(text, **kw)
        subprocess.run(["wl-copy"], input=out, text=True)
        print(out)
        if shutil.which("notify-send") and out != text:
            subprocess.run(["notify-send", "-a", "linkclean", "Link cleaned", out[:200]])
    elif a.urls:
        for u in a.urls:
            print(clean(u, **kw))
    elif not sys.stdin.isatty():
        sys.stdout.write(clean_text(sys.stdin.read(), **kw))
    else:
        ap.print_help()


if __name__ == "__main__":
    main()
