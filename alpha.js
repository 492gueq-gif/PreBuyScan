/* PreBuyScan Alpha Radar (window.PBAlpha). Pure functions over GeckoTerminal pool data.
 *
 * Alpha Signal Score 0-100 measures OBSERVED ACTIVITY right now (turnover, trades,
 * buyer pressure, acceleration, freshness). It is independent of the Safety Score,
 * says nothing about safety, does not predict price and its predictive value has NOT
 * been validated. A token with a high quick-risk verdict never gets a favourable label.
 * Weights frozen in ALPHA_VERSION; changing them requires a new version.
 */
(function (root) {
  "use strict";
  const ALPHA_VERSION = "alpha-2026.10.23-1";
  const WETH_ID = "robinhood_0x0bd7d308f8e1639fab988df18a8011f41eacad73";
  // Prompt 2.2 starting filters (editable in the UI).
  const DEFAULTS = { age: 12, priority: 6, liq: 15000, vol: 3000, tx: 30, fdv: 1000000 };
  const WEIGHTS = { turnover: 25, trades: 20, buyers: 15, acceleration: 20, newBuyers: 10, freshness: 10 };
  const clip = x => Math.max(0, Math.min(1, x));
  const n0 = x => Number(x) || 0;

  /* Quick market-only risk verdict (same published rules as the explorer lists). */
  function quick(liq, buys, sells, ageH) {
    if (liq == null) return "unk";
    if (liq < 5000 || (buys >= 20 && sells === 0)) return "high";
    if (liq < 25000 || (buys > 0 && sells / buys < 0.15) || (ageH != null && ageH < 1)) return "warn";
    return "ok";
  }

  function signalScore(m) {
    const parts = {
      turnover: m.liq > 0 ? clip(m.vol1 / m.liq) : 0,
      trades: clip(m.tx1 / 200),
      buyers: m.buyers1 + m.sellers1 > 0 ? clip((m.buyers1 / (m.buyers1 + m.sellers1) - 0.5) * 2) : 0,
      acceleration: m.vol1 > 0 ? clip((m.vol15 * 4 / m.vol1 - 1)) : 0,
      newBuyers: m.buyers1 > 0 ? clip((m.buyers15 * 4 / m.buyers1 - 1)) : 0,
      freshness: m.ageH == null ? 0 : m.ageH <= DEFAULTS.priority ? 1 : m.ageH <= DEFAULTS.age ? 0.5 : 0
    };
    let score = 0;
    for (const k of Object.keys(WEIGHTS)) score += WEIGHTS[k] * parts[k];
    return { score: Math.round(score), parts };
  }

  /* Evaluate one GeckoTerminal pool. prev = {liq, at} from this browser's last view, or null. */
  function evaluate(p, cfg, now, prev) {
    cfg = Object.assign({}, DEFAULTS, cfg || {});
    const a = p.attributes || {}, r = p.relationships || {};
    let tid = r.base_token && r.base_token.data && r.base_token.data.id;
    let nm = (a.name || "").split(" / ")[0]; let inv = false;
    if (tid === WETH_ID) { tid = r.quote_token && r.quote_token.data && r.quote_token.data.id; nm = (a.name || "").split(" / ")[1] || nm; inv = true; }
    const t = (tid || "").split("_")[1];
    if (!/^0x[0-9a-f]{40}$/.test(t || "")) return null;
    const v = a.volume_usd || {}, tx = a.transactions || {}, h1 = tx.h1 || {}, m15 = tx.m15 || {};
    const created = a.pool_created_at ? Date.parse(a.pool_created_at) : NaN;
    const ageH = isNaN(created) ? null : (now - created) / 3.6e6;
    const m = { liq: n0(a.reserve_in_usd), fdv: n0(a.fdv_usd || a.market_cap_usd), vol1: n0(v.h1), vol15: n0(v.m15),
                tx1: n0(h1.buys) + n0(h1.sells), buys1: n0(h1.buys), sells1: n0(h1.sells),
                buyers1: n0(h1.buyers), sellers1: n0(h1.sellers), buyers15: n0(m15.buyers), ageH };
    const reasons = [];
    if (ageH == null) reasons.push("edad desconocida");
    else if (ageH > cfg.age) reasons.push("edad");
    if (m.liq < cfg.liq) reasons.push("liquidez");
    if (m.vol1 < cfg.vol) reasons.push("volumen 1 h");
    if (m.tx1 < cfg.tx) reasons.push("transacciones 1 h");
    if (m.fdv && m.fdv > cfg.fdv) reasons.push("FDV");
    const sig = [];
    if (m.vol1 > 0 && m.vol15 * 4 > m.vol1 * 1.3) sig.push("Volumen acelerando (15 min)");
    if (m.buyers1 > 0 && m.buyers1 >= 1.5 * Math.max(1, m.sellers1)) sig.push("Más compradores que vendedores (1 h)");
    if (m.buyers1 > 0 && m.buyers15 * 4 > m.buyers1 * 1.2) sig.push("Compradores únicos en aumento");
    const pc = Number((a.price_change_percentage || {}).h1);
    if (!inv && pc >= 10) sig.push("Precio +" + Math.round(pc) + " % en 1 h");
    const warn = [];
    if (m.buys1 >= 20 && m.sells1 === 0) warn.push("Compras sin ventas (posible venta bloqueada)");
    if (m.liq > 0 && m.vol1 > 5 * m.liq) warn.push("Volumen 5× la liquidez (posible wash trading)");
    if (m.buyers1 > 0 && m.buys1 / m.buyers1 > 8) warn.push("Pocas wallets hacen muchas compras");
    let liqChange = null;
    if (prev && prev.liq > 0 && now - prev.at < 7 * 86400e3) liqChange = { pct: (m.liq / prev.liq - 1) * 100, since: prev.at };
    if (liqChange && liqChange.pct <= -30) warn.push("Liquidez −" + Math.round(-liqChange.pct) + " % desde tu última consulta");
    const q = quick(m.liq, n0((tx.h6 || {}).buys), n0((tx.h6 || {}).sells), ageH);
    const alpha = signalScore(m);
    return { t, pool: String(a.address || "").toLowerCase(), nm, ageH, priority: ageH != null && ageH < cfg.priority,
             liq: m.liq, fdv: m.fdv, vol1: m.vol1, tx1: m.tx1, buys1: m.buys1, sells1: m.sells1,
             pass: reasons.length === 0, reasons, sig, warn, q, alpha: alpha.score, alphaParts: alpha.parts,
             favourable: q !== "high" && warn.length === 0, liqChange,
             price: Number(inv ? a.quote_token_price_usd : a.base_token_price_usd),
             ch: inv ? null : Number((a.price_change_percentage || {}).h24) };
  }

  /* Order: high quick risk last; any manipulation flag after clean rows (activity alone never
     ranks a suspicious pool first); then priority (< 6 h); then Alpha Signal Score. */
  function rank(rows) {
    const seen = new Set();
    return rows.filter(x => x && x.pass && !seen.has(x.t) && seen.add(x.t))
      .sort((a, b) => ((a.q === "high") - (b.q === "high")) || (b.favourable - a.favourable) || (b.priority - a.priority)
        || (b.alpha - a.alpha) || (b.vol1 - a.vol1));
  }

  const api = { ALPHA_VERSION, WETH_ID, DEFAULTS, WEIGHTS, quick, signalScore, evaluate, rank };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PBAlpha = api;
})(typeof window !== "undefined" ? window : globalThis);
