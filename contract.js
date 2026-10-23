/* PreBuyScan contract analysis (window.PBContract). Read-only: eth_getCode, eth_getStorageAt,
 * eth_call and the explorer's verified ABI. Nothing is signed or sent.
 * - Proxies: EIP-1967 (implementation, beacon, admin), legacy ZeppelinOS slot, EIP-1167 minimal
 *   proxies (clones) and EIP-2535 diamonds.
 * - Admin: owner() and common alternatives, AccessControl roles.
 * - Risky functions: bytecode selectors (wide list) and, when verified, the ABI by function name.
 * - Declared taxes and limits read from common getters.
 * Selectors are keccak-256 of the signatures (computed with creator.js keccak; see tests).
 */
(function (root) {
  "use strict";
  const SLOT = {
    impl: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
    beacon: "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50",
    admin: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
    zos: "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3"
  };
  const RISKY = {
    mint: { label: "Puede crear tokens nuevos (mint)", sel: ["40c10f19", "a0712d68", "449a52f8", "94d008ef", "cc872b66", "da1919b3", "22ad0670"] },
    blacklist: { label: "Puede bloquear wallets (lista negra)", sel: ["f9f92be4", "404e5129", "44337ea1", "537df3b6", "153b0d1e", "455a4396", "b515566a", "9c0db5f3", "d34628cc", "273123b7", "00b8cf2a", "d01dd6d2", "9155e083", "13f97a8e", "fb2f3492", "03d29d28", "03c0f5d4", "342aa8b5", "ffecf516", "ca6507af", "ad2bb1b3", "7f49f709", "000af2a1", "8d1fdf2f", "e724529c"] },
    fees: { label: "Puede cambiar las comisiones de compra/venta", sel: ["69fe0e2d", "0b78f9c0", "c647b20e", "c4081a4c", "0cc835a3", "8b4cee08", "6db79437", "22429085", "061c82d0", "8ee88c53", "8095d564", "c17b5b8c", "dc1052e2", "8cd09d50", "667f6526", "625e764c", "52f7c988", "a12a7d61", "2f37aa6d", "9fd8234e", "b2d8f208", "8f02bb5b", "cec10c11"] },
    trading: { label: "Puede pausar o activar el trading", sel: ["8456cb59", "3f4ba83a", "8a8c523c", "c9567bf9", "c2e5ec04", "8f70ccf7", "293230b8", "0d295980", "17700f01", "21c03a97", "f275f64b", "01339c21", "e01af92c"] },
    limits: { label: "Puede limitar cuánto se compra o vende", sel: ["ec28438a", "ea1644d5", "d543dbeb", "203e727e", "c18bc195", "5d0044ca", "bc337182", "5932ead1", "1e293c10", "82bf293c", "1c499ab0", "27a14fc2", "4fc3f41a"] },
    balance: { label: "Puede cambiar o quemar saldos ajenos", sel: ["e30443bc", "9dc29fac", "7a43e23f", "de3e3492"] }
  };
  // ABI names of non-view functions, by category (verified source only).
  const NAME_RULES = [
    ["blacklist", /(black|block|ban|bot|sniper|frozen|freeze)/i],
    ["fees", /^(set|update|change).*(fee|tax)/i],
    ["trading", /^(pause|unpause|enabletrading|opentrading|starttrading|disabletrading|settrading|setswapenabled|launch$)/i],
    ["limits", /^(set|update|remove|change).*(max(tx|wallet|transaction|sell|buy)|limit|cooldown)/i],
    ["mint", /^(mint|_?issue|airdropmint)/i],
    ["balance", /^(setbalance|rebase)/i]
  ];
  const GET = {
    owner: ["8da5cb5b", "893d20e8", "f851a440"],                 // owner(), getOwner(), admin()
    buyTax: ["4f7041a5", "47062402", "42a11095", "40b9a54b", "d85ba063", "59b107b9", "46469afb", "691f224f", "bf5976d3", "c473413a"],
    sellTax: ["cc1776d3", "2b14ca56", "ca9ec199", "590f897e", "6a486a8e", "9d9241ec", "1bff7898", "24024efd", "8199040e", "cffd129c"],
    maxTx: ["8c0b5e22", "7d1db4a5", "c8c8ebe4", "8036d590", "1de12516", "7437681e"],
    maxWallet: ["f8b45b05", "8f9a55c0", "aa4bde28", "66a88d96", "6c0a24eb", "8f3fa860"],
    unlock: ["251c1aa3", "b91d4001", "3c78929e", "602bc62b", "a0ee4501", "69ac5721", "ce0617ec", "3197cbb6", "b9e3e2db"]
  };
  const ROLE = { hasRole: "91d14854", member: "9010d07c", count: "ca15c873", adminRole: "a217fddf" };
  const ZERO32 = "0".repeat(64);
  const strip = h => String(h || "").replace(/^0x/, "").toLowerCase();
  const word = a => strip(a).padStart(64, "0");
  const asAddr = w => "0x" + strip(w).padStart(64, "0").slice(-40);
  const isZeroAddr = a => /^0x0{40}$/.test(a);

  /* Selector present in the dispatcher (PUSH4 <sel>). */
  const hasSel = (code, sels) => sels.some(s => code.includes("63" + s));
  function riskyFromCode(code) {
    code = strip(code);
    return Object.keys(RISKY).filter(k => hasSel(code, RISKY[k].sel));
  }
  /* EIP-1167 minimal proxy (classic and PUSH0 variants) -> implementation address. */
  function minimalProxyTarget(code) {
    const c = strip(code);
    let m = /^363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/.exec(c);
    if (m) return "0x" + m[1];
    m = /^365f5f375f5f365f73([0-9a-f]{40})5af43d5f5f3e5f3d91602a57fd5bf3$/.exec(c);
    return m ? "0x" + m[1] : null;
  }
  /* Risky categories from a verified ABI: state-changing functions by name. */
  function riskyFromAbi(abi) {
    const fns = (abi || []).filter(f => f && f.type === "function" && !/^(view|pure)$/.test(f.stateMutability || ""));
    const out = {};
    for (const f of fns) {
      for (const [k, re] of NAME_RULES) if (re.test(f.name || "")) (out[k] = out[k] || []).push(f.name);
      // burn(address,uint256): someone burns tokens of another wallet (ERC20Burnable's burn(uint256) is fine).
      const ins = f.inputs || [];
      if (/^burn$/i.test(f.name || "") && ins.length === 2 && ins[0].type === "address") (out.balance = out.balance || []).push(f.name);
    }
    return out;
  }
  /* Custom error selector -> name, from a verified ABI (needs a keccak function). */
  function errorNames(abi, keccakHex) {
    const m = {};
    for (const e of abi || []) {
      if (!e || e.type !== "error" || !keccakHex) continue;
      const sig = e.name + "(" + (e.inputs || []).map(i => i.type).join(",") + ")";
      let hex = ""; for (const ch of sig) hex += ch.charCodeAt(0).toString(16).padStart(2, "0");
      m[keccakHex(hex).slice(2, 10)] = e.name;
    }
    return m;
  }
  /* A tax getter value as percent: 0-100 -> %, 101-10000 -> basis points. */
  function taxPct(v) {
    if (v == null) return null; v = Number(v);
    if (!isFinite(v) || v < 0) return null;
    if (v <= 100) return v;
    if (v <= 10000) return v / 100;
    return null;
  }

  /* Live analysis. rpc(method, params) is the page's RPC client. */
  async function analyze(token, code, rpc) {
    const call = async (to, data) => { const r = await rpc("eth_call", [{ to, data: "0x" + strip(data) }, "latest"]); if (!r || r === "0x") throw new Error("empty"); return r; };
    const first = async (to, sels) => { for (const s of sels) { try { return { sel: s, raw: await call(to, s) }; } catch (e) { /* next */ } } return null; };
    const slot = async (k) => { try { const v = await rpc("eth_getStorageAt", [token, SLOT[k], "latest"]); return v && BigInt(v) !== 0n ? asAddr(v) : null; } catch (e) { return null; } };
    const out = { proxy: null, impl: [], admin: null, owner: null, ownerVia: null, roles: null, risky: [], taxes: {}, limits: {} };
    let scan = strip(code);
    // ---- proxies ----
    const clone = minimalProxyTarget(code);
    if (clone) out.proxy = { kind: "eip1167", impl: clone };
    const impl = await slot("impl"), beacon = await slot("beacon"), zos = !impl ? await slot("zos") : null;
    if (impl) out.proxy = { kind: "eip1967", impl };
    else if (beacon) { let bi = null; try { bi = asAddr(await call(beacon, "5c60da1b")); } catch (e) { /* unknown */ } out.proxy = { kind: "beacon", beacon, impl: bi }; }
    else if (zos) out.proxy = { kind: "zos", impl: zos };
    if (!out.proxy && hasSel(scan, ["52ef6b2c", "7a0ed627"])) {
      try {
        const r = strip(await call(token, "52ef6b2c")); const n = Number(BigInt("0x" + r.slice(64, 128)));
        const facets = []; for (let i = 0; i < Math.min(n, 12); i++) facets.push(asAddr(r.slice(128 + i * 64, 192 + i * 64)));
        if (facets.length) out.proxy = { kind: "diamond", facets };
      } catch (e) { /* not a diamond */ }
    }
    out.admin = await slot("admin");
    const targets = out.proxy ? (out.proxy.facets || [out.proxy.impl]).filter(Boolean) : [];
    for (const t of targets) { try { const c = await rpc("eth_getCode", [t, "latest"]); if (c && c !== "0x") { scan += strip(c); out.impl.push(t); } } catch (e) { /* skip */ } }
    // ---- admin ----
    const o = await first(token, GET.owner);
    if (o && strip(o.raw).length >= 64) { out.owner = asAddr(strip(o.raw).slice(0, 64)); out.ownerVia = { "8da5cb5b": "owner()", "893d20e8": "getOwner()", "f851a440": "admin()" }[o.sel]; }
    if (hasSel(scan, [ROLE.hasRole])) {
      out.roles = { accessControl: true, admins: [] };
      try {
        const n = Number(BigInt(await call(token, ROLE.count + ZERO32)));
        out.roles.count = n;
        for (let i = 0; i < Math.min(n, 3); i++) out.roles.admins.push(asAddr(await call(token, ROLE.member + ZERO32 + word(i.toString(16)))));
      } catch (e) { out.roles.enumerable = false; }
    }
    // ---- risky functions ----
    out.risky = riskyFromCode(scan);
    // ---- declared taxes and limits ----
    const num = async sels => { const r = await first(token, sels); return r ? BigInt("0x" + strip(r.raw).slice(0, 64)) : null; };
    const bt = await num(GET.buyTax), st = await num(GET.sellTax);
    out.taxes = { buy: bt == null ? null : taxPct(bt), sell: st == null ? null : taxPct(st), raw: { buy: bt == null ? null : bt.toString(), sell: st == null ? null : st.toString() } };
    const mt = await num(GET.maxTx), mw = await num(GET.maxWallet);
    out.limits = { maxTx: mt == null ? null : mt.toString(), maxWallet: mw == null ? null : mw.toString() };
    return out;
  }

  /* hasRole(DEFAULT_ADMIN_ROLE, who) for candidate addresses (e.g. the deployer). */
  async function adminAmong(token, who, rpc) {
    const found = [];
    for (const a of who.filter(Boolean)) {
      try { const r = await rpc("eth_call", [{ to: token, data: "0x" + ROLE.hasRole + ZERO32 + word(a) }, "latest"]); if (r && BigInt(r) === 1n) found.push(a.toLowerCase()); } catch (e) { /* skip */ }
    }
    return found;
  }

  /* Lock expiry from common getters on a locker contract (seconds since epoch) or null. */
  async function lockUntil(locker, rpc) {
    for (const s of GET.unlock) {
      try {
        const r = await rpc("eth_call", [{ to: locker, data: "0x" + s }, "latest"]);
        if (!r || r === "0x") continue;
        const v = Number(BigInt("0x" + strip(r).slice(0, 64)));
        if (v > 1500000000 && v < 4102444800) return v;          // a plausible timestamp (2017..2100)
      } catch (e) { /* next */ }
    }
    return null;
  }

  const api = { SLOT, RISKY, GET, ROLE, NAME_RULES, hasSel, riskyFromCode, riskyFromAbi, minimalProxyTarget, errorNames, taxPct, analyze, adminAmong, lockUntil, isZeroAddr };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PBContract = api;
})(typeof window !== "undefined" ? window : globalThis);
