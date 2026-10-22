// Live read-only check of sellsim.js against real Robinhood Chain tokens (no keys, no transactions).
const S = require("./sellsim.js");
const CASES = [
  ["PONS v3", "0x39dbed3a2bd333467115de45665cc57f813c4571"],
  ["v2 grande", "0x40d69ee3eab1014c58655302a3b2582c202de292"],
  ["v4 a01f", "0xa01ff10774cfe53c3fbc1d7d124c42e19f6afcbd"],
  ["v4 2796", "0x2796cdf7328916e0a6c04c296a72c5c6d70b3aee"],
  ["v4 15d0", "0x15d0776c80ce1c7d27a06cbd5a09102e907c23ab"],
  ["sospechoso v2 0 ventas", "0xdb65443d327ee96dcbf272f68fff326b3b01f8f1"],
  ["sospechoso v4 0 ventas", "0xe1e9baf727922bf9e01013cd67452afe057109d0"],
  ["sospechoso v4 0 ventas b", "0x98cde90cd3435d9137a661993396d22fae950ff2"],
];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const results = [];
  for (const [label, token] of CASES) {
    let pair = null;
    try {
      const r = await fetch("https://api.dexscreener.com/tokens/v1/robinhood/" + token);
      const pairs = await r.json();
      if (Array.isArray(pairs) && pairs.length) pair = pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
    } catch (e) {}
    let res;
    if (!pair) res = { status: "no_pair" };
    else {
      res = await S.simulate(token, pair);
      if (res.kind === "v4" && res.status === "unknown") {          // try the other UniversalRouter
        const alt = await S.simulate(token, pair, { v4Router: "0x204faca1764b154221e35c0d20abb3c525710498" });
        res.altRouter = alt;
      }
    }
    const line = { label, token, dex: pair && pair.dexId, labels: pair && pair.labels, liq: pair && pair.liquidity?.usd,
      sells24: pair && pair.txns?.h24?.sells, ...res };
    results.push(line);
    console.log(JSON.stringify(line));
    console.log("::notice title=" + label.replace(/[^a-z0-9]/gi, "_") + "::" + JSON.stringify(line).replace(/%/g, "%25"));
    await sleep(2500);
  }
})();
