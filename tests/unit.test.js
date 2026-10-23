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
  assert.equal(Score.ALGO_VERSION, "2026.10.23-3");
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
  // Inconclusive checks (no technical failure) finish the analysis; only technical errors make it partial.
  const inc = Score.analysisStateOf([...ok, ck("unk", "Dueño del contrato no identificado")]);
  assert.equal(inc.key, "complete");
  assert.equal(inc.inconclusive, 1);
  assert.match(inc.detail, /1 sin resultado concluyente/);
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

test("explorer cache: BigInt round trip, TTL expiry, failures and nulls never cached", async () => {
  const C = globalThis.PBCreator;
  const store = new Map();
  globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  try {
    let calls = 0;
    const v1 = await C.cached("snipers", "0xabc", async () => { calls++; return { n: 1, wallets: [{ amt: 12345678901234567890n }] }; });
    const v2 = await C.cached("snipers", "0xabc", async () => { calls++; return null; });
    assert.equal(calls, 1);
    assert.equal(v2.wallets[0].amt, 12345678901234567890n);            // BigInt survives storage
    assert.deepEqual(v1, v2);
    const t = Date.now();
    assert.equal(C._cacheGet("snipers", "0xabc", t + C.TTL.snipers + 1), undefined);   // expired
    await assert.rejects(C.cached("holders", "0xdef", async () => { throw new Error("unavailable"); }));
    assert.equal(C._cacheGet("holders", "0xdef", Date.now()), undefined);              // failures not stored
    await C.cached("lp", "0x1", async () => null);
    assert.equal(C._cacheGet("lp", "0x1", Date.now()), undefined);                     // nulls not stored
    assert.ok(C.TTL.reputation <= 15 * 60000 && C.TTL.holders <= 5 * 60000);
  } finally { delete globalThis.localStorage; }
});

// ---------- explorer resilience: launch buys from chain logs, history fallback to v2 ----------
function fakeChain({ b0 = 1000, t0 = 1_700_000_000, rate = 4, head = 1000 + 4 * 86400, logs = [] }) {
  const tsOf = n => t0 + Math.floor((n - b0) / rate);
  const calls = [];
  return { calls, tsOf, rpc: async (m, p) => {
    calls.push(m);
    if (m === "eth_blockNumber") return "0x" + head.toString(16);
    if (m === "eth_getBlockByNumber") return { timestamp: "0x" + tsOf(parseInt(p[0], 16)).toString(16) };
    if (m === "eth_getLogs") { const lo = parseInt(p[0].fromBlock, 16), hi = parseInt(p[0].toBlock, 16); return logs.filter(l => parseInt(l.blockNumber, 16) >= lo && parseInt(l.blockNumber, 16) <= hi); }
    throw new Error("unexpected " + m);
  } };
}
const T = a => "0x" + "0".repeat(24) + a.slice(2);
const logAt = (block, from, to, v, idx = 0) => ({ blockNumber: "0x" + block.toString(16), logIndex: "0x" + idx.toString(16), topics: ["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", T(from), T(to)], data: "0x" + BigInt(v).toString(16) });

test("launch buys from chain logs: 60 s window from the launch, routers and pools excluded", async () => {
  const POOL = "0x" + "11".repeat(20), A = "0x" + "aa".repeat(20), B = "0x" + "bb".repeat(20), LATE = "0x" + "cc".repeat(20);
  const b0 = 1000, rate = 4, t0 = 1_700_000_000, launchS = t0 + 3600, lb = b0 + 3600 * rate;
  const ch = fakeChain({ b0, rate, t0, logs: [logAt(lb + 4, POOL, A, 500), logAt(lb + 100, POOL, B, 300, 1), logAt(lb + 400, POOL, LATE, 900)] });
  globalThis.PBSellSim = { _rpc: ch.rpc };
  try {
    const isBuy = t => t.from.toLowerCase() === POOL;
    const r = await globalThis.PBCreator._launchBuysRpc("0xtok", { pairCreatedAt: launchS * 1000 }, { createdBlock: b0, createdAt: t0 * 1000 }, isBuy);
    assert.equal(r.source, "rpc");
    assert.deepEqual(r.buys.map(x => x.to), [A, B]);      // +1 s and +25 s are in; +100 s is out
    assert.equal(r.buys[0].value, "500");
    // A range that cannot be verified to cover the launch is refused (caller falls back), never "no snipers".
    await assert.rejects(globalThis.PBCreator._launchBuysRpc("0xtok", { pairCreatedAt: (t0 + 86400 * 2) * 1000 }, { createdBlock: b0, createdAt: t0 * 1000 }, isBuy));
    await assert.rejects(globalThis.PBCreator._launchBuysRpc("0xtok", { pairCreatedAt: launchS * 1000 }, { createdBlock: null, createdAt: t0 * 1000 }, isBuy));
  } finally { delete globalThis.PBSellSim; }
});

