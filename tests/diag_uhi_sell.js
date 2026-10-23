// REAL: why does the UHI sale fail above ~0.022 ETH in the simulation? Try routers, sizes, and partial sells.
const S = require("../sellsim.js");
const pair = { pairAddress: "0x462958d20cdaba313be960ee91f1fa783f0755791754edd930c3707f2a906025", labels: ["v4"], pairCreatedAt: 1792412329000 };
const T = "0xe01ada02fb4d1951cdb8cbb761d509db2ff02c94";
const eth = x => (BigInt(Math.round(x * 1e6)) * 10n ** 12n).toString();
(async () => {
  const out = {};
  const key = await S.v4Key(pair.pairAddress, pair.pairCreatedAt);
  out.key = { c0: key.currency0, c1: key.currency1, fee: String(key.fee), ts: String(key.tickSpacing), hooks: key.hooks };
  for (const [name, o] of [["r0_0.01", { buyWei: eth(0.01) }], ["r0_0.03", { buyWei: eth(0.03) }], ["r0_0.1", { buyWei: eth(0.1) }],
                           ["r1_0.1", { buyWei: eth(0.1), v4Router: "0x204faca1764b154221e35c0d20abb3c525710498" }], ["r0_0.1_delay", { buyWei: eth(0.1), delaySec: 60 }]]) {
    const r = await S.simulate(T, pair, o);
    out[name] = { status: r.status, ret: r.retention, bought: r.boughtRaw, revert: r.revert && r.revert.slice(0, 200), err: r.error };
  }
  console.log(JSON.stringify(out, null, 1));
  console.log("::notice title=uhi_sell::" + JSON.stringify(out).slice(0, 3800));
})();
