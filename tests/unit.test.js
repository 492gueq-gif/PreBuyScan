// PreBuyScan unit tests: node --test tests/  (no dependencies, no network; fixtures only)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
globalThis.PBCreator = require("../creator.js");
globalThis.btoa = s => Buffer.from(s, "binary").toString("base64");
globalThis.atob = s => Buffer.from(s, "base64").toString("binary");
const Score = require("../scoring.js");
const Alpha = require("../alpha.js");
const Net = require("../net.js");
const Share = require("../share.js");

const ck = (s, t, extra) => Object.assign({ s, t, d: "" }, extra || {});

// ---------- 3. score interpretation ----------
test("Safety Score: weights, caps and 100 = lowest risk detected", () => {
  assert.equal(Score.scoreOf([ck("ok", "a"), ck("ok", "b")]), 100);
  assert.equal(Score.scoreOf([ck("unk", "a")]), 95);
  assert.equal(Score.scoreOf([ck("warn", "a")]), 79);                 // capped at 79 with any caution
  assert.equal(Score.scoreOf([ck("warn", "a"), ck("warn", "b"), ck("warn", "c")]), 70);
  assert.equal(Score.scoreOf([ck("high", "a")]), 39);                 // capped at 39 with any high risk
  assert.equal(Score.scoreOf(Array(5).fill(ck("high", "x"))), 0);     // floor 0
  assert.equal(Score.ALGO_VERSION, "2026.10.23-1");
});

test("technical error costs like unchecked and never counts as passed", () => {
  const err = ck("unk", "Contrato no revisado", { err: true });
  assert.equal(Score.stateOf(err), "err");
  assert.equal(Score.labelOf(err), "Error técnico");
  assert.equal(Score.scoreOf([err]), Score.scoreOf([ck("unk", "x")]));
  assert.equal(Score.verdictOf([err])[0], "unk");
  assert.equal(Score.coverageOf([err, ck("ok", "y")]).done, 1);
});

test("coverage and overall analysis state", () => {
  const ok = [ck("ok", "a"), ck("warn", "b")];
  assert.equal(Score.analysisStateOf(ok).key, "complete");
  assert.equal(Score.analysisStateOf([...ok, ck("unk", "Venta no simulada")]).key, "partial");
  const e = Score.analysisStateOf([...ok, ck("unk", "Holders no revisados", { err: true })]);
  assert.equal(e.key, "partial");
  assert.match(e.detail, /error técnico/);
  const down = [ck("unk", "Datos de mercado no disponibles", { err: true }), ck("unk", "Contrato no revisado", { err: true })];
  assert.equal(Score.analysisStateOf(down).key, "connection_error");
  assert.equal(Score.analysisStateOf([]).key, "connection_error");
  assert.deepEqual(Score.coverageOf([...ok, ck("unk", "z")]), { done: 2, total: 3, errors: 0, pct: 67 });
});

test("no conclusive check => not evaluable (no favourable-looking number)", () => {
  const down = [ck("unk", "Datos de mercado no disponibles", { err: true }), ck("unk", "Contrato no revisado", { err: true }), ck("unk", "Creador no identificado")];
  assert.equal(Score.scoreOf(down), 85);          // the formula alone would look favourable...
  assert.equal(Score.isEvaluable(down), false);   // ...so the UI shows "No evaluable" and stores no score
  assert.equal(Score.isEvaluable([...down, ck("warn", "Liquidez baja")]), true);
});

test("Data Confidence weights add to 100", () => {
  const full = Score.confidenceOf({ checks: [ck("ok", "La venta simulada funciona"), ck("ok", "Propiedad renunciada")],
    pair: {}, tr: {}, cr: { creator: {}, snipers: {}, holders: { top10: 1 } } });
  assert.equal(full.score, 100);
  assert.equal(Score.confidenceOf({ checks: [], pair: null, tr: null, cr: null }).score, 15); // only "contract not failed"
});

// ---------- 4. alert classification ----------
test("alert classification: confirmed / suspicious / pending / error / clear", () => {
  const c = (s, t, e) => Share.classify(ck(s, t, e));
  assert.equal(c("high", "La venta simulada falla").state, "confirmed");
  assert.equal(c("high", "Creador serial: lanzó 9 tokens y 8 murieron").state, "suspicious"); // pattern, not proof
  assert.equal(c("unk", "Venta no simulada").label, "SIMULACIÓN PENDIENTE");                 // never "honeypot"
  assert.equal(c("unk", "Historial del creador no disponible").label, "NO DISPONIBLE");
  assert.equal(c("unk", "Contrato no revisado", { err: true }).label, "ERROR TÉCNICO");
  assert.equal(c("ok", "La venta simulada funciona").state, "clear");
});