test("creator history: one legacy attempt, then the v2 API with paging when rate-limited", async () => {
  const seen = [];
  const page = (n, more) => ({ items: Array.from({ length: n }, (_, i) => ({ hash: "0x" + i, from: { hash: "0xdep" }, to: null, value: "0", raw_input: "0x60806040",
    created_contract: { hash: "0x" + "c".repeat(39) + i }, status: "ok", timestamp: "2026-10-20T00:00:00Z" })), next_page_params: more ? { block_number: 1, index: 2 } : null });
  const orig = globalThis.fetch;
  globalThis.fetch = async url => {
    seen.push(url);
    if (url.includes("module=account")) return { status: 429, ok: false, json: async () => ({ message: "Too many requests" }) };
    const second = url.includes("block_number=1");
    return { status: 200, ok: true, json: async () => page(second ? 3 : 50, !second) };
  };
  try {
    const h = await globalThis.PBCreator._creatorHistory("0xdep");
    assert.equal(h.source, "v2");
    assert.equal(h.txs.length, 53);
    assert.equal(h.truncated, false);
    assert.equal(h.txs[0].contractAddress, "0x" + "c".repeat(39) + "0");
    assert.equal(seen.filter(u => u.includes("module=account")).length, 1);   // the legacy API is hit once, no retry burst
  } finally { globalThis.fetch = orig; }
});

// ---------- external audit: market/holder rules on real snapshots (23 oct 2026) ----------
const Risk = require("../risk.js");
const Contract = require("../contract.js");
const AUD = require("./fixtures/audit_cases.json");
const UHI = "0xe01ada02fb4d1951cdb8cbb761d509db2ff02c94", PONS = "0x39dbed3a2bd333467115de45665cc57f813c4571", PAPER = "0x179b22557cd511124535e41cc0dacf845b650b07";

test("UHI: 49 wallets with near-identical balances are flagged as high risk", () => {
  const c = Risk.clonedBalances(AUD.uhi_holders);
  assert.ok(c && c.n >= 40, "cluster size " + (c && c.n));
  assert.equal(c.finding.s, "high");
  assert.ok(!c.wallets.includes("0x8366a39cc670b4001a1121b8f6a443a643e40951"));   // the PoolManager (contract) is not a wallet
  assert.equal(Risk.clonedBalances([{ addr: "a", pct: 5 }, { addr: "b", pct: 3 }, { addr: "c", pct: 1 }]), null);
});

test("UHI: only 0.83 % of the supply in pools is a fragile price; multi-pool flags abusive fees and hollow volume", () => {
  const f = Risk.poolSupply(0.83, 40334352);
  assert.equal(f.s, "warn"); assert.match(f.t, /0,83 %|0.83 %/);
  assert.equal(Risk.poolSupply(12, 4e7), null);
  assert.equal(Risk.poolSupply(0.5, 50000), null);              // tiny FDV: nothing to fake
  const pools = Risk.poolsFromGT(AUD.uhi_pools, UHI);
  const mp = Risk.multiPool(pools, "0x462958d20cdaba313be960ee91f1fa783f0755791754edd930c3707f2a906025");
  assert.ok(mp.n >= 10 && mp.totalLiq > 600000);
  const t = mp.findings.map(x => x.t).join(" | ");
  assert.match(t, /comisión abusiva/);
  assert.match(t, /Volumen sin liquidez/);
});

