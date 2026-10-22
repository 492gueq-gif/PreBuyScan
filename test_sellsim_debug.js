const S = require("./sellsim.js");
(async () => {
  for (const token of ["0x1b282927b9c5d39d7161f51af3203b44b1a56213"]) {
    const pairs = await (await fetch("https://api.dexscreener.com/tokens/v1/robinhood/" + token)).json();
    const pair = pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
    const key = await S.v4Key(pair.pairAddress.toLowerCase(), pair.pairCreatedAt);
    console.log("::notice title=key::" + JSON.stringify(key, (k, v) => typeof v === "bigint" ? v.toString() : v));
    for (const router of ["0x8876789976decbfcbbbe364623c63652db8c0904", "0x204faca1764b154221e35c0d20abb3c525710498"]) {
      const r = await S.simulate(token, pair, { v4Router: router });
      console.log("::notice title=r_" + router.slice(0, 6) + "::" + JSON.stringify(r));
    }
  }
})();
