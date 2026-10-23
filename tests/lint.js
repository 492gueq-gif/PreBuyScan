// Syntax check of every script, including the inline ones in index.html, and of JSON files.
"use strict";
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const root = path.join(__dirname, "..");
let failed = 0;
const ok = (name, fn) => { try { fn(); console.log("ok   " + name); } catch (e) { failed++; console.log("FAIL " + name + ": " + e.message); } };
for (const f of fs.readdirSync(root).filter(n => n.endsWith(".js")))
  ok(f, () => new vm.Script(fs.readFileSync(path.join(root, f), "utf8"), { filename: f }));
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
let i = 0;
for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g))
  ok("index.html inline script #" + (++i), () => new vm.Script(m[1], { filename: "inline-" + i + ".js" }));
for (const f of ["manifest.webmanifest", "tests/fixtures/gt_pools.json", "tests/fixtures/gt_expected.json"])
  ok(f, () => JSON.parse(fs.readFileSync(path.join(root, f), "utf8")));
ok("no duplicate element ids", () => {
  const ids = [...html.matchAll(/\sid="([^"$]+)"/g)].map(m => m[1]);
  const dup = ids.filter((x, k) => ids.indexOf(x) !== k);
  if (dup.length) throw new Error([...new Set(dup)].join(", "));
});
process.exit(failed ? 1 : 0);