test("fake volume: $50M in 13 trades is high risk; bot churn is a warning; normal volume passes", () => {
  const f = Risk.fakeVolume(50e6, 7, 6, 10);
  assert.equal(f.s, "high"); assert.match(f.d, /13 operaciones/);
  const pools = Risk.poolsFromGT(AUD.pons_pools, PONS);
  const churn = pools.map(p => Risk.fakeVolume(p.vol24, p.buys, p.sells, (p.buyers || 0) + (p.sellers || 0), p.name)).filter(Boolean);
  assert.ok(churn.some(x => x.s === "warn" && /pocas wallets/.test(x.t)), "PONS pools with 15k+ sells from ~250 wallets");
  assert.equal(Risk.fakeVolume(189465, 638, 478, 641), null);
});

test("PAPER: DexScreener $10.5M vs GeckoTerminal ~$0 is an inconsistent-data warning", () => {
  const gt = Risk.poolsFromGT(AUD.paper_pools, PAPER);
  const dexLiq = AUD.paper_dex.reduce((t, p) => t + ((p.liquidity || {}).usd || 0), 0);
  const main = AUD.paper_dex.slice().sort((a, b) => ((b.liquidity || {}).usd || 0) - ((a.liquidity || {}).usd || 0))[0];
  const gtMain = gt.find(p => p.pool === main.pairAddress.toLowerCase());
  const m = Risk.sourceMismatch({ liq: dexLiq, price: Number(main.priceUsd) }, { liq: gt.reduce((t, p) => t + (p.liq || 0), 0), price: gtMain ? gtMain.price : null, poolFound: !!gtMain });
  assert.ok(m); assert.equal(m.s, "warn"); assert.match(m.t, /inconsistentes/);
  assert.equal(Risk.sourceMismatch({ liq: 100000, price: 1 }, { liq: 90000, price: 1.05 }), null);
});

test("early whales: a launch buyer with 5 %+ is flagged even after selling", () => {
  const w = Risk.earlyWhales([{ addr: "0x" + "1".repeat(40), boughtPct: 7.5, pct: 0.1, sold: true }, { addr: "0xc", boughtPct: 30, creator: true }], "0xc");
  assert.equal(w.s, "warn"); assert.match(w.d, /ya vendió/);
  assert.equal(Risk.earlyWhales([{ addr: "0x" + "2".repeat(40), boughtPct: 20, pct: 18, sold: false }]).s, "high");
  assert.equal(Risk.earlyWhales([{ addr: "x", boughtPct: 2 }]), null);
});

test("sale summary: works small + fails big becomes one finding with the max amount", () => {
  const f = Risk.saleSummary([{ eth: 0.01, status: "round_trip_ok" }, { eth: 0.1, status: "round_trip_ok" }, { eth: 0.5, status: "sell_failed" }], { eth: 0.27, tokens: "1.234.567" });
  assert.equal(f.s, "high"); assert.match(f.t, /0.27 ETH/); assert.match(f.d, /0.5 ETH/);
  assert.equal(Risk.saleSummary([{ eth: 0.01, status: "round_trip_ok" }]), null);
});

test("Wilson interval: honest uncertainty for small samples", () => {
  const [lo, hi] = Risk.wilson(33, 58);
  assert.ok(lo > 0.43 && lo < 0.46 && hi > 0.68 && hi < 0.7, lo + " " + hi);
  assert.equal(Risk.wilson(0, 0), null);
});

// ---------- contract analysis ----------
test("selectors are keccak-256 of their signatures; PONS getters match its bytecode", () => {
  const sel = s => globalThis.PBCreator.keccak(Buffer.from(s).toString("hex")).slice(2, 10);
  assert.ok(Contract.RISKY.blacklist.sel.includes(sel("setBots(address[],bool)")));
  assert.ok(Contract.RISKY.mint.sel.includes(sel("mint(address,uint256)")));
  assert.ok(Contract.RISKY.trading.sel.includes(sel("enableTrading()")));
  assert.ok(Contract.GET.maxTx.includes(sel("maxTxAmount()")) && Contract.GET.maxWallet.includes(sel("maxWalletAmount()")));
  assert.equal(Contract.ROLE.hasRole, sel("hasRole(bytes32,address)"));
  assert.deepEqual(Contract.riskyFromCode("6080604052" + "63" + sel("blacklist(address)") + "14"), ["blacklist"]);
});

