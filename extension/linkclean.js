/* linkclean.js - strip links down to the bare minimum.
 * Shared by the website and the Chrome extension; mirrors linkclean.py.
 * Exposes globalThis.LinkClean = { clean, cleanText, unwrap }.
 */
(function (root) {
  "use strict";

  // Query params that are always tracking junk, on any site.
  const TRACKING_PARAMS = new Set([
    "fbclid", "gclid", "gclsrc", "dclid", "gbraid", "wbraid", "msclkid", "yclid",
    "ttclid", "twclid", "li_fat_id", "igshid", "igsh", "mc_cid", "mc_eid",
    "_hsenc", "_hsmi", "__hssc", "__hstc", "__hsfp", "hsctatracking", "mkt_tok",
    "_ga", "_gl", "_gac", "srsltid", "epik", "spm", "scm", "trk", "trkinfo",
    "trackingid", "ref_src", "ref_url", "referrer", "cmpid", "icid", "ncid",
    "ocid", "sr_share", "share_id", "sharesource", "rcm", "vero_conv", "vero_id",
    "wickedid", "oly_anon_id", "oly_enc_id", "rb_clickid", "s_cid", "s_kwcid",
    "ef_id", "cvid", "campaign_id", "ad_id", "adgroupid", "guccounter",
    "guce_referrer", "guce_referrer_sig", "feature", "pp", "smid", "smtyp",
  ]);
  const TRACKING_PREFIXES = ["utm_", "pk_", "mtm_", "itm_", "hmb_", "ss_", "__s"];

  // Redirect wrappers: [host regex, path regex, params holding the real URL].
  const REDIRECTORS = [
    [/^(www\.)?google\.[a-z.]+$/, /^\/url/, ["q", "url"]],
    [/^l[m]?\.facebook\.com$/, /^\/l\.php/, ["u"]],
    [/^l\.instagram\.com$/, /^\//, ["u"]],
    [/^l\.messenger\.com$/, /^\/l\.php/, ["u"]],
    [/^out\.reddit\.com$/, /^\//, ["url"]],
    [/^(www\.)?youtube\.com$/, /^\/redirect/, ["q"]],
    [/^(www\.)?duckduckgo\.com$/, /^\/l\//, ["uddg"]],
    [/^steamcommunity\.com$/, /^\/linkfilter\//, ["url", "u"]],
    [/^href\.li$/, /^\//, []], // target is the query string itself
    [/^slack-redir\.net$/, /^\/link/, ["url"]],
    [/^(www\.)?linkedin\.com$/, /^\/redir\/redirect/, ["url"]],
    [/^t\.umblr\.com$/, /^\/redirect/, ["z"]],
    [/^(click\.)?discord\.com$/, /^\/ra\//, []],
    [/^(www\.)?bing\.com$/, /^\/ck\/a/, ["u"]],
  ];

  const PATH_ONLY_SITES = [
    "twitter.com", "x.com", "instagram.com", "tiktok.com", "linkedin.com",
    "reddit.com", "spotify.com", "medium.com", "substack.com", "threads.net",
    "pinterest.com", "tumblr.com", "imgur.com", "twitch.tv", "soundcloud.com",
    "bsky.app", "music.apple.com", "apps.apple.com", "etsy.com", "walmart.com",
    "bestbuy.com", "flipkart.com", "nytimes.com", "theverge.com",
  ];

  const URL_RE = /https?:\/\/[^\s<>"'`\])}]+/gi;
  const GOOGLE_RE = /^(www\.)?google\.[a-z.]+$/;

  const hostIs = (host, ...domains) =>
    domains.some((d) => host === d || host.endsWith("." + d));

  // Like Python's urllib.parse.parse_qsl(keep_blank_values=True).
  function parseQuery(q) {
    if (!q) return [];
    return q.split("&").filter(Boolean).map((part) => {
      const i = part.indexOf("=");
      const k = i < 0 ? part : part.slice(0, i);
      const v = i < 0 ? "" : part.slice(i + 1);
      return [decode(k), decode(v)];
    });
  }

  function decode(s) {
    s = s.replace(/\+/g, " ");
    try { return decodeURIComponent(s); } catch { return s; }
  }

  // Like Python's urlencode(safe=":/@!$'()*,;") with quote_plus.
  function encode(s) {
    return encodeURIComponent(s)
      .replace(/%20/g, "+")
      .replace(/%(3A|2F|40|24|2C|3B)/gi, (m) => decodeURIComponent(m));
  }

  const buildQuery = (pairs) => pairs.map(([k, v]) => encode(k) + "=" + encode(v)).join("&");
  const keep = (query, allowed) => query.filter(([k]) => allowed.has(k));

  function split(url) {
    const m = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/i.exec(url);
    if (!m) return null;
    const [, scheme, authority, path, query = "", fragment = ""] = m;
    const hp = /^(?:[^@]*@)?(\[[^\]]*\]|[^:]*)(?::(\d*))?$/.exec(authority);
    if (!hp) return null;
    return {
      scheme: scheme.toLowerCase(),
      host: hp[1].toLowerCase(),
      port: hp[2] ? Number(hp[2]) : null,
      path, query, fragment,
    };
  }

  /** Peel redirect wrappers until the real destination remains. */
  function unwrap(url) {
    for (let i = 0; i < 10; i++) {
      const p = split(url);
      if (!p) return url;
      let next = null;
      for (const [hostRe, pathRe, keys] of REDIRECTORS) {
        if (!hostRe.test(p.host) || !pathRe.test(p.path)) continue;
        let target = null;
        const q = new Map(parseQuery(p.query).filter(([, v]) => v));
        if (p.host === "href.li") {
          target = p.query;
        } else if (p.host.endsWith("bing.com")) {
          const u = q.get("u") || "";
          if (u.startsWith("a1")) {
            try {
              target = atob(u.slice(2).replace(/-/g, "+").replace(/_/g, "/"));
            } catch { target = null; }
          }
        } else {
          const k = keys.find((k) => q.get(k));
          target = k ? q.get(k) : null;
        }
        if (target && /^https?:\/\//i.test(decode(target))) {
          next = /^http/i.test(target) ? target : decode(target);
          break;
        }
      }
      if (!next) return url;
      url = next;
    }
    return url;
  }

  /** Per-site minimal form: [path, query, keepFragment] or null. */
  function siteRules(h, path, query) {
    if (hostIs(h, "youtube.com", "youtube-nocookie.com")) {
      if (path === "/watch") {
        const hasV = query.some(([k]) => k === "v");
        return [path, keep(query, new Set(hasV ? ["v", "t"] : ["v", "t", "list"])), false];
      }
      if (path.startsWith("/shorts/")) return [path, [], false];
      if (path === "/results") return [path, keep(query, new Set(["search_query"])), false];
      if (path === "/playlist") return [path, keep(query, new Set(["list"])), false];
      return [path, [], false];
    }
    if (h === "youtu.be") return [path, keep(query, new Set(["t"])), false];
    if (/(^|\.)amazon\.[a-z.]+$/.test(h)) {
      const m = /\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/asin)\/([A-Z0-9]{10})/i.exec(path);
      if (m) return ["/dp/" + m[1].toUpperCase(), [], false];
      if (path.startsWith("/s")) return [path, keep(query, new Set(["k"])), false];
      return [path, [], false];
    }
    if (/(^|\.)ebay\.[a-z.]+$/.test(h)) {
      const m = /\/itm\/(?:[^/]+\/)?(\d+)/.exec(path);
      return [m ? "/itm/" + m[1] : path, [], false];
    }
    if (hostIs(h, "aliexpress.com", "aliexpress.us")) {
      const m = /\/item\/(\d+)\.html/.exec(path);
      return [m ? `/item/${m[1]}.html` : path, [], false];
    }
    if (GOOGLE_RE.test(h) && path === "/search")
      return [path, keep(query, new Set(["q", "tbm", "udm"])), false];
    if (h.startsWith("maps.google.") || (GOOGLE_RE.test(h) && path.startsWith("/maps")))
      return [path, keep(query, new Set(["q", "query", "api", "destination", "origin"])), false];
    if (hostIs(h, "news.ycombinator.com")) return [path, keep(query, new Set(["id", "p"])), true];
    if (hostIs(h, "github.com")) return [path, keep(query, new Set(["q", "tab", "type", "page"])), true];
    if (hostIs(h, "wikipedia.org"))
      return [path, keep(query, new Set(["title", "oldid", "diff", "search"])), true];
    if (hostIs(h, "duckduckgo.com", "bing.com")) return [path, keep(query, new Set(["q"])), false];
    if (hostIs(h, ...PATH_ONLY_SITES)) return [path, [], false];
    if (hostIs(h, "facebook.com"))
      return [path, keep(query, new Set(["story_fbid", "id", "v", "fbid"])), false];
    return null;
  }

  function clean(url, { strict = false } = {}) {
    url = url.trim().replace(/[.,;:!?]+$/, "");
    url = unwrap(url);
    const p = split(url);
    if (!p || !p.host) return url;
    const { scheme, host, port } = p;
    const defaultPort = (scheme === "http" && port === 80) || (scheme === "https" && port === 443);
    let netloc = port && !defaultPort ? `${host}:${port}` : host;
    if (/^m\./.test(host) && hostIs(host, "youtube.com", "facebook.com", "twitter.com", "x.com", "reddit.com"))
      netloc = netloc.slice(2);
    else if (/\.m\.wikipedia\.org$/.test(host)) netloc = netloc.replace(".m.", ".");

    let path = p.path || "/";
    let query = parseQuery(p.query);
    let fragment = p.fragment;

    const rule = siteRules(host, path, query);
    if (rule) {
      let keepFrag;
      [path, query, keepFrag] = rule;
      if (!keepFrag) fragment = "";
    } else if (strict) {
      query = [];
      fragment = "";
    } else {
      query = query.filter(([k]) => {
        const lk = k.toLowerCase();
        return !TRACKING_PARAMS.has(lk) && !TRACKING_PREFIXES.some((pre) => lk.startsWith(pre));
      });
    }

    // Text-fragment highlights and tracking in fragments are never needed.
    if (fragment.startsWith(":~:") || /(^|&)(utm_|xtor=|at_)/.test(fragment)) fragment = "";
    fragment = fragment.split(":~:")[0].replace(/&+$/, "");

    if (rule && path !== "/" && path.endsWith("/")) path = path.replace(/\/+$/, "");
    const q = buildQuery(query);
    return `${scheme}://${netloc}${path}${q ? "?" + q : ""}${fragment ? "#" + fragment : ""}`;
  }

  /** Clean every URL inside a block of text, keeping sentence punctuation. */
  function cleanText(text, opts) {
    return text.replace(URL_RE, (raw) => {
      const trail = /[.,;:!?]*$/.exec(raw)[0];
      const core = trail ? raw.slice(0, raw.length - trail.length) : raw;
      return clean(core, opts) + trail;
    });
  }

  root.LinkClean = { clean, cleanText, unwrap };
  if (typeof module !== "undefined") module.exports = root.LinkClean;
})(typeof globalThis !== "undefined" ? globalThis : this);
