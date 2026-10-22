// Offline logic test: fake RPC reproduces a honeypot (buy ok, sell reverts) and a taxed token.
const assert = require("assert");
const S = require("./sellsim.js");
const ok = h => ({ status: "0x1", returnData: h, gasUsed: "0x5208" });
const w = n => "0x" + BigInt(n).toString(16).padStart(64, "0");
function fakeFetch(mode) {
  let sims = 0;
  return async (url, opt) => {
    const req = JSON.parse(opt.body); let result;
    if (req.method === "eth_call") result = w(3000);                         // V3 fee()
    if (req.method === "eth_call" && req.params[0].data === "0x0dfe1681") result = w("0x0bd7d308f8e1639fab988df18a8011f41eacad73");
    if (req.method === "eth_call" && req.params[0].data === "0xd21220a7") result = w("0x" + "a".repeat(40));
    if (req.method === "eth_simulateV1") {
      sims++;
      const n = req.params[0].blockStateCalls[0].calls.length;
      const calls = Array.from({ length: n }, () => ok(w(0)));
      calls[2] = ok(w(1000));                                                  // tokens after buy
      if (sims === 2) {
        const sell = n - 3;                                                    // [... approve, sell, measureAfter, tokAfter]
        if (mode === "honeypot") calls[sell] = { status: "0x0", returnData: "0x", gasUsed: "0x1" };
        calls[n - 2] = ok(w(mode === "tax" ? 6000000000000000n : 0));         // WETH after sale
      }
      result = [{ calls }];
    }
    return { ok: true, status: 200, json: async () => ({ jsonrpc: "2.0", id: req.id, result }) };
  };
}
(async () => {
  const pair = { pairAddress: "0x" + "c".repeat(40), labels: ["v3"] };
  global.fetch = fakeFetch("honeypot");
  let r = await S.simulate("0x" + "a".repeat(40), pair);
  assert.strictEqual(r.status, "sell_failed", JSON.stringify(r));
  global.fetch = fakeFetch("tax");
  r = await S.simulate("0x" + "a".repeat(40), pair);
  assert.strictEqual(r.status, "round_trip_ok"); assert.strictEqual(r.retention, 0.6);
  global.fetch = async () => { throw new Error("offline"); };
  r = await S.simulate("0x" + "a".repeat(40), pair);
  assert.strictEqual(r.status, "unknown");
  console.log("offline sellsim tests OK");
})().catch(e => { console.error(e); process.exit(1); });