test("proxies: EIP-1167 minimal proxy (classic and PUSH0) and tax units", () => {
  const impl = "bebebebebebebebebebebebebebebebebebebebe";
  assert.equal(Contract.minimalProxyTarget("0x363d3d373d3d3d363d73" + impl + "5af43d82803e903d91602b57fd5bf3"), "0x" + impl);
  assert.equal(Contract.minimalProxyTarget("0x365f5f375f5f365f73" + impl + "5af43d5f5f3e5f3d91602a57fd5bf3"), "0x" + impl);
  assert.equal(Contract.minimalProxyTarget("0x6080604052"), null);
  assert.equal(Contract.taxPct(5), 5); assert.equal(Contract.taxPct(2500), 25); assert.equal(Contract.taxPct(1e9), null);
});

test("verified ABI: risky names, ERC20Burnable burn is fine, error selectors decode", () => {
  const abi = [{ type: "function", name: "setBots", stateMutability: "nonpayable", inputs: [{ type: "address[]" }, { type: "bool" }] },
               { type: "function", name: "burn", stateMutability: "nonpayable", inputs: [{ type: "uint256" }] },
               { type: "function", name: "burn", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }] },
               { type: "function", name: "maxTxAmount", stateMutability: "view", inputs: [] },
               { type: "function", name: "updateSellFees", stateMutability: "nonpayable", inputs: [] },
               { type: "error", name: "MaxTxExceeded", inputs: [{ type: "address" }, { type: "uint256" }, { type: "uint256" }] }];
  const r = Contract.riskyFromAbi(abi);
  assert.deepEqual(Object.keys(r).sort(), ["balance", "blacklist", "fees"]);
  assert.equal(r.balance.length, 1);
  const e = Contract.errorNames(abi, globalThis.PBCreator.keccak);
  assert.equal(Object.values(e)[0], "MaxTxExceeded");
});

test("contract analyze over a fake RPC: beacon proxy, AccessControl admins, declared taxes", async () => {
  const T = "0x" + "77".repeat(20), B = "0x" + "be".repeat(20), I = "0x" + "11".repeat(20), A = "0x" + "ad".repeat(20);
  const sel = s => globalThis.PBCreator.keccak(Buffer.from(s).toString("hex")).slice(2, 10);
  const w = x => "0x" + BigInt(x).toString(16).padStart(64, "0");
  const code = "0x6080" + "63" + sel("hasRole(bytes32,address)") + "63" + sel("blacklist(address)");
  const rpc = async (m, p) => {
    if (m === "eth_getStorageAt") return p[1] === Contract.SLOT.beacon ? "0x" + B.slice(2).padStart(64, "0") : "0x" + "0".repeat(64);
    if (m === "eth_getCode") return p[0] === I ? "0x6080" + "63" + sel("mint(address,uint256)") : "0x";
    if (m === "eth_call") {
      const to = p[0].to, d = p[0].data.slice(2, 10);
      if (to === B && d === "5c60da1b") return "0x" + I.slice(2).padStart(64, "0");
      if (d === Contract.ROLE.count) return w(1);
      if (d === Contract.ROLE.member) return "0x" + A.slice(2).padStart(64, "0");
      if (d === sel("sellTax()")) return w(2500);
      if (d === sel("buyFee()")) return w(3);
      throw new Error("revert");
    }
    throw new Error(m);
  };
  const r = await Contract.analyze(T, code, rpc);
  assert.equal(r.proxy.kind, "beacon"); assert.equal(r.proxy.impl, I);
  assert.deepEqual(r.roles.admins, [A]);
  assert.equal(r.owner, null);
  assert.deepEqual(r.risky.sort(), ["blacklist", "mint"]);              // the implementation's code is scanned too
  assert.equal(r.taxes.sell, 25); assert.equal(r.taxes.buy, 3);
});
