/* PreBuyScan market and holder risk rules (window.PBRisk). Pure functions, no network.
 * Inputs are the public data the page already fetches (DexScreener pairs, GeckoTerminal pools,
 * explorer holders, launch snipers). Each rule returns a finding {s, t, d, src} or null.
 * Thresholds are fixed here and covered by tests/unit.test.js.
 */
(function (root) {
  "use strict";
  const n0 = x => (x == null || x === "" || isNaN(Number(x)) ? null : Number(x));
  const usd = v => v == null ? "—" : "$" + Number(v).toLocaleString("es-MX", { maximumFractionDigits: v < 1 ? 6 : 0 });
  const pctTxt = v => (Math.round(v * 100) / 100).toLocaleString("es-MX") + " %";
  const lc = s => String(s || "").toLowerCase();
  const short = a => a.slice(0, 6) + "…" + a.slice(-4);
  const GT_SRC = "GeckoTerminal (todos los pools del token)";

  /* GeckoTerminal /tokens/{t}/pools -> normalized pools where `token` trades. */
  function poolsFromGT(json, token) {
    token = lc(token);
    return ((json && json.data) || []).map(p => {
      const a = p.attributes || {}, r = p.relationships || {};
      const base = lc(((r.base_token || {}).data || {}).id).split("_").pop();
      const isBase = base === token;
      const t = (a.transactions || {}).h24 || {};
      const m = /([\d.]+)%\s*$/.exec(a.name || "");
      return { pool: lc(a.address), name: a.name || "", dex: lc(((r.dex || {}).data || {}).id), liq: n0(a.reserve_in_usd),
               vol24: n0((a.volume_usd || {}).h24), buys: n0(t.buys) || 0, sells: n0(t.sells) || 0,
               buyers: n0(t.buyers), sellers: n0(t.sellers), fee: m ? Number(m[1]) : null,
               price: n0(isBase ? a.base_token_price_usd : a.quote_token_price_usd) };
    });
  }

  /* All pools together: aggregated liquidity/volume and risky secondary pools. */
  function multiPool(gtPools, mainPool) {
    const main = lc(mainPool);
    const pools = (gtPools || []).filter(p => p.liq != null);
    const out = { n: pools.length, totalLiq: 0, totalVol: 0, findings: [] };
    if (!pools.length) return out;
    for (const p of pools) { out.totalLiq += p.liq || 0; out.totalVol += p.vol24 || 0; }
    const ref = pools.find(p => p.pool === main) || pools.slice().sort((a, b) => (b.liq || 0) - (a.liq || 0))[0];
    const others = pools.filter(p => p !== ref);
    const abusive = others.filter(p => p.fee != null && p.fee >= 10);
    if (abusive.length) out.findings.push({ s: "warn", src: GT_SRC, t: abusive.length === 1 ? "Un pool con comisión abusiva" : abusive.length + " pools con comisión abusiva",
      d: "Hay pools de este token con comisión de " + abusive.map(p => p.fee + " %").slice(0, 4).join(", ") + ": quien compre o venda ahí pierde esa parte. Usa solo el pool principal." });
    // Volume without liquidity: a small pool (< $25k) that moves 20x+ its liquidity in a day ($10k+) is churned,
    // not traded. Large pools with high turnover are covered by the volume/liquidity check of the main pair.
    const hollow = pools.filter(p => (p.vol24 || 0) >= 10000 && (p.liq || 0) < 25000 && (!p.liq || p.vol24 / p.liq >= 20));
    if (hollow.length) {
      const hv = hollow.reduce((t, p) => t + p.vol24, 0), share = out.totalVol ? hv / out.totalVol : 0;
      const w = hollow.sort((a, b) => b.vol24 - a.vol24)[0];
      out.findings.push({ s: share >= 0.5 ? "high" : "warn", src: GT_SRC, t: "Volumen sin liquidez detrás",
        d: (hollow.length === 1 ? "Un pool" : hollow.length + " pools") + " mueven mucho más que su liquidez (p. ej. " + w.name + ": " + usd(w.vol24) + " en 24 h con " + usd(w.liq) + " de liquidez)" +
           (share >= 0.5 ? ", y son " + Math.round(share * 100) + " % del volumen del token: el volumen que ves no es demanda real." : ": parte del volumen no es demanda real.") });
    }
    // Same token, very different price in a liquid pool: arbitrage is not closing the gap (blocked or fake pool).
    if (ref.price) {
      const off = others.filter(p => (p.liq || 0) >= 1000 && p.price && Math.abs(p.price / ref.price - 1) >= 0.25);
      if (off.length) { const w = off[0]; out.findings.push({ s: "warn", src: GT_SRC, t: "Precio distinto entre pools",
        d: w.name + " cotiza a " + usd(w.price) + " frente a " + usd(ref.price) + " en el pool principal (" + Math.round((w.price / ref.price - 1) * 100) + " %). Si el arbitraje no cierra la diferencia, algo impide operar en uno de ellos." }); }
    }
    out.mainShare = out.totalLiq ? (ref.liq || 0) / out.totalLiq : null;
    return out;
  }

  /* Fake volume: average dollars per trade, and trades per wallet. */
  function fakeVolume(vol24, buys, sells, traders, label) {
    vol24 = n0(vol24); const tx = (n0(buys) || 0) + (n0(sells) || 0);
    if (!vol24) return null;
    const where = label ? " (" + label + ")" : "";
    if (vol24 >= 100000 && (tx === 0 || (tx < 50 && vol24 / tx >= 20000)))
      return { s: "high", t: "Volumen anómalo", d: usd(vol24) + " de volumen en 24 h con solo " + tx + " operaciones" + where + (tx ? " (" + usd(vol24 / tx) + " por operación)" : "") + ": no es actividad real; no lo tomes como señal de demanda." };
    traders = n0(traders);
    if (tx >= 1000 && traders && tx / traders >= 30)
      return { s: "warn", t: "Operaciones repetidas por pocas wallets", d: num(tx) + " operaciones de solo " + num(traders) + " wallets en 24 h" + where + " (" + Math.round(tx / traders) + " por wallet): típico de bots que inflan la actividad." };
    return null;
  }
  const num = v => Number(v).toLocaleString("es-MX");

  /* DexScreener vs GeckoTerminal for the SAME pool (the main pair): liquidity and price. Different pool
     counts are normal (DexScreener lists fewer pools); disagreement on the same pool is not. */
  function sourceMismatch(dex, gt) {
    // dex: {liq, price}; gt: {liq, price, poolFound} for the same pool address
    if (!dex || !gt || dex.liq == null) return null;
    if (gt.poolFound === false) {
      if (dex.liq >= 10000) return { s: "warn", src: "DexScreener vs. GeckoTerminal", t: "Datos inconsistentes entre fuentes",
        d: "DexScreener muestra el pool principal con " + usd(dex.liq) + " de liquidez, pero GeckoTerminal no lo tiene. Confía menos en las cifras de mercado." };
      return null;
    }
    if (gt.liq == null) return null;
    const hi = Math.max(dex.liq, gt.liq), lo = Math.min(dex.liq, gt.liq);
    if (hi >= 10000 && lo / hi < 1 / 3)
      return { s: "warn", src: "DexScreener vs. GeckoTerminal", t: "Datos inconsistentes entre fuentes",
        d: "Liquidez según DexScreener: " + usd(dex.liq) + "; según GeckoTerminal: " + usd(gt.liq) + (gt.poolFound === false ? " (GeckoTerminal no tiene el pool principal)" : "") + ". Una de las dos fuentes está equivocada o el pool es irregular: confía menos en las cifras de mercado." };
    if (dex.price && gt.price && Math.abs(dex.price / gt.price - 1) >= 0.25)
      return { s: "warn", src: "DexScreener vs. GeckoTerminal", t: "Datos inconsistentes entre fuentes",
        d: "Precio según DexScreener: " + usd(dex.price) + "; según GeckoTerminal: " + usd(gt.price) + ". Confía menos en las cifras de mercado." };
    return null;
  }

  /* Share of the supply sitting in pools (the only tokens buyers can actually buy). */
  function poolSupply(pct, fdv) {
    if (pct == null || !(fdv >= 100000)) return null;
    if (pct < 2) return { s: "warn", t: "Precio frágil: solo " + pctTxt(pct) + " del suministro está en los pools",
      d: "El precio se forma con muy pocos tokens; el resto (" + pctTxt(100 - pct) + ") está en wallets. Si una parte pequeña de eso se vende, el precio se desploma. El FDV de " + usd(fdv) + " no es realizable." };
    return null;
  }

  /* Many wallets with almost the same balance: an airdrop or one owner split across wallets. */
  function clonedBalances(holders, opt) {
    opt = Object.assign({ band: 0.03, minPct: 0.05, warnN: 6, highN: 10 }, opt || {});
    const xs = (holders || []).filter(h => !h.contract && h.pct >= opt.minPct).map(h => ({ addr: h.addr, pct: h.pct })).sort((a, b) => a.pct - b.pct);
    let best = [];
    for (let i = 0, j = 0; j < xs.length; j++) {
      while (xs[j].pct > xs[i].pct * (1 + opt.band)) i++;
      if (j - i + 1 > best.length) best = xs.slice(i, j + 1);
    }
    if (best.length < opt.warnN) return null;
    const total = best.reduce((t, h) => t + h.pct, 0);
    return { n: best.length, lo: best[0].pct, hi: best[best.length - 1].pct, total, wallets: best.map(h => h.addr),
      finding: { s: best.length >= opt.highN ? "high" : "warn", t: best.length + " wallets con saldos casi idénticos",
        d: best.length + " holders tienen entre " + pctTxt(best[0].pct) + " y " + pctTxt(best[best.length - 1].pct) + " del suministro cada uno (" + pctTxt(total) + " en total). Saldos clonados suelen ser un airdrop o una sola persona repartida en muchas wallets que puede vender a la vez." } };
  }

  /* Launch buyers that got a big slice of the supply, even if they already sold. */
  function earlyWhales(wallets, creator, X) {
    X = X || 5;
    const big = (wallets || []).filter(w => w.addr !== creator && w.boughtPct != null && w.boughtPct >= X).sort((a, b) => b.boughtPct - a.boughtPct);
    if (!big.length) return null;
    const w = big[0], sold = !!w.sold;
    return { s: w.boughtPct >= 15 && !sold ? "high" : "warn", t: big.length === 1 ? "Un comprador del lanzamiento llegó a tener " + pctTxt(w.boughtPct) : big.length + " compradores del lanzamiento tuvieron más de " + X + " % cada uno",
      d: short(w.addr) + " compró " + pctTxt(w.boughtPct) + " del suministro en el primer minuto" + (sold ? " y ya vendió la mayor parte: quien entra así suele salir sobre las compras de la gente." : " y hoy tiene " + (w.pct != null ? pctTxt(w.pct) : "una parte") + ".") };
  }

  /* One clear finding for the sale across sizes (no "works" + "fails" contradiction). */
  function saleSummary(sizes, maxOk) {
    if (!sizes || !sizes.length) return null;
    const ok = sizes.filter(x => x.status === "round_trip_ok"), bad = sizes.filter(x => x.status === "sell_failed" || x.status === "buy_failed");
    if (!ok.length || !bad.length) return null;
    const firstBad = bad.sort((a, b) => a.eth - b.eth)[0];
    const lim = maxOk && maxOk.eth ? maxOk.eth : Math.max(...ok.map(x => x.eth));
    return { s: "high", t: "Solo se puede vender hasta ~" + lim + " ETH",
      d: "La venta simulada funciona con montos pequeños pero " + (firstBad.status === "buy_failed" ? "la compra" : "la venta") + " falla desde " + firstBad.eth + " ETH." +
         (maxOk && maxOk.tokens ? " Monto máximo vendible encontrado: ~" + maxOk.eth + " ETH (" + maxOk.tokens + " tokens)." : "") +
         (maxOk && maxOk.cause ? " Causa probable: " + maxOk.cause + "." : "") };
  }

  /* 95 % Wilson interval for a proportion k/n. */
  function wilson(k, n) {
    if (!n) return null;
    const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
    return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
  }

  const api = { poolsFromGT, multiPool, fakeVolume, sourceMismatch, poolSupply, clonedBalances, earlyWhales, saleSummary, wilson };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PBRisk = api;
})(typeof window !== "undefined" ? window : globalThis);
