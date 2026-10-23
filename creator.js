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
  // freeze the report. Past the deadline every request fails fast and the check says the time ran out.
  let deadline = Infinity;
  // opts.once: one attempt, no retry on 429 (the legacy explorer API rate-limits per IP after a few
  // calls; retrying only burns the quota). Callers then fall back to the v2 API or the RPC.
  async function getJSON(url, ms = 10000, opts = {}) {
    for (let attempt = 0; attempt < (opts.once ? 1 : 3); attempt++) {
      if (Date.now() > deadline) throw new Error("time budget");
      const wait = 250 - (Date.now() - last); if (wait > 0) await pause(wait); last = Date.now();
      ms = Math.max(1000, Math.min(ms, deadline - Date.now()));
      const c = typeof AbortController !== "undefined" ? new AbortController() : null;
      const t = c ? setTimeout(() => c.abort(), ms) : null;
      try {
        const r = await fetch(url, { signal: c ? c.signal : undefined });
        if (opts.once && r.status === 429) throw Object.assign(new Error("HTTP 429"), { final: true, status: 429 });
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
    let deployer = lc(a.creator_address_hash), factory = null, method = null, createdAt = null, createdBlock = null;
    if (txh) {
      try {
        const tx = await getJSON(BS + "/v2/transactions/" + txh);
        if (tx.from && tx.from.hash) deployer = lc(tx.from.hash);
        if (tx.to && tx.to.hash && lc(tx.to.hash) !== lc(token)) factory = lc(tx.to.hash);
        method = (tx.raw_input || "").slice(0, 10) || null;
        createdAt = tx.timestamp ? Date.parse(tx.timestamp) : null;
        createdBlock = tx.block_number != null ? Number(tx.block_number) : tx.block != null ? Number(tx.block) : null;
      } catch (e) { /* keep creator_address_hash */ }
    }
    return deployer ? { deployer, factory, method, txh: lc(txh), createdAt, createdBlock, verified: !!a.is_verified, tokenName: a.name || null } : null;
  }

  const fromV2Tx = t => ({ hash: lc(t.hash), from: lc(t.from && t.from.hash), to: lc(t.to && t.to.hash), value: t.value || "0",
    contractAddress: lc(t.created_contract && t.created_contract.hash), input: t.raw_input || "", methodId: "",
    isError: t.status === "error" ? "1" : "0", timeStamp: String(Math.floor((Date.parse(t.timestamp) || 0) / 1000)) });
  async function creatorHistory(addr, pages = 3) {
    try {
      const d = await getJSON(BS + "?module=account&action=txlist&address=" + addr + "&sort=desc&page=1&offset=200", 20000, { once: true });
      if (Array.isArray(d.result)) return { txs: d.result, truncated: d.result.length >= 200, source: "legacy" };
      if (d.message && /no transactions/i.test(d.message)) return { txs: [], truncated: false, source: "legacy" };
    } catch (e) { /* fall back to v2 */ }
    const txs = []; let q = "";
    for (let i = 0; i < pages; i++) {
      const j = await getJSON(BS + "/v2/addresses/" + addr + "/transactions" + q, 15000);
      txs.push(...(j.items || []).map(fromV2Tx));
      if (!j.next_page_params) return { txs, truncated: false, source: "v2" };
      q = "?" + new URLSearchParams(j.next_page_params).toString();
    }
    return { txs, truncated: true, source: "v2" };
  }

  async function reputation(token, cr) {
    const out = { launches: [], others: 0, dead: 0, alive: 0, unknown: 0, funder: null, fundEth: null, firstSeen: null, truncated: false };
    // Busy wallets make the explorer slow: try a big page, then fall back to a smaller one.
    // First funding runs in parallel (v2). History: one legacy call (fast, 200 txs) and, if the
    // legacy API is rate-limited or fails, the v2 API (not rate-limited the same way, 50 per page).
    const fundP = firstFunder(cr.deployer); fundP.catch(() => {});
    const h = await creatorHistory(cr.deployer);
    const txs = h.txs;
    out.txCount = txs.length; out.truncated = h.truncated; out.historySource = h.source;
    const direct = txs.filter(t => t.contractAddress && lc(t.contractAddress) !== lc(token) && t.isError !== "1").map(t => ({ addr: lc(t.contractAddress), hash: lc(t.hash) }));
    let viaFactory = [];
    if (cr.factory && cr.method) {
      viaFactory = txs.filter(t => lc(t.to) === cr.factory && (t.methodId ? "0x" + strip(t.methodId) : (t.input || "").slice(0, 10)) === cr.method
        && lc(t.hash) !== cr.txh && t.isError !== "1").map(t => ({ addr: null, hash: lc(t.hash) }));
    }
    // Resolve which token each factory launch created (newest first, capped to keep the scan quick).
    await Promise.all(viaFactory.slice(0, 10).map(async l => {
      try {
        const tt = await getJSON(BS + "/v2/transactions/" + l.hash + "/token-transfers?type=ERC-20");
        const items = tt.items || [];
        const mint = items.find(i => i.from && lc(i.from.hash) === ZERO) || items.find(i => tokenAddr(i.token) !== WETH);
        if (mint) l.addr = tokenAddr(mint.token);
      } catch (e) { /* stays unknown */ }
    }));
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
    // First funding and wallet age: the oldest transaction seen (only when the whole history was read)
    // and the first incoming ETH.
    const oldest = !out.truncated && txs.length ? Math.min(...txs.map(t => Number(t.timeStamp) * 1000).filter(x => x > 0)) : null;
    let fund = null; try { fund = await fundP; } catch (e) { /* optional */ }
    if (fund && fund.funder) { out.funder = fund.funder; if (fund.value) out.fundEth = Number(BigInt(fund.value) / 10n ** 12n) / 1e6; }
    const seen = [oldest, fund && fund.ts].filter(x => x && isFinite(x));
    out.firstSeen = seen.length ? Math.min(...seen) : null;
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

  // First wallet that sent ETH to an address, via the v2 explorer API (the legacy API rate-limits
  // after a handful of calls). Wallets with 50+ incoming transactions are established, not fresh:
  // their first funder is not looked up. Falls back to internal transfers (disperse contracts).
  async function firstFunder(a) {
    a = lc(a);
    const j = await getJSON(BS + "/v2/addresses/" + a + "/transactions?filter=to", 10000);
    if (j.next_page_params) return { funder: null, established: true };
    const inc = (j.items || []).filter(t => t.from && t.from.hash && lc(t.from.hash) !== a && BigInt(t.value || "0") > 0n);
    const ts = t => (t && t.timestamp ? Date.parse(t.timestamp) : null);
    if (inc.length) { const t = inc[inc.length - 1]; return { funder: lc(t.from.hash), ts: ts(t), value: t.value || null }; }
    const it = await getJSON(BS + "/v2/addresses/" + a + "/internal-transactions?filter=to", 10000);
    const ii = (it.items || []).filter(t => t.from && t.from.hash && BigInt(t.value || "0") > 0n);
    const t = ii[ii.length - 1];
    return { funder: t ? lc(t.from.hash) : null, ts: ts(t), value: t ? t.value || null : null, viaContract: !!t };
  }

  // ---------- launch snipers ----------
  // Wallets that took tokens out of the pool in the first minute of trading: how much they still
  // hold, and whether they were funded by the creator (or by one shared wallet).
  const ROUTERS = new Set(["0x89e5db8b5aa49aa85ac63f691524311aeb649eba", "0xcaf681a66d020601342297493863e78c959e5cb2",
    "0x8876789976decbfcbbbe364623c63652db8c0904", "0x204faca1764b154221e35c0d20abb3c525710498"]);
  const SNIPE_WINDOW_S = 60;
  const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const hex = n => "0x" + BigInt(n).toString(16);
  // Launch buys straight from the chain (Transfer logs of the token around the pair's creation).
  // The block range is estimated from the token's creation block and verified with real block
  // timestamps: if it does not cover [pair creation, +60 s] the function gives up (caller falls back),
  // so a wrong range can never produce a false "no snipers".
  async function launchBuysRpc(token, pair, cr, isBuy) {
    if (!cr || cr.createdBlock == null || !cr.createdAt || !pair || !pair.pairCreatedAt) throw new Error("no creation block");
    const blk = {}; const tsOf = async n => { n = Number(n); if (blk[n] == null) { const b = await rpc("eth_getBlockByNumber", [hex(n), false]); blk[n] = Number(BigInt(b.timestamp)); } return blk[n]; };
    const head = Number(BigInt(await rpc("eth_blockNumber", [])));
    const b0 = Number(cr.createdBlock), t0 = await tsOf(b0), th = await tsOf(head);
    const rate = (head - b0) / Math.max(1, th - t0);                       // blocks per second (average)
    const pairS = Math.max(t0, Math.floor(pair.pairCreatedAt / 1000));
    const est = b0 + Math.floor((pairS - t0) * rate), m = Math.ceil(15 * 60 * rate);
    const lo = Math.max(b0, est - m), hi = Math.min(head, est + m);
    if (await tsOf(lo) > pairS || await tsOf(hi) < pairS + SNIPE_WINDOW_S) throw new Error("range does not cover the launch");
    const logs = await rpc("eth_getLogs", [{ address: token, topics: [TRANSFER], fromBlock: hex(lo), toBlock: hex(hi) }]);
    if (!Array.isArray(logs)) throw new Error("logs");
    const tr = logs.filter(l => l.topics && l.topics.length === 3).map(l => ({ from: "0x" + l.topics[1].slice(-40), to: "0x" + l.topics[2].slice(-40),
      value: BigInt(l.data && l.data !== "0x" ? l.data : "0x0").toString(), block: parseInt(l.blockNumber, 16), idx: parseInt(l.logIndex, 16) }))
      .sort((a, b) => a.block - b.block || a.idx - b.idx);
    const buys = tr.filter(isBuy);
    if (!buys.length) {
      // No buy in the window around the estimated creation: only trust that if the pair really started there.
      if (await tsOf(lo) <= pairS && await tsOf(hi) >= pairS + 600) return { buys: [], any: false, truncated: false, source: "rpc" };
      throw new Error("no buys in range");
    }
    const start = Math.min(await tsOf(buys[0].block), pairS);
    const out = []; let distinct = 0, lastBlock = -1, truncated = false;
    for (const t of buys) {
      if (t.block !== lastBlock) { if (++distinct > 40) { truncated = true; break; } lastBlock = t.block; }
      if (await tsOf(t.block) > start + SNIPE_WINDOW_S) break;
      out.push({ to: t.to, value: t.value });
    }
    return { buys: out, any: true, truncated, source: "rpc" };
  }
  async function snipers(token, pair, pairs, cr, repP) {
    if (!pair || !pair.pairCreatedAt) return null;
    const pools = new Set([V4_PM, ...(pairs || []).map(p => lc(p.pairAddress)).filter(a => /^0x[0-9a-f]{40}$/.test(a))]);
    const isBuy = t => pools.has(lc(t.from)) && !pools.has(lc(t.to)) && !BURN.has(lc(t.to)) && !ROUTERS.has(lc(t.to)) && lc(t.to) !== lc(token);
    let L = null;
    // The launch is the first pool's creation, not necessarily the main (most liquid) pair's.
    const launchMs = Math.min(pair.pairCreatedAt, ...(pairs || []).map(p => p.pairCreatedAt).filter(x => x > 0));
    try { L = await launchBuysRpc(token, { pairCreatedAt: launchMs }, cr, isBuy); } catch (e) { L = null; }
    if (!L) {
      // Fallback: legacy explorer API (one attempt; it rate-limits per IP).
      const j = await getJSON(BS + "?module=account&action=tokentx&contractaddress=" + token + "&sort=asc&page=1&offset=200", 15000, { once: true });
      if (!Array.isArray(j.result)) throw new Error("unavailable");
      const tx = j.result, buys = tx.filter(isBuy);
      const start = buys.length ? Math.min(Number(buys[0].timeStamp), Math.floor(launchMs / 1000)) : 0;
      L = { buys: buys.filter(t => Number(t.timeStamp) <= start + SNIPE_WINDOW_S).map(t => ({ to: lc(t.to), value: t.value })),
            any: buys.length > 0, truncated: tx.length >= 200 && Number(tx[tx.length - 1].timeStamp) <= start + SNIPE_WINDOW_S, source: "legacy" };
    }
    if (!L.any) return { n: 0, wallets: [], source: L.source };
    const got = {};
    for (const t of L.buys) { const a = lc(t.to); got[a] = (got[a] || 0n) + BigInt(t.value || "0"); }
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
    await Promise.all(list.filter(x => !x.creator).slice(0, 10).map(async w => {
      try { const f = await firstFunder(w.addr); if (f.funder) w.funder = f.funder; } catch (e) { /* unknown */ }
    }));
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
      creatorBought: list.find(w => w.creator) || null, windowS: SNIPE_WINDOW_S, truncated: L.truncated, source: L.source };
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

  // 60 s: older tokens with long creator histories need ~40 s on a desktop (CI, 23 oct 2026: microduck
  // reputation finished at 40.2 s and was cut at 35 s). A retry asks for RETRY_BUDGET_MS.
  const BUDGET_MS = 60000, RETRY_BUDGET_MS = 120000;
  // Why a part is missing: "timeout" when our own time budget cut it (the explorer was slow, not broken),
  // "provider" when the explorer/RPC failed, null when the part did not fail.
  function failReason(out, key) {
    const hits = ((out && out.errors) || []).filter(e => String(e).split(":")[0].trim() === key);
    if (!hits.length) return null;
    return hits.some(e => /time budget/.test(String(e))) ? "timeout" : "provider";
  }
  // Short-lived per-browser cache of explorer results: a re-scan of the same token (very common) is
  // instant instead of repeating ~15 slow explorer calls. Only successful results are stored; the
  // creation of a token never changes, the rest expire quickly. Storage failures are ignored.
  const TTL = { creator: 7 * 864e5, reputation: 15 * 6e4, lp: 5 * 6e4, holders: 5 * 6e4, snipers: 10 * 6e4 };
  const enc = v => JSON.stringify(v, (k, x) => typeof x === "bigint" ? { __big: x.toString() } : x);
  const dec = t => JSON.parse(t, (k, x) => x && typeof x === "object" && typeof x.__big === "string" ? BigInt(x.__big) : x);
  function cacheGet(kind, key, now) {
    try {
      const raw = root.localStorage && root.localStorage.getItem("pbs-ex:" + kind + ":" + key); if (!raw) return undefined;
      const e = dec(raw); if (!e || now - e.at > TTL[kind] || e.at > now) return undefined; return e.v;
    } catch (x) { return undefined; }
  }
  function cacheSet(kind, key, v, now) {
    if (v == null) return;
    try { root.localStorage && root.localStorage.setItem("pbs-ex:" + kind + ":" + key, enc({ at: now, v })); } catch (x) { /* full or blocked */ }
  }
  async function cached(kind, key, fn, now = Date.now()) {
    const hit = cacheGet(kind, key, now); if (hit !== undefined) return hit;
    const v = await fn(); cacheSet(kind, key, v, Date.now()); return v;
  }
  const msg = (k, e) => k + ": " + ((e && e.message) || "error");
  const within = (p, ms) => { p.catch(() => {}); return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("time budget")), ms))]); };
  async function analyze(token, pair, pairs, opts = {}) {
    const budget = opts.budgetMs || BUDGET_MS;
    const t0 = Date.now(); deadline = t0 + budget;
    const out = { creator: null, rep: null, lp: null, holders: null, snipers: null, errors: [] };
    const exclude = new Set([V4_PM, ...(pairs || []).map(p => lc(p.pairAddress)).filter(a => /^0x[0-9a-f]{40}$/.test(a))]);
    const left = () => Math.max(500, deadline - Date.now());
    // Holders and creator lookups run in parallel; each part fails on its own.
    const hP = within(cached("holders", token, () => holders(token, exclude)), left()).then(v => { out.holders = v; }, e => out.errors.push(msg("holders", e)));
    try { out.creator = await within(cached("creator", token, () => findCreator(token)), left()); } catch (e) { out.errors.push(msg("creator", e)); }
    const jobs = [hP];
    if (out.creator) {
      const repP = cached("reputation", token, () => reputation(token, out.creator)); repP.catch(() => {});
      jobs.push(within(repP, left()).then(v => { out.rep = v; }, e => out.errors.push("reputation: " + (e && e.message))));
      jobs.push(within(cached("snipers", token, () => snipers(token, pair, pairs, out.creator, within(repP, left()))), left()).then(v => { out.snipers = v; }, e => out.errors.push("snipers: " + (e && e.message))));
      if (pair) jobs.push(within(cached("lp", token + ":" + lc(pair.pairAddress), () => liquidityControl(pair, out.creator.deployer)), left()).then(v => { out.lp = v; }, () => out.errors.push("lp")));
    }
    await Promise.all(jobs);
    if (out.creator && out.holders) {
      const mine = (out.holders.top || []).find(x => x.addr === out.creator.deployer);
      out.creatorPct = mine ? mine.pct : 0;
    }
    out.ms = Date.now() - t0; out.budgetMs = budget;
    return out;
  }

  const api = { analyze, failReason, cached, _cacheGet: cacheGet, TTL, BUDGET_MS, RETRY_BUDGET_MS, keccak, findCreator, reputation, liquidityControl, holders, snipers,
    _get: getJSON, _firstFunder: firstFunder, _launchBuysRpc: launchBuysRpc, _creatorHistory: creatorHistory, _call: call, _rpc: rpc, _words: words, _budget: ms => { deadline = Date.now() + ms; } };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PBCreator = api;
})(typeof window !== "undefined" ? window : globalThis);
