/* PreBuyScan: creator reputation, liquidity control and holder concentration (read-only).
 * Uses the public Blockscout explorer of Robinhood Chain, DexScreener and the public RPC.
 * Nothing is signed or sent. Works in the browser (window.PBCreator) and in Node 18+.
 */
(function (root) {
  "use strict";
  const BS = "https://robinhoodchain.blockscout.com/api";
  const DEX = "https://api.dexscreener.com/tokens/v1/robinhood/";
  const V4_PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
  const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
  const BURN = new Set(["0x0000000000000000000000000000000000000000", "0x000000000000000000000000000000000000dead"]);
  const ZERO = "0x0000000000000000000000000000000000000000";
  const lc = a => String(a || "").toLowerCase();
  const strip = h => String(h).replace(/^0x/, "").toLowerCase();
  const word = n => BigInt.asUintN(256, BigInt(n)).toString(16).padStart(64, "0");
  const addrW = a => strip(a).padStart(64, "0");
  const pause = ms => new Promise(s => setTimeout(s, ms));

  // ---------- keccak-256 (for V4 pool ids and storage slots) ----------
  const RC = ["0x1", "0x8082", "0x800000000000808a", "0x8000000080008000", "0x808b", "0x80000001", "0x8000000080008081",
    "0x8000000000008009", "0x8a", "0x88", "0x80008009", "0x8000000a", "0x8000808b", "0x800000000000008b", "0x8000000000008089",
    "0x8000000000008003", "0x8000000000008002", "0x8000000000000080", "0x800a", "0x800000008000000a", "0x8000000080008081",
    "0x8000000000008080", "0x80000001", "0x8000000080008008"].map(BigInt);
  const ROT = [[0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61], [28, 55, 25, 21, 56], [27, 20, 39, 8, 14]];
  const M64 = (1n << 64n) - 1n;
  const rol = (x, n) => n ? ((x << BigInt(n)) | (x >> BigInt(64 - n))) & M64 : x;
  function keccak(hex) {
    const msg = strip(hex); const bytes = [];
    for (let i = 0; i < msg.length; i += 2) bytes.push(parseInt(msg.slice(i, i + 2), 16));
    bytes.push(1); while (bytes.length % 136) bytes.push(0); bytes[bytes.length - 1] |= 0x80;
    let A = Array.from({ length: 5 }, () => Array(5).fill(0n));
    for (let o = 0; o < bytes.length; o += 136) {
      for (let j = 0; j < 17; j++) {
        let v = 0n; for (let k = 7; k >= 0; k--) v = (v << 8n) | BigInt(bytes[o + 8 * j + k]);
        A[j % 5][Math.floor(j / 5)] ^= v;
      }
      for (const rc of RC) {
        const C = A.map(c => c[0] ^ c[1] ^ c[2] ^ c[3] ^ c[4]);
        const D = C.map((_, x) => C[(x + 4) % 5] ^ rol(C[(x + 1) % 5], 1));
        A = A.map((c, x) => c.map(v => v ^ D[x]));
        const B = Array.from({ length: 5 }, () => Array(5).fill(0n));
        for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) B[y][(2 * x + 3 * y) % 5] = rol(A[x][y], ROT[x][y]);
        A = B.map((c, x) => c.map((v, y) => v ^ (~B[(x + 1) % 5][y] & M64 & B[(x + 2) % 5][y])));
        A[0][0] ^= rc;
      }
    }
    let out = "";
    for (let j = 0; j < 4; j++) { let v = A[j % 5][Math.floor(j / 5)]; for (let k = 0; k < 8; k++) { out += (v & 255n).toString(16).padStart(2, "0"); v >>= 8n; } }
    return "0x" + out;
  }

  // ---------- network helpers ----------
  let last = 0;
  // Hard time budget for the whole explorer section: a slow or rate-limited explorer must never
  // freeze the report. Past the deadline every request fails fast and the check shows "Sin datos".
  let deadline = Infinity;
  async function getJSON(url, ms = 10000) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (Date.now() > deadline) throw new Error("time budget");
      const wait = 250 - (Date.now() - last); if (wait > 0) await pause(wait); last = Date.now();
      ms = Math.max(1000, Math.min(ms, deadline - Date.now()));
      const c = typeof AbortController !== "undefined" ? new AbortController() : null;
      const t = c ? setTimeout(() => c.abort(), ms) : null;
      try {
        const r = await fetch(url, { signal: c ? c.signal : undefined });
        if (r.status === 429 || r.status >= 500) { await pause(1000 * (attempt + 1)); continue; }
        if (!r.ok) throw Object.assign(new Error("HTTP " + r.status), { final: true });
        return await r.json();
      } catch (e) { if (e.final) throw e; await pause(600 * (attempt + 1)); }
      finally { if (t) clearTimeout(t); }
    }
    throw new Error("unavailable");
  }
  const rpc = (m, p) => root.PBSellSim && root.PBSellSim._rpc ? root.PBSellSim._rpc(m, p) : rawRpc(m, p);
  async function rawRpc(method, params) {
    const r = await fetch("https://rpc.mainnet.chain.robinhood.com", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    const j = await r.json(); if (j.error) throw new Error("rpc"); return j.result;
  }
  const call = (to, data) => rpc("eth_call", [{ to, data }, "latest"]);
  const words = h => { const s = strip(h); const o = []; for (let i = 0; i + 64 <= s.length; i += 64) o.push(BigInt("0x" + s.slice(i, i + 64))); return o; };
  const asAddr = w => "0x" + w.toString(16).padStart(40, "0").slice(-40);
  const tokenAddr = t => lc(t && (t.address_hash || t.address || t.hash));

  // ---------- creator ----------
  async function findCreator(token) {
    const a = await getJSON(BS + "/v2/addresses/" + token);
    const txh = a.creation_transaction_hash || a.creation_tx_hash;
    let deployer = lc(a.creator_address_hash), factory = null, method = null, createdAt = null;
    if (txh) {
      try {
        const tx = await getJSON(BS + "/v2/transactions/" + txh);
        if (tx.from && tx.from.hash) deployer = lc(tx.from.hash);
        if (tx.to && tx.to.hash && lc(tx.to.hash) !== lc(token)) factory = lc(tx.to.hash);
        method = (tx.raw_input || "").slice(0, 10) || null;
        createdAt = tx.timestamp ? Date.parse(tx.timestamp) : null;
      } catch (e) { /* keep creator_address_hash */ }
    }
    return deployer ? { deployer, factory, method, txh: lc(txh), createdAt } : null;
  }

  async function reputation(token, cr) {
    const out = { launches: [], others: 0, dead: 0, alive: 0, unknown: 0, funder: null, fundEth: null, firstSeen: null, truncated: false };
    // Busy wallets make the explorer slow: try a big page, then fall back to a smaller one.
    let desc = null, size = 0;
    for (const n of [200, 50]) {
      try { desc = await getJSON(BS + "?module=account&action=txlist&address=" + cr.deployer + "&sort=desc&page=1&offset=" + n, 20000); size = n; break; }
      catch (e) { if (n === 50) throw e; }
    }
    const txs = Array.isArray(desc.result) ? desc.result : [];
    out.txCount = txs.length; out.truncated = txs.length >= size;
    const direct = txs.filter(t => t.contractAddress && lc(t.contractAddress) !== lc(token) && t.isError !== "1").map(t => ({ addr: lc(t.contractAddress), hash: lc(t.hash) }));
    let viaFactory = [];
    if (cr.factory && cr.method) {
      viaFactory = txs.filter(t => lc(t.to) === cr.factory && (t.methodId ? "0x" + strip(t.methodId) : (t.input || "").slice(0, 10)) === cr.method
        && lc(t.hash) !== cr.txh && t.isError !== "1").map(t => ({ addr: null, hash: lc(t.hash) }));
    }
    // Resolve which token each factory launch created (newest first, capped to keep the scan quick).
    for (const l of viaFactory.slice(0, 10)) {
      try {
        const tt = await getJSON(BS + "/v2/transactions/" + l.hash + "/token-transfers?type=ERC-20");
        const items = tt.items || [];
        const mint = items.find(i => i.from && lc(i.from.hash) === ZERO) || items.find(i => tokenAddr(i.token) !== WETH);
        if (mint) l.addr = tokenAddr(mint.token);
      } catch (e) { /* stays unknown */ }
    }
    const all = [...direct, ...viaFactory];
    out.others = all.length;
    const known = [...new Set(all.map(l => l.addr).filter(a => a && a !== lc(token)))];
    const liq = {};
    for (let i = 0; i < known.length; i += 30) {
      try {
        const ps = await getJSON(DEX + known.slice(i, i + 30).join(","));
        for (const p of ps || []) { const b = lc(p.baseToken && p.baseToken.address); liq[b] = Math.max(liq[b] || 0, (p.liquidity && p.liquidity.usd) || 0); }
      } catch (e) { known.slice(i, i + 30).forEach(a => { liq[a] = null; }); }
    }
    for (const l of all) {
      if (!l.addr || liq[l.addr] === null) { out.unknown++; continue; }
      const v = liq[l.addr] || 0; l.liq = v;
      if (v < 1000) out.dead++; else out.alive++;
    }
    out.launches = all.slice(0, 12);
    // First funding and wallet age
    try {
      const asc = await getJSON(BS + "?module=account&action=txlist&address=" + cr.deployer + "&sort=asc&page=1&offset=10");
      const first = (asc.result || [])[0];
      if (first) out.firstSeen = Number(first.timeStamp) * 1000;
      const fund = (asc.result || []).find(t => lc(t.to) === cr.deployer && BigInt(t.value || "0") > 0n);
      if (fund) { out.funder = lc(fund.from); out.fundEth = Number(BigInt(fund.value) / 10n ** 12n) / 1e6; }
    } catch (e) { /* optional */ }
    return out;
  }

  // ---------- liquidity control ----------
  async function liquidityControl(pair, deployer) {
    const res = { kind: null, creatorShare: null, burned: null, eoaTop: null, contractShare: null, holders: [] };
    const labels = (pair.labels || []).map(lc);
    const pid = lc(pair.pairAddress);
    if (labels.includes("v2") || (/^0x[0-9a-f]{40}$/.test(pid) && !labels.includes("v3") && !labels.includes("v4"))) {
      res.kind = "v2";
      const info = await getJSON(BS + "/v2/tokens/" + pid);
      const total = BigInt(info.total_supply || "0");
      const h = await getJSON(BS + "/v2/tokens/" + pid + "/holders");
      if (total === 0n) return res;
      const pct = v => Number(BigInt(v) * 10000n / total) / 100;
      res.burned = 0; res.contractShare = 0; res.creatorShare = 0; res.eoaTop = 0;
      for (const it of h.items || []) {
        const a = lc(it.address && it.address.hash), p = pct(it.value || "0");
        res.holders.push({ addr: a, pct: p, contract: !!(it.address && it.address.is_contract), name: it.address && it.address.name });
        if (BURN.has(a)) res.burned += p;
        else if (a === deployer) res.creatorShare += p;
        else if (it.address && it.address.is_contract && it.address.proxy_type !== "eip7702") res.contractShare += p;
        else res.eoaTop = Math.max(res.eoaTop, p);
      }
      return res;
    }
    // V3 / V4: positions are NFTs. Look for the creator's Uniswap position NFTs that belong to this pool.
    res.kind = labels.includes("v4") || pid.length === 66 ? "v4" : "v3";
    res.creatorShare = 0;
    const nft = await getJSON(BS + "/v2/addresses/" + deployer + "/nft?type=ERC-721");
    const pos = (nft.items || []).filter(i => /uniswap/i.test((i.token && (i.token.name || "")) || "") && /position/i.test((i.token && i.token.name) || "")).slice(0, 12);
    let poolLiq = null, t0 = null, t1 = null, fee = null;
    if (res.kind === "v3") {
      try {
        t0 = asAddr(words(await call(pid, "0x0dfe1681"))[0]); t1 = asAddr(words(await call(pid, "0xd21220a7"))[0]);
        fee = words(await call(pid, "0xddca3f43"))[0]; poolLiq = words(await call(pid, "0x1a686502"))[0];
      } catch (e) { return res; }
    } else {
      try {
        const slot = BigInt(keccak(strip(pid) + word(6))) + 3n;
        poolLiq = words(await call(V4_PM, "0x1e2eaeaf" + word(slot)))[0] & ((1n << 128n) - 1n);
      } catch (e) { poolLiq = null; }
    }
    for (const it of pos) {
      const mgr = tokenAddr(it.token), id = BigInt(it.id);
      try {
        let liq = 0n, match = false;
        if (res.kind === "v4") {
          const w = words(await call(mgr, "0x7ba03aad" + word(id)));
          if (w.length < 5) continue;
          const keyHex = w.slice(0, 5).map(word).join("");
          match = keccak(keyHex) === pid;
          if (match) liq = words(await call(mgr, "0x1efeed33" + word(id)))[0];
        } else {
          const w = words(await call(mgr, "0x99fbab88" + word(id)));
          match = asAddr(w[2]) === t0 && asAddr(w[3]) === t1 && w[4] === fee;
          liq = w[7] || 0n;
        }
        if (match && liq > 0n) {
          const share = poolLiq && poolLiq > 0n ? Math.min(100, Number(liq * 10000n / poolLiq) / 100) : null;
          res.holders.push({ addr: deployer, id: String(id), pct: share });
          res.creatorShare = share == null ? null : Math.min(100, (res.creatorShare || 0) + share);
          if (share == null) res.creatorHasPosition = true;
        }
      } catch (e) { /* skip this NFT */ }
    }
    if (res.kind === "v4" && !(res.creatorShare >= 50) && !res.creatorHasPosition && pair.pairCreatedAt) {
      try { res.top = await v4Holders(pid, pair.pairCreatedAt, deployer); } catch (e) { res.topError = String(e && e.message); }
    }
    return res;
  }

  // Who provided the V4 pool's liquidity, from PoolManager ModifyLiquidity logs, and who controls it now.
  const MODLIQ = "0xf208f4912782fd25c7f114ca3723a2d5dd6f3bcc3ac8db5af63baa85f711d5ec";
  async function v4Holders(pid, createdAtMs, deployer) {
    const head = BigInt(await rpc("eth_blockNumber", []));
    const hb = await rpc("eth_getBlockByNumber", ["0x" + head.toString(16), false]);
    const pastN = head > 1000000n ? head - 1000000n : 1n;
    const pb = await rpc("eth_getBlockByNumber", ["0x" + pastN.toString(16), false]);
    const rate = Number(head - pastN) / Math.max(1, Number(BigInt(hb.timestamp) - BigInt(pb.timestamp)));
    let est = head - BigInt(Math.floor(Math.max(0, Number(BigInt(hb.timestamp)) - createdAtMs / 1000) * rate));
    const ranges = [];
    let lo = est > 300000n ? est - 300000n : 0n, hi = lo + 9900000n; if (hi > head) hi = head;
    ranges.push([lo, hi]);
    if (hi < head) ranges.push([head > 9900000n ? (head - 9900000n > hi ? head - 9900000n : hi + 1n) : hi + 1n, head]);
    const pos = {};
    for (const [a, b] of ranges) {
      const logs = await rpc("eth_getLogs", [{ address: V4_PM, topics: [MODLIQ, pid], fromBlock: "0x" + a.toString(16), toBlock: "0x" + b.toString(16) }]);
      for (const l of logs || []) {
        const w = words(l.data); if (w.length < 4) continue;
        const sender = "0x" + l.topics[2].slice(-40);
        const key = sender + ":" + w[0] + ":" + w[1] + ":" + w[3];
        const p = pos[key] || (pos[key] = { sender, salt: w[3], net: 0n });
        p.net += BigInt.asIntN(256, w[2]);
      }
    }
    const live = Object.values(pos).filter(p => p.net > 0n).sort((x, y) => (y.net > x.net ? 1 : -1));
    const total = live.reduce((t, p) => t + p.net, 0n);
    if (!total) return [];
    const byOwner = {};
    for (const p of live.slice(0, 6)) {
      let owner = p.sender, viaNft = false;
      try {
        const o = await call(p.sender, "0x6352211e" + word(p.salt));
        if (o && o.length >= 66) { owner = asAddr(words(o)[0]); viaNft = true; }
      } catch (e) { /* not an NFT manager: the sender holds it directly */ }
      const b = byOwner[owner] || (byOwner[owner] = { addr: owner, pct: 0, viaNft });
      b.pct += Number(p.net * 10000n / total) / 100;
    }
    const out = Object.values(byOwner).sort((x, y) => y.pct - x.pct).slice(0, 3);
    for (const o of out) {
      o.pct = Math.round(o.pct * 10) / 10;
      o.creator = o.addr === deployer;
      if (BURN.has(o.addr)) { o.kind = "burn"; continue; }
      try {
        const a = await getJSON(BS + "/v2/addresses/" + o.addr, 8000);
        const isC = !!a.is_contract && a.proxy_type !== "eip7702";
        o.name = a.name || null;
        o.kind = !isC ? "wallet" : /lock/i.test(o.name || "") ? "locker" : "contract";
      } catch (e) { o.kind = "unknown"; }
    }
    return out;
  }

  // ---------- launch snipers ----------
  // Wallets that took tokens out of the pool in the first minute of trading: how much they still
  // hold, and whether they were funded by the creator (or by one shared wallet).
  const ROUTERS = new Set(["0x89e5db8b5aa49aa85ac63f691524311aeb649eba", "0xcaf681a66d020601342297493863e78c959e5cb2",
    "0x8876789976decbfcbbbe364623c63652db8c0904", "0x204faca1764b154221e35c0d20abb3c525710498"]);
  const SNIPE_WINDOW_S = 60;
  async function snipers(token, pair, pairs, cr, repP) {
    if (!pair || !pair.pairCreatedAt) return null;
    const pools = new Set([V4_PM, ...(pairs || []).map(p => lc(p.pairAddress)).filter(a => /^0x[0-9a-f]{40}$/.test(a))]);
    const j = await getJSON(BS + "?module=account&action=tokentx&contractaddress=" + token + "&sort=asc&page=1&offset=200", 15000);
    const tx = Array.isArray(j.result) ? j.result : [];
    const buys = tx.filter(t => pools.has(lc(t.from)) && !pools.has(lc(t.to)) && !BURN.has(lc(t.to)) && !ROUTERS.has(lc(t.to)) && lc(t.to) !== lc(token));
    if (!buys.length) return { n: 0, wallets: [] };
    const start = Math.min(Number(buys[0].timeStamp), Math.floor(pair.pairCreatedAt / 1000));
    const got = {};
    for (const t of buys) {
      if (Number(t.timeStamp) > start + SNIPE_WINDOW_S) break;
      const a = lc(t.to); got[a] = (got[a] || 0n) + BigInt(t.value || "0");
    }
    const deployer = cr && cr.deployer;
    let list = Object.entries(got).map(([addr, amt]) => ({ addr, amt })).sort((a, b) => (b.amt > a.amt ? 1 : -1)).slice(0, 15);
    const supply = words(await call(token, "0x18160ddd"))[0] || 0n;
    for (const w of list) {
      try {
        const bal = words(await call(token, "0x70a08231" + addrW(w.addr)))[0];
        w.pct = supply > 0n ? Number(bal * 10000n / supply) / 100 : null;
        w.boughtPct = supply > 0n ? Number(w.amt * 10000n / supply) / 100 : null;
        w.sold = bal * 2n < w.amt;
      } catch (e) { w.pct = null; }
      w.creator = w.addr === deployer;
    }
    // Who funded each sniper (first incoming ETH)
    let rep = null; try { rep = await repP; } catch (e) { rep = null; }
    const funderOfCreator = rep && rep.funder;
    for (const w of list.filter(x => !x.creator).slice(0, 8)) {
      try {
        const a = await getJSON(BS + "?module=account&action=txlist&address=" + w.addr + "&sort=asc&page=1&offset=5", 8000);
        const f = (a.result || []).find(t => lc(t.to) === w.addr && BigInt(t.value || "0") > 0n);
        if (f) w.funder = lc(f.from);
      } catch (e) { /* unknown */ }
    }
    const others = list.filter(x => !x.creator);
    const byFunder = {};
    for (const w of others) if (w.funder) (byFunder[w.funder] = byFunder[w.funder] || []).push(w);
    for (const w of others) {
      w.linked = !!w.funder && (w.funder === deployer || (funderOfCreator && w.funder === funderOfCreator));
      w.shared = !!w.funder && byFunder[w.funder].length >= 2;
    }
    const held = others.reduce((t, w) => t + (w.pct || 0), 0);
    return { n: others.length, wallets: list, held: Math.round(held * 100) / 100,
      linked: others.filter(w => w.linked).length, shared: Math.max(0, ...Object.values(byFunder).map(v => v.length)),
      creatorBought: list.find(w => w.creator) || null, windowS: SNIPE_WINDOW_S, truncated: tx.length >= 200 && Number(tx[tx.length - 1].timeStamp) <= start + SNIPE_WINDOW_S };
  }

  // ---------- holder concentration ----------
  async function holders(token, exclude) {
    const info = await getJSON(BS + "/v2/tokens/" + token);
    const total = BigInt(info.total_supply || "0");
    const count = Number(info.holders_count || info.holders || 0) || null;
    const h = await getJSON(BS + "/v2/tokens/" + token + "/holders");
    if (total === 0n) return { count, top: [], top10: null };
    const pct = v => Number(BigInt(v) * 10000n / total) / 100;
    const ex = new Set([...exclude].map(lc));
    const all = (h.items || []).map(it => ({ addr: lc(it.address && it.address.hash), pct: pct(it.value || "0"),
      contract: !!(it.address && it.address.is_contract && it.address.proxy_type !== "eip7702"), name: (it.address && it.address.name) || null }));
    const burned = all.filter(x => BURN.has(x.addr)).reduce((t, x) => t + x.pct, 0);
    const pools = all.filter(x => ex.has(x.addr) || x.addr === lc(token)).reduce((t, x) => t + x.pct, 0);
    const top = all.filter(x => !ex.has(x.addr) && !BURN.has(x.addr) && x.addr !== lc(token)).slice(0, 10);
    return { count, top, top10: Math.round(top.reduce((t, x) => t + x.pct, 0) * 100) / 100, burned, pools };
  }

  const within = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("time budget")), ms))]);
  async function analyze(token, pair, pairs, opts = {}) {
    const budget = opts.budgetMs || 35000;
    const t0 = Date.now(); deadline = t0 + budget;
    const out = { creator: null, rep: null, lp: null, holders: null, snipers: null, errors: [] };
    const exclude = new Set([V4_PM, ...(pairs || []).map(p => lc(p.pairAddress)).filter(a => /^0x[0-9a-f]{40}$/.test(a))]);
    const left = () => Math.max(500, deadline - Date.now());
    // Holders and creator lookups run in parallel; each part fails on its own.
    const hP = within(holders(token, exclude), left()).then(v => { out.holders = v; }, () => out.errors.push("holders"));
    try { out.creator = await within(findCreator(token), left()); } catch (e) { out.errors.push("creator"); }
    const jobs = [hP];
    if (out.creator) {
      const repP = reputation(token, out.creator);
      jobs.push(within(repP, left()).then(v => { out.rep = v; }, e => out.errors.push("reputation: " + (e && e.message))));
      jobs.push(within(snipers(token, pair, pairs, out.creator, within(repP, left())), left()).then(v => { out.snipers = v; }, e => out.errors.push("snipers: " + (e && e.message))));
      if (pair) jobs.push(within(liquidityControl(pair, out.creator.deployer), left()).then(v => { out.lp = v; }, () => out.errors.push("lp")));
    }
    await Promise.all(jobs);
    if (out.creator && out.holders) {
      const mine = (out.holders.top || []).find(x => x.addr === out.creator.deployer);
      out.creatorPct = mine ? mine.pct : 0;
    }
    out.ms = Date.now() - t0;
    return out;
  }

  const api = { analyze, keccak, findCreator, reputation, liquidityControl, holders, snipers };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PBCreator = api;
})(typeof window !== "undefined" ? window : globalThis);
