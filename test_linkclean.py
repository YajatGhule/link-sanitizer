import json
import pathlib
import unittest

from linkclean import clean, clean_text

CASES = json.loads((pathlib.Path(__file__).parent / "tests" / "cases.json").read_text())


class T(unittest.TestCase):
    def test_default(self):
        for c in CASES["default"]:
            with self.subTest(raw=c["in"]):
                self.assertEqual(clean(c["in"]), c["out"])

    def test_strict(self):
        for c in CASES["strict"]:
            self.assertEqual(clean(c["in"], strict=True), c["out"])

    def test_text(self):
        for c in CASES["text"]:
            self.assertEqual(clean_text(c["in"]), c["out"])


if __name__ == "__main__":
    unittest.main()
