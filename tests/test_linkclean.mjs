// Runs the shared cases against the JS core: node tests/test_linkclean.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { clean, cleanText } = require("../extension/linkclean.js");
const cases = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url)));

let fail = 0, total = 0;
const check = (got, want, input) => {
  total++;
  if (got !== want) { fail++; console.log(`FAIL ${input}\n  got  ${got}\n  want ${want}`); }
};
for (const c of cases.default) check(clean(c.in), c.out, c.in);
for (const c of cases.strict) check(clean(c.in, { strict: true }), c.out, c.in);
for (const c of cases.text) check(cleanText(c.in), c.out, c.in);
console.log(`${total - fail}/${total} passed`);
process.exit(fail ? 1 : 0);
