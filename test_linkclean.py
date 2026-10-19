import unittest
from linkclean import clean, clean_text

CASES = [
    ("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw&index=2&pp=ygU&si=abc&feature=share",
     "https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ("https://youtu.be/dQw4w9WgXcQ?si=Xyz123&t=42", "https://youtu.be/dQw4w9WgXcQ?t=42"),
    ("https://m.youtube.com/watch?v=abc&t=10s", "https://youtube.com/watch?v=abc&t=10s"),
    ("https://www.amazon.com/Some-Long-Product-Name/dp/B08N5WRWNW/ref=sr_1_3?crid=2X&keywords=x&qid=1&sr=8-3",
     "https://www.amazon.com/dp/B08N5WRWNW"),
    ("https://www.amazon.co.uk/gp/product/b08n5wrwnw?psc=1", "https://www.amazon.co.uk/dp/B08N5WRWNW"),
    ("https://www.ebay.com/itm/Cool-Thing/1234567890?hash=item&_trkparms=x", "https://www.ebay.com/itm/1234567890"),
    ("https://x.com/user/status/123?s=20&t=abcdef", "https://x.com/user/status/123"),
    ("https://www.instagram.com/p/Cabc/?igsh=MWx0&utm_source=ig_web", "https://www.instagram.com/p/Cabc"),
    ("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=ab12cd", "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"),
    ("https://www.reddit.com/r/archlinux/comments/abc/title/?share_id=x&utm_medium=android_app",
     "https://www.reddit.com/r/archlinux/comments/abc/title"),
    ("https://www.google.com/url?sa=t&rct=j&q=&url=https%3A%2F%2Fexample.com%2Fpage%3Futm_source%3Dgoogle%26id%3D7&usg=AOv",
     "https://example.com/page?id=7"),
    ("https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.org%2Fa%3Ffbclid%3DIwAR&h=AT0",
     "https://example.org/a"),
    ("https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwiki.archlinux.org%2Ftitle%2FHyprland&rut=abc",
     "https://wiki.archlinux.org/title/Hyprland"),
    ("https://www.youtube.com/redirect?event=video_description&redir_token=x&q=https%3A%2F%2Fgithub.com%2Ffoo%2Fbar",
     "https://github.com/foo/bar"),
    ("https://www.google.com/search?q=arch+linux&sca_esv=1&source=hp&ei=xyz&oq=arch&gs_lp=abc",
     "https://www.google.com/search?q=arch+linux"),
    ("https://example.com/article?id=5&utm_source=newsletter&utm_campaign=x&fbclid=abc&gclid=1#section-2",
     "https://example.com/article?id=5#section-2"),
    ("https://example.com/a#:~:text=hello", "https://example.com/a"),
    ("HTTPS://Example.COM:443/path?mc_cid=1&q=keep", "https://example.com/path?q=keep"),
    ("https://en.wikipedia.org/wiki/Linux?wprov=sfla1#History", "https://en.wikipedia.org/wiki/Linux#History"),
    ("https://github.com/foo/bar/issues?q=is%3Aopen&utm_source=x#readme", "https://github.com/foo/bar/issues?q=is:open#readme"),
]


class T(unittest.TestCase):
    def test_cases(self):
        for raw, want in CASES:
            with self.subTest(raw=raw):
                self.assertEqual(clean(raw), want)

    def test_strict(self):
        self.assertEqual(clean("https://example.com/a?id=5#x", strict=True), "https://example.com/a")

    def test_text(self):
        self.assertEqual(
            clean_text("see https://x.com/a/status/1?s=20. and (https://youtu.be/abc?si=z)"),
            "see https://x.com/a/status/1. and (https://youtu.be/abc)")


if __name__ == "__main__":
    unittest.main()
