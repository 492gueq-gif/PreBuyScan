/* PreBuyScan wallet profile (read-only): who funded a wallet, which tokens it created and how
 * they ended, how many wallets it funded, and which tokens it traded recently. Public explorer,
 * RPC and DexScreener data only; nothing is signed or sent. Uses PBCreator's paced helpers.
 */
(function (root) {
  "use strict";
  const BS = "https://robinhoodchain.blockscout.com/api";
  const DEX = "https://api.dexscreener.com/tokens/v1/robinhood/";
  const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
  const PLATFORM_NONCE = 500;
  const lc = a => String(a || "").toLowerCase();

  async function liquidityOf(C, tokens) {
    const out = {};
    for (let i = 0; i < tokens.length; i += 30) {
      const chunk = tokens.slice(i, i + 30);
      try {
        const ps = await C._get(DEX + chunk.join(","), 10000);
        chunk.forEach(t => { out[t] = { liq: 0, name: null }; });
        for (const p of ps || []) {
          for (const side of [p.baseToken, p.quoteToken]) {
            const b = lc(side && side.address);
            if (!out[b]) continue;
            out[b].liq = Math.max(out[b].liq, (p.liquidity && p.liquidity.usd) || 0);
            out[b].name = out[b].name || (side && side.symbol) || null;
          }
        }
      } catch (e) { chunk.forEach(t => { out[t] = null; }); }
    }
    return out;
  }

  // Pure: turn the collected facts into findings.
  function assess(p) {
    const checks = [];
    const add = (s, t, d) => checks.push({ s, t, d });
    if (p.platform) add("unk", "Wallet de plataforma o servicio", "Tiene " + p.nonce.toLocaleString((globalThis.PBI18N?.locale||"es-MX")) + " transacciones: es un servicio (plataforma de lanzamiento, exchange o bot), no una persona. Sus tokens no hablan de un solo creador.");
    const known = p.created.filter(t => t.liq != null);
    const dead = known.filter(t => t.liq < 1000).length;
    const nCreated = Math.max(p.created.length, (p.db && p.db.launched) || 0);
    if (!p.platform) {
      if (known.length >= 3 && dead / known.length >= 0.7) add("high", "Creador serial: " + nCreated + " tokens, " + dead + " muertos", dead + " de " + known.length + " tokens que creó ya no tienen liquidez (menos de $1,000).");
      else if (dead > 0) add("warn", dead === 1 ? "Creó 1 token que ya murió" : "Creó " + dead + " tokens que ya murieron", "De " + known.length + " tokens revisados que creó, " + dead + (dead === 1 ? " ya no tiene" : " ya no tienen") + " liquidez.");
      else if (nCreated >= 3) add("warn", "Lanza tokens en serie: " + nCreated, "Creó " + nCreated + " tokens; los revisados siguen con liquidez por ahora.");
      else if (nCreated > 0) add("ok", "Sus tokens siguen vivos", "Creó " + nCreated + (nCreated === 1 ? " token y sigue" : " tokens y siguen") + " con liquidez.");
      else if (p.createdKnown) add("ok", "No ha creado tokens", "No encontramos tokens creados por esta wallet" + (p.historyPartial ? " en sus transacciones recientes." : "."));
      else add("unk", "Tokens creados no revisados", "No se pudo consultar su historial completo.");
    }
    if (p.fundedFresh >= 10) add("high", "Fondeó a " + p.fundedFresh + " wallets nuevas", "Mandó ETH a " + p.fundedFresh + " wallets sin actividad previa: típico de quien prepara wallets para comprar en bloque (bundle).");
    else if (p.fundedFresh >= 3) add("warn", "Fondeó a " + p.fundedFresh + " wallets nuevas", "Mandó ETH a varias wallets sin actividad previa.");
    if (p.funder) {
      if (p.funderPlatform) add("ok", "Fondeada desde un servicio grande", "Su primer ETH vino de " + short(p.funder) + " (" + p.funderNonce.toLocaleString((globalThis.PBI18N?.locale||"es-MX")) + " transacciones: exchange, puente o servicio).");
      else if (p.funderCreated >= 3) add("high", "La fondeó un creador serial", "Su primer ETH vino de " + short(p.funder) + ", que creó " + p.funderCreated + " tokens.");
    }
    if (p.ageDays != null && p.ageDays < 1 && !p.platform) add("warn", "Wallet recién creada", "Su primera transacción fue hace menos de 24 h.");
    return checks;
  }
  const short = a => a.slice(0, 6) + "…" + a.slice(-4);

  async function build(addr, opts = {}) {
    const C = root.PBCreator; if (!C) throw new Error("PBCreator missing");
    const progress = opts.progress || (() => {});
    C._budget(opts.budgetMs || 45000);
    addr = lc(addr);
    const p = { addr, created: [], traded: [], funded: [], fundedFresh: 0, partial: [] };
    try { p.nonce = Number(BigInt(await C._rpc("eth_getTransactionCount", [addr, "latest"]))); } catch (e) { p.nonce = null; }
    p.platform = p.nonce != null && p.nonce > PLATFORM_NONCE;
    const db = opts.db || null;
    const K = db && db.creators && db.creators[addr];
    progress("Buscando quién la fondeó…");
    try {
      const f = await C._firstFunder(addr);
      p.funder = f.funder; p.established = !!f.established; p.fundedAt = f.ts || null;
      if (p.funder) {
        try { p.funderNonce = Number(BigInt(await C._rpc("eth_getTransactionCount", [p.funder, "latest"]))); } catch (e) { p.funderNonce = null; }
        p.funderPlatform = p.funderNonce != null && p.funderNonce > PLATFORM_NONCE;
        const FK = db && db.creators && db.creators[p.funder];
        p.funderCreated = FK && !FK[7] ? FK[0] : 0;
      }
    } catch (e) { p.partial.push("fondeo"); }
    progress("Buscando tokens que creó…");
    const created = new Set(K ? K[6] : []);
    try {
      const j = await C._get(BS + "?module=account&action=txlist&address=" + addr + "&sort=desc&page=1&offset=200", 15000);
      const txs = Array.isArray(j.result) ? j.result : [];
      txs.filter(t => t.contractAddress && t.isError !== "1").forEach(t => created.add(lc(t.contractAddress)));
      p.createdKnown = true; p.historyPartial = txs.length >= 200;
      const oldest = txs[txs.length - 1];
      if (!p.historyPartial && oldest) p.ageDays = (Date.now() / 1000 - Number(oldest.timeStamp)) / 86400;
    } catch (e) { p.createdKnown = !!K; p.partial.push("historial"); }
    if (p.ageDays == null && p.fundedAt) p.ageDays = (Date.now() - p.fundedAt) / 86400e3;
    progress("Buscando a quién fondeó…");
    try {
      const j = await C._get(BS + "/v2/addresses/" + addr + "/transactions?filter=from", 12000);
      const outs = (j.items || []).filter(t => t.to && t.to.hash && !t.to.is_contract && BigInt(t.value || "0") > 0n);
      const uniq = [...new Set(outs.map(t => lc(t.to.hash)))];
      p.funded = uniq.slice(0, 40);
      // "Fresh" = recipient's first incoming ETH came from this wallet.
      const sample = uniq.slice(0, 12);
      await Promise.all(sample.map(async w => {
        try { const f = await C._firstFunder(w); if (f.funder === addr) p.fundedFresh++; } catch (e) { /* skip */ }
      }));
      p.fundedSample = sample.length; p.fundedMore = !!j.next_page_params;
    } catch (e) { p.partial.push("wallets fondeadas"); }
    progress("Revisando tokens con los que operó…");
    try {
      const j = await C._get(BS + "/v2/addresses/" + addr + "/token-transfers?type=ERC-20", 12000);
      const seen = new Map();
      for (const it of j.items || []) {
        const t = lc(it.token && (it.token.address_hash || it.token.address));
        if (!t || t === WETH || seen.has(t)) continue;
        seen.set(t, { token: t, symbol: it.token.symbol || null, ts: it.timestamp ? Date.parse(it.timestamp) : null,
          dir: lc(it.to && it.to.hash) === addr ? "recibió" : "envió" });
      }
      p.traded = [...seen.values()].slice(0, 12);
    } catch (e) { p.partial.push("tokens recientes"); }
    const createdList = [...created].slice(0, 30);
    const liq = await liquidityOf(C, [...new Set([...createdList, ...p.traded.map(t => t.token)])]);
    p.created = createdList.map(t => ({ token: t, liq: liq[t] ? liq[t].liq : null, name: liq[t] ? liq[t].name : null }));
    p.traded.forEach(t => { const l = liq[t.token]; t.liq = l ? l.liq : null; t.symbol = t.symbol || (l && l.name); });
    p.db = K ? { launched: K[0], dead: K[1], alive: K[2], pending: K[3], first: K[4], platform: !!K[7] } : null;
    if (K && K[7]) p.platform = true;
    p.checks = assess(p);
    return p;
  }

  const api = { build, assess };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PBProfile = api;
})(typeof window !== "undefined" ? window : globalThis);
