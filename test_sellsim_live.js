// Live read-only check of sellsim.js against real Robinhood Chain tokens (no keys, no transactions).
const S = require("./sellsim.js");
const FIXED = [["PONS v3", "0x39dbed3a2bd333467115de45665cc57f813c4571"], ["v4 a01f ETH", "0xa01ff10774cfe53c3fbc1d7d124c42e19f6afcbd"],
               ["v4 2796 (no ETH)", "0x2796cdf7328916e0a6c04c296a72c5c6d70b3aee"]];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function j(url) { const r = await fetch(url, { headers: { Accept: "application/json" } }); if (!r.ok) throw new Error(url + " " + r.status); return r.json(); }
async function bestPair(token) {
  const pairs = await j("https://api.dexscreener.com/tokens/v1/robinhood/" + token);
  return Array.isArray(pairs) && pairs.length ? pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0] : null;
}
(async () => {
  const cases = FIXED.slice();
  const pools = [];
  for (let page = 1; page <= 3; page++) {
    try { pools.push(...(await j("https://api.geckoterminal.com/api/v2/networks/robinhood/new_pools?page=" + page)).data); } catch (e) { console.log("gecko", e.message); }
    await sleep(2500);
  }
  const info = pools.map(p => ({ token: p.relationships.base_token.data.id.split("_")[1], dex: p.relationships.dex.data.id,
    buys: p.attributes.transactions?.h24?.buys || 0, sells: p.attributes.transactions?.h24?.sells || 0, liq: Number(p.attributes.reserve_in_usd || 0) }));
  const pick = (f, n, label) => info.filter(f).slice(0, n).forEach(x => cases.push([label + " " + x.dex + " b" + x.buys + "/s" + x.sells, x.token]));
  pick(x => x.buys >= 10 && x.sells === 0 && x.liq > 500, 4, "0-ventas");
  pick(x => /v2/.test(x.dex) && x.sells > 0 && x.liq > 2000, 2, "v2");
  pick(x => /v4/.test(x.dex) && x.sells > 0 && x.liq > 5000, 3, "v4");
  console.log("::notice title=pool_dexes::" + JSON.stringify([...new Set(info.map(x => x.dex))]));
  for (const [label, token] of cases) {
    let pair = null; try { pair = await bestPair(token); } catch (e) {}
    const res = pair ? await S.simulate(token, pair) : { status: "no_pair" };
    const line = { label, token, labels: pair && pair.labels, liq: pair && Math.round(pair.liquidity?.usd || 0),
      dex24: pair && pair.txns?.h24, ...res };
    delete line.spentWei; delete line.boughtRaw; delete line.tokensLeftRaw;
    console.log(JSON.stringify(line));
    console.log("::notice title=" + label.replace(/[^a-z0-9]/gi, "_").slice(0, 40) + "::" + JSON.stringify(line).replace(/%/g, "%25"));
    await sleep(2000);
  }
})();