// ---------- 9. address integrity ----------
test("EIP-55 checksum and keccak vectors", () => {
  assert.equal(Share.checksum("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed"), "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
  assert.equal(Share.checksum("0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359"), "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359");
  assert.equal(PBCreator.keccak(""), "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
  assert.equal(PBCreator.keccak(Buffer.from("transfer(address,uint256)").toString("hex")).slice(0, 10), "0xa9059cbb");
});

// ---------- 10/11. reports and verifiable links ----------
test("verifiable link: deterministic hash, tamper rejected, QR budget, error state kept", async () => {
  const rep = { v: 1, c: 4663, a: "0xa01ff10774cfe53c3fbc1d7d124c42e19f6afcbd", n: "OWO", s: "OWOWO", sc: 60, vd: "warn", cf: 85,
                al: Score.ALGO_VERSION, b: 1, ts: 2, m: null, lg: 1,
                x: [["suspicious", "SEÑAL SOSPECHOSA", "Liquidez baja", "d"], ["pending", "ERROR TÉCNICO", "Holders no revisados", ""]] };
  const link = await Share.verifiableLink(rep);
  const u = new URL(link.url);
  assert.ok(Buffer.byteLength(link.url) <= 700);
  const ok = await Share.verifyFromLocation({ search: u.search, hash: u.hash });
  assert.ok(ok.ok, ok.reason);
  assert.equal(ok.rep.x[1][1], "ERROR TÉCNICO");
  const lite = JSON.parse(Buffer.from(u.hash.slice(5).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
  lite.sc = 99;
  const bad = Buffer.from(Share.canonical(lite)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assert.equal((await Share.verifyFromLocation({ search: u.search, hash: "#rep=" + bad })).ok, false);
  const big = Object.assign({}, rep, { n: "Ñ".repeat(80), x: Array(8).fill(["pending", "NO VERIFICADO", "Dueño del contrato no identificado ñññññññ", "d"]) });
  assert.ok(Buffer.byteLength((await Share.verifiableLink(big)).url) <= 700);
});

// ---------- 8. Alpha Radar ----------
const NOW = Date.parse("2026-10-23T00:00:00Z");
function pool(o) {
  o = Object.assign({ ageH: 3, liq: 40000, vol1: 9000, vol15: 4000, buys: 60, sells: 40, buyers: 50, sellers: 20, buyers15: 25, fdv: 500000, b6: 200, s6: 150 }, o);
  return { attributes: { address: o.address || "0x" + "9".repeat(40), name: "TKN / WETH", reserve_in_usd: String(o.liq), fdv_usd: String(o.fdv),
      pool_created_at: new Date(NOW - o.ageH * 3.6e6).toISOString(), volume_usd: { h1: String(o.vol1), m15: String(o.vol15) },
      transactions: { h1: { buys: o.buys, sells: o.sells, buyers: o.buyers, sellers: o.sellers }, m15: { buyers: o.buyers15 }, h6: { buys: o.b6, sells: o.s6 } },
      base_token_price_usd: "0.01", price_change_percentage: { h1: "3", h24: "20" } },
    relationships: { base_token: { data: { id: "robinhood_" + (o.token || "0x" + "a".repeat(40)) } }, quote_token: { data: { id: Alpha.WETH_ID } } } };
}

test("Alpha filters: Prompt 2.2 defaults and every rule applied", () => {
  assert.deepEqual(Alpha.DEFAULTS, { age: 12, priority: 6, liq: 15000, vol: 3000, tx: 30, fdv: 1000000 });
  const x = Alpha.evaluate(pool({}), {}, NOW, null);
  assert.ok(x.pass); assert.ok(x.priority);
  assert.equal(Alpha.evaluate(pool({ ageH: 8 }), {}, NOW, null).priority, false);
  for (const [o, why] of [[{ ageH: 13 }, "edad"], [{ liq: 14999 }, "liquidez"], [{ vol1: 2999 }, "volumen 1 h"],
                          [{ buys: 10, sells: 19 }, "transacciones 1 h"], [{ fdv: 2e6 }, "FDV"]]) {
    const r = Alpha.evaluate(pool(o), {}, NOW, null);
    assert.equal(r.pass, false, why); assert.ok(r.reasons.includes(why), why);
  }
  assert.ok(Alpha.evaluate(pool({ ageH: 20 }), { age: 24 }, NOW, null).pass);   // editable from the UI
});

test("Alpha Signal Score is bounded, independent of risk and never favourable with high risk", () => {
  const s = Alpha.signalScore({ liq: 1, vol1: 1e9, vol15: 1e9, tx1: 1e9, buyers1: 1e9, sellers1: 0, buyers15: 1e9, ageH: 1 });
  assert.equal(s.score, 100);
  assert.equal(Alpha.signalScore({ liq: 0, vol1: 0, vol15: 0, tx1: 0, buyers1: 0, sellers1: 0, buyers15: 0, ageH: null }).score, 0);
  assert.equal(Object.values(Alpha.WEIGHTS).reduce((a, b) => a + b, 0), 100);
  const honeypotish = Alpha.evaluate(pool({ b6: 40, s6: 0, buys: 50, sells: 0 }), {}, NOW, null);
  assert.equal(honeypotish.q, "high");
  assert.equal(honeypotish.favourable, false);
  assert.ok(honeypotish.alpha > 0); // activity is still measured, but it is not a recommendation
  const wash = Alpha.evaluate(pool({ vol1: 300000 }), {}, NOW, null);
  assert.ok(wash.warn.some(w => /wash/.test(w))); assert.equal(wash.favourable, false);
});

test("Alpha rank: high risk last, priority first, liquidity change since last view", () => {
  const a = Alpha.evaluate(pool({ token: "0x" + "1".repeat(40), ageH: 10 }), {}, NOW, null);
  const b = Alpha.evaluate(pool({ token: "0x" + "2".repeat(40), ageH: 2 }), {}, NOW, null);
  const c = Alpha.evaluate(pool({ token: "0x" + "3".repeat(40), ageH: 1, b6: 40, s6: 0 }), {}, NOW, null);
  assert.deepEqual(Alpha.rank([a, c, b]).map(x => x.t[2]), ["2", "1", "3"]);
  const drop = Alpha.evaluate(pool({ liq: 20000 }), {}, NOW, { liq: 40000, at: NOW - 3600e3 });
  assert.equal(Math.round(drop.liqChange.pct), -50);
  assert.ok(drop.warn.some(w => /Liquidez/.test(w)));
  const fx = require("./fixtures/gt_pools.json"), exp = require("./fixtures/gt_expected.json");
  const at = Date.parse(exp.now);
  assert.deepEqual(Alpha.rank(fx.data.map(p => Alpha.evaluate(p, {}, at, null))).map(x => x.nm), exp.order);
  assert.equal(Alpha.rank(fx.data.map(p => Alpha.evaluate(p, { age: 24 }, at, null))).length, exp.age24_pass.length);
});

// ---------- 5/6. incomplete API answers, timeouts, retries ----------
function fakeFetch(script) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, method: (init && init.method) || "GET" });
    const step = script.shift();
    if (step === "timeout") { const e = new Error("aborted"); e.name = "AbortError"; throw e; }
    if (step === "network") throw new TypeError("Failed to fetch");
    const [status, body, headers] = step;
    return { status, ok: status >= 200 && status < 300, headers: { get: k => (headers || {})[k] || null },
             json: async () => { if (body === "BAD") throw new SyntaxError("bad json"); return body; } };
  };
  f.calls = calls; return f;
}
const quiet = { sleep: async () => {}, random: () => 0 };

test("retries transient failures with backoff and honours Retry-After", async () => {
  const waits = [];
  const f = fakeFetch([[500, null], [429, null, { "Retry-After": "3" }], [200, { ok: 1 }]]);
  const c = Net.makeClient({ fetch: f, sleep: async ms => waits.push(ms), random: () => 0 });
  assert.deepEqual(await c.fetchJSON("https://example.org/x"), { ok: 1 });
  assert.equal(f.calls.length, 3);
  assert.deepEqual(waits, [400, 3000]);
});

test("does not retry 4xx or invalid JSON and reports the failure kind", async () => {
  for (const [script, kind] of [[[[404, null]], "http"], [[[200, "BAD"]], "invalid_json"]]) {
    const f = fakeFetch(script.slice());
    const c = Net.makeClient(Object.assign({ fetch: f }, quiet));
    await assert.rejects(c.fetchJSON("https://example.org/y"), e => e.kind === kind);
    assert.equal(f.calls.length, 1);
  }
  const f = fakeFetch(["timeout", "timeout", "timeout"]);
  const c = Net.makeClient(Object.assign({ fetch: f }, quiet));
  await assert.rejects(c.fetchJSON("https://example.org/z"), e => e.kind === "timeout");
  assert.equal(f.calls.length, 3);
  assert.equal(c.stats.failures, 1);
});

test("RPC POSTs are retried only on transport failures and never cached", async () => {
  const f = fakeFetch(["network", [200, { result: 1 }], [500, null]]);
  const c = Net.makeClient(Object.assign({ fetch: f }, quiet));
  const init = { method: "POST", body: "{}" };
  assert.deepEqual(await c.fetchJSON("https://rpc.mainnet.chain.robinhood.com", init), { result: 1 });
  await assert.rejects(c.fetchJSON("https://rpc.mainnet.chain.robinhood.com", init), e => e.kind === "http");
  assert.equal(f.calls.length, 3);
});

test("GeckoTerminal requests are spaced and 429 without Retry-After backs off longer", async () => {
  let t = 0; const waits = [];
  const sleep = async ms => { waits.push(ms); t += ms; };
  const f = fakeFetch([[200, {}], [200, {}], [429, null], [200, {}]]);
  const c = Net.makeClient({ fetch: f, sleep, now: () => t, random: () => 0 });
  await c.fetchJSON("https://api.geckoterminal.com/api/v2/a");
  await c.fetchJSON("https://api.geckoterminal.com/api/v2/b");
  await c.fetchJSON("https://api.geckoterminal.com/api/v2/c");
  // b and c wait for the per-host gap; c's 429 without Retry-After waits 2 s (not 0.4 s).
  assert.deepEqual(waits, [2100, 2100, 2000, 100]);  // the retry still respects the per-host gap
  assert.equal(f.calls.length, 4);
});

test("network errors on a rate-limited host back off like a hidden 429", async () => {
  let t = 0; const waits = [];
  const sleep = async ms => { waits.push(ms); t += ms; };
  const f = fakeFetch(["network", "network", [200, { ok: 1 }]]);
  const c = Net.makeClient({ fetch: f, sleep, now: () => t, random: () => 0 });
  assert.deepEqual(await c.fetchJSON("https://api.geckoterminal.com/api/v2/n"), { ok: 1 });
  assert.deepEqual(waits, [2000, 100, 4000]);   // 2 s, gap remainder, 4 s
  const g = fakeFetch(["network", [200, { ok: 1 }]]); const w2 = [];
  const c2 = Net.makeClient({ fetch: g, sleep: async ms => w2.push(ms), random: () => 0 });
  await c2.fetchJSON("https://example.org/n");
  assert.deepEqual(w2, [400]);                  // other hosts keep the short backoff
});

test("market GETs are cached for 30 s, then refreshed", async () => {
  let t = 0;
  const f = fakeFetch([[200, { v: 1 }], [200, { v: 2 }]]);
  const c = Net.makeClient(Object.assign({ fetch: f, now: () => t }, quiet));
  const u = "https://api.dexscreener.com/tokens/v1/robinhood/0xabc";
  assert.deepEqual(await c.fetchJSON(u), { v: 1 });
  t = 29999; assert.deepEqual(await c.fetchJSON(u), { v: 1 });
  t = 30001; assert.deepEqual(await c.fetchJSON(u), { v: 2 });
  assert.equal(f.calls.length, 2);
});

// ---------- 2. Robinhood Chain compatibility ----------
test("Robinhood Chain identity is fixed in the page and reports", () => {
  const fs = require("node:fs");
  const html = fs.readFileSync(require("node:path").join(__dirname, "..", "index.html"), "utf8");
  assert.match(html, /const RPC="https:\/\/rpc\.mainnet\.chain\.robinhood\.com"/);
  assert.match(html, /tokens\/v1\/robinhood\//);
  assert.match(fs.readFileSync(require("node:path").join(__dirname, "..", "share.js"), "utf8"), /c: 4663/);
});

// ---------- 15. dependency / secret hygiene ----------
test("no secrets and CDN scripts carry integrity", () => {
  const fs = require("node:fs"), path = require("node:path");
  const root = path.join(__dirname, "..");
  for (const f of fs.readdirSync(root).filter(n => /\.(js|html|json|webmanifest)$/.test(n))) {
    const text = fs.readFileSync(path.join(root, f), "utf8");
    assert.doesNotMatch(text, /(api[_-]?key|secret|alchemy\.com\/v2\/|infura\.io\/v3\/)\s*[:=]?\s*["'][A-Za-z0-9_-]{16,}/i, f);
  }
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  for (const lib of ["d3/7.9.0/d3.min.js", "qrcode-generator/1.4.4/qrcode.min.js", "qrcode-generator@1.4.4/qrcode.js"])
    assert.match(html, new RegExp(lib.replace(/[.@/]/g, m => "\\" + m) + "\":\"sha384-[A-Za-z0-9+/]{64}\""), lib);
});

test("explorer time budget: 60 s default, 120 s on retry; timeout told apart from provider failure", () => {
  const C = globalThis.PBCreator;
  assert.equal(C.BUDGET_MS, 60000);
  assert.equal(C.RETRY_BUDGET_MS, 120000);
  const out = { errors: ["reputation: time budget", "lp: HTTP 404", "snipers: unavailable", "holders: time budget"] };
  assert.equal(C.failReason(out, "reputation"), "timeout");
  assert.equal(C.failReason(out, "holders"), "timeout");
  assert.equal(C.failReason(out, "lp"), "provider");
  assert.equal(C.failReason(out, "snipers"), "provider");
  assert.equal(C.failReason(out, "creator"), null);
  assert.equal(C.failReason({ errors: ["reputationX: time budget"] }, "reputation"), null);
  assert.equal(C.failReason(null, "lp"), null);
});
