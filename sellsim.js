/* PreBuyScan sell simulation (read-only).
 * Simulates, in one block via eth_simulateV1 on the public RPC: buy a small amount with
 * ETH -> approve -> sell everything back. Nothing is signed or sent; the simulated
 * wallet has no code and its ETH balance exists only inside the simulation.
 * Supports Uniswap V2 (WETH pairs), V3 (WETH pools) and V4 (native-ETH pools).
 * Works in the browser (window.PBSellSim) and in Node 18+ (module.exports).
 */
(function (root) {
  "use strict";
  const RPC = "https://rpc.mainnet.chain.robinhood.com";
  const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
  const V2_ROUTER = "0x89e5db8b5aa49aa85ac63f691524311aeb649eba";
  const V3_ROUTER = "0xcaf681a66d020601342297493863e78c959e5cb2";      // SwapRouter02
  const V3_FACTORY = "0x1f7d7550b1b028f7571e69a784071f0205fd2efa";
  const V4_PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951";          // PoolManager
  const V4_ROUTERS = ["0x8876789976decbfcbbbe364623c63652db8c0904", "0x204faca1764b154221e35c0d20abb3c525710498"]; // UniversalRouter
  const PERMIT2 = "0x000000000022d473030f116ddee9f6b43ac78ba3";
  const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11";
  const INIT_TOPIC = "0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438";
  const ACTOR = "0x00000000000000000000000000000000a11ce008";       // inert, no code
  const BUY_WEI = 10n ** 16n;                                          // 0.01 ETH simulated
  const MAX = (1n << 255n) - 1n, MAX160 = (1n << 160n) - 1n;
  const DEADLINE = 4102444800n;                                         // 2100-01-01
  const GAS = "0x7a1200";

  // ---------- minimal ABI helpers ----------
  const strip = h => h.replace(/^0x/, "").toLowerCase();
  const word = n => BigInt.asUintN(256, BigInt(n)).toString(16).padStart(64, "0");
  const addr = a => strip(a).padStart(64, "0");
  const encBytes = h => { const b = strip(h); return word(b.length / 2) + b + "0".repeat((64 - (b.length % 64)) % 64); };
  function abi(parts) {           // parts: 64-hex static words, or {dyn: fully encoded tail}
    const headLen = parts.length * 32; let head = "", tail = "";
    for (const p of parts) {
      if (typeof p === "string") head += p;
      else { head += word(headLen + tail.length / 2); tail += p.dyn; }
    }
    return head + tail;
  }
  const encBytesArray = arr => word(arr.length) + abi(arr.map(b => ({ dyn: encBytes(b) })));
  const uint = h => BigInt(h && h !== "0x" ? h : "0x0");
  const readWord = (h, i) => BigInt("0x" + strip(h).slice(i * 64, i * 64 + 64));

  // ---------- RPC with gentle retry (public endpoint rate limits) ----------
  let rpcId = 0, lastCall = 0;
  const pause = ms => new Promise(s => setTimeout(s, ms));
  async function rpc(method, params, opt = {}) {
    let lastErr;
    for (let attempt = 0; attempt < 5; attempt++) {
      // Space calls out: the public RPC rate-limits bursts, and in a browser a 429 without
      // CORS headers surfaces as a generic network error ("Failed to fetch").
      const wait = 250 - (Date.now() - lastCall); if (wait > 0) await pause(wait); lastCall = Date.now();
      const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const t = ctl ? setTimeout(() => ctl.abort(), opt.timeout || 15000) : null;
      try {
        const r = await fetch(opt.rpc || RPC, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }), signal: ctl ? ctl.signal : undefined });
        if (r.status === 429) { await new Promise(s => setTimeout(s, 800 * (attempt + 1))); continue; }
        if (!r.ok) throw new Error("HTTP " + r.status);
        const j = await r.json();
        if (j.error) { const e = new Error(j.error.message || "rpc error"); e.rpc = j.error; throw e; }
        return j.result;
      } catch (e) {
        if (e.rpc) throw e;                         // a real JSON-RPC answer: do not retry
        lastErr = e; await pause(1000 * (attempt + 1));
      } finally { if (t) clearTimeout(t); }
    }
    throw lastErr || new Error("rate limited");
  }
  const call = (to, data, o) => rpc("eth_call", [{ to, data }, "latest"], o);

  // ---------- tx builders ----------
  const tx = (to, data, value) => ({ from: ACTOR, to, data, value: "0x" + (value || 0n).toString(16), gas: GAS });
  const balanceOf = (token, who) => "0x70a08231" + addr(who);
  const approve = (spender, amt) => "0x095ea7b3" + addr(spender) + word(amt);
  const ethBalance = () => tx(MULTICALL3, "0x4d2301cc" + addr(ACTOR));

  function v2Buy(token) {
    return "0xb6f9de95" + abi([word(1), { dyn: word(2) + addr(WETH) + addr(token) }, addr(ACTOR), word(DEADLINE)]);
  }
  function v2Sell(token, amount) {   // token -> WETH, fee-on-transfer tolerant
    return "0x5c11d795" + abi([word(amount), word(1), { dyn: word(2) + addr(token) + addr(WETH) }, addr(ACTOR), word(DEADLINE)]);
  }
  function v3Swap(tin, tout, fee, amount) {
    return "0x04e45aaf" + addr(tin) + addr(tout) + word(fee) + addr(ACTOR) + word(amount) + word(1) + word(0);
  }
  function v4Execute(key, zeroForOne, amountIn, currencyIn, currencyOut) {
    const keyWords = [addr(key.currency0), addr(key.currency1), word(key.fee), word(key.tickSpacing), addr(key.hooks)];
    const swapParams = word(32) + abi([...keyWords, word(zeroForOne ? 1 : 0), word(amountIn), word(1), { dyn: encBytes("") }]);
    const settle = addr(currencyIn) + word(MAX);
    const take = addr(currencyOut) + word(1);
    const v4Input = abi([{ dyn: encBytes("060c0f") }, { dyn: encBytesArray([swapParams, settle, take]) }]);
    return "0x3593564c" + abi([{ dyn: encBytes("10") }, { dyn: encBytesArray([v4Input]) }, word(DEADLINE)]);
  }

  // ---------- V4 pool key from the Initialize event ----------
  const keyCache = {};
  async function v4Key(poolId, createdAtMs, o) {
    if (keyCache[poolId]) return keyCache[poolId];
    const k = await v4KeyUncached(poolId, createdAtMs, o); keyCache[poolId] = k; return k;
  }
  async function v4KeyUncached(poolId, createdAtMs, o) {
    const head = BigInt(await rpc("eth_blockNumber", [], o));
    const hb = await rpc("eth_getBlockByNumber", ["0x" + head.toString(16), false], o);
    const pastN = head > 1000000n ? head - 1000000n : 1n;
    const pb = await rpc("eth_getBlockByNumber", ["0x" + pastN.toString(16), false], o);
    const rate = Number(head - pastN) / Math.max(1, Number(BigInt(hb.timestamp) - BigInt(pb.timestamp))); // blocks per second
    const windows = [];
    if (createdAtMs) {
      const est = head - BigInt(Math.floor(Math.max(0, Number(BigInt(hb.timestamp)) - createdAtMs / 1000) * rate));
      windows.push([est - 2000000n, est + 2000000n]);
    }
    for (let hi = head; hi > 0n && windows.length < 12; hi -= 9999999n) windows.push([hi - 9999999n, hi]);
    for (let [lo, hi] of windows) {
      if (lo < 0n) lo = 0n; if (hi > head) hi = head;
      const logs = await rpc("eth_getLogs", [{ address: V4_PM, topics: [INIT_TOPIC, poolId],
        fromBlock: "0x" + lo.toString(16), toBlock: "0x" + hi.toString(16) }], o);
      if (logs && logs.length) {
        const l = logs[0], d = strip(l.data);
        const fee = BigInt("0x" + d.slice(0, 64)), ts = BigInt.asIntN(256, BigInt("0x" + d.slice(64, 128)));
        return { currency0: "0x" + l.topics[2].slice(-40), currency1: "0x" + l.topics[3].slice(-40), fee,
          tickSpacing: ts, hooks: "0x" + d.slice(128 + 24, 192) };
      }
    }
    throw new Error("v4 pool key not found");
  }

  function decodeOrNull(c) { return c && c.status === "0x1" ? c.returnData : null; }

  // ---------- main ----------
  async function simulate(token, pair, o = {}) {
    token = token.toLowerCase();
    const BUY = o.buyWei ? BigInt(o.buyWei) : BUY_WEI;           // simulated ETH amount (default 0.01)
    const out = { status: "unknown", spentWei: BUY.toString() };
    try {
      const pa = (pair.pairAddress || "").toLowerCase(), labels = (pair.labels || []).map(x => x.toLowerCase());
      let kind = /^0x[0-9a-f]{64}$/.test(pa) ? "v4" : labels.includes("v3") ? "v3" : labels.includes("v2") ? "v2" : null;
      if (!kind && /^0x[0-9a-f]{40}$/.test(pa)) {           // unlabeled pair: probe fee() (V3) vs getReserves (V2)
        try { await call(pa, "0xddca3f43", o); kind = "v3"; } catch (e) { kind = "v2"; }
      }
      out.kind = kind;
      const calls = [], idx = {};
      const push = (name, t) => { idx[name] = calls.length; calls.push(t); };
      let measure, sellCalls;
      if (kind === "v2") {
        push("tokBefore", tx(token, balanceOf(token, ACTOR)));
        push("buy", tx(V2_ROUTER, v2Buy(token), BUY));
        push("tokAfter", tx(token, balanceOf(token, ACTOR)));
        measure = { before: tx(WETH, balanceOf(WETH, ACTOR)), asset: "WETH" };
        sellCalls = amt => [tx(token, approve(V2_ROUTER, amt)), tx(V2_ROUTER, v2Sell(token, amt))];
      } else if (kind === "v3") {
        const fee = Number(BigInt(await call(pa, "0xddca3f43", o)));
        const t0 = "0x" + strip(await call(pa, "0x0dfe1681", o)).slice(-40), t1 = "0x" + strip(await call(pa, "0xd21220a7", o)).slice(-40);
        if (![t0, t1].includes(WETH)) { out.status = "unsupported"; out.detail = "El par principal no es contra WETH."; return out; }
        push("tokBefore", tx(token, balanceOf(token, ACTOR)));
        push("buy", tx(V3_ROUTER, v3Swap(WETH, token, fee, BUY), BUY));
        push("tokAfter", tx(token, balanceOf(token, ACTOR)));
        measure = { before: tx(WETH, balanceOf(WETH, ACTOR)), asset: "WETH" };
        sellCalls = amt => [tx(token, approve(V3_ROUTER, amt)), tx(V3_ROUTER, v3Swap(token, WETH, fee, amt))];
      } else if (kind === "v4") {
        const key = await v4Key(pa, pair.pairCreatedAt, o);
        const eth = "0x0000000000000000000000000000000000000000";
        const other = key.currency0 === token ? key.currency1 : key.currency1 === token ? key.currency0 : null;
        if (other !== eth && other !== WETH) {
          out.status = "unsupported"; out.detail = "Pool V4 contra un activo distinto de ETH/WETH; simulación no disponible."; return out;
        }
        out.hooks = key.hooks; out.base = other === eth ? "ETH" : "WETH";
        const router = o.v4Router || V4_ROUTERS[0];
        const buyZeroForOne = key.currency0 === other;
        const permit = tkn => [tx(tkn, approve(PERMIT2, MAX)),
          tx(PERMIT2, "0x87517c45" + addr(tkn) + addr(router) + word(MAX160) + word(DEADLINE))];
        push("tokBefore", tx(token, balanceOf(token, ACTOR)));
        if (other === eth) {
          push("buy", tx(router, v4Execute(key, buyZeroForOne, BUY, eth, token), BUY));
          measure = { before: ethBalance(), asset: "ETH" };
        } else {                     // wrap the simulated ETH into WETH, then pay through Permit2
          push("wrap", tx(WETH, "0xd0e30db0", BUY));
          const [a1, a2] = permit(WETH); push("wapprove", a1); push("wpermit", a2);
          push("buy", tx(router, v4Execute(key, buyZeroForOne, BUY, WETH, token)));
          measure = { before: tx(WETH, balanceOf(WETH, ACTOR)), asset: "WETH" };
        }
        push("tokAfter", tx(token, balanceOf(token, ACTOR)));
        sellCalls = amt => [...permit(token), tx(router, v4Execute(key, !buyZeroForOne, amt, token, other))];
      } else { out.status = "unsupported"; out.detail = "Tipo de pool no reconocido."; return out; }

      // First simulation: the buy, to learn the exact amount received.
      const base = { [ACTOR]: { balance: "0x" + (BUY * 10n).toString(16) } };
      // o.delaySec: the sell (everything after `split`) runs in a second simulated block that many
      // seconds later, to detect time-based locks (sell only right after buying, or only after a cooldown).
      let later = null;
      if (o.delaySec) {
        const lb = await rpc("eth_getBlockByNumber", ["latest", false], o);
        later = { time: "0x" + (BigInt(lb.timestamp) + BigInt(o.delaySec)).toString(16), number: "0x" + (BigInt(lb.number) + 2n).toString(16) };
      }
      const sim = async (cs, split) => {
        const blocks = later && split ? [{ stateOverrides: base, calls: cs.slice(0, split) }, { blockOverrides: later, calls: cs.slice(split) }]
          : [{ stateOverrides: base, calls: cs }];
        const r = await rpc("eth_simulateV1", [{ blockStateCalls: blocks, validation: false }, "latest"], o);
        if (!Array.isArray(r) || r.length !== blocks.length || r.some(b => !b || !Array.isArray(b.calls))) throw new Error("invalid simulation");
        return r.reduce((t, b) => t.concat(b.calls), []);
      };
      const first = await sim(calls);
      for (const k of ["wrap", "wapprove", "wpermit"]) if (k in idx && first[idx[k]].status !== "0x1") { out.status = "unknown"; out.detail = "Preparación de WETH simulada fallida."; return out; }
      if (first[idx.buy].status !== "0x1") {
        const b = first[idx.buy]; out.revert = (b.error && (b.error.data || b.error.message)) || b.returnData || null;
        if (out.hooks && !/^0x0+$/.test(out.hooks) && (!out.revert || out.revert === "0x")) {
          out.status = "hook_restricted";
          out.detail = "El hook del pool rechazó la compra desde los routers estándar de Uniswap: solo permite operar desde su propio router.";
        } else { out.status = "buy_failed"; out.detail = "La compra simulada falló."; }
        return out;
      }
      const got = uint(decodeOrNull(first[idx.tokAfter])) - uint(decodeOrNull(first[idx.tokBefore]));
      if (got <= 0n) { out.status = "buy_failed"; out.detail = "La compra simulada no entregó tokens."; return out; }
      out.boughtRaw = got.toString();
      // Second simulation: buy -> measure -> approve -> sell all -> measure.
      const all = calls.slice(); const mi = all.length; all.push(measure.before);
      const sc = sellCalls(got); const si = all.length + sc.length - 1; all.push(...sc);
      const ma = all.length; all.push(measure.asset === "ETH" ? ethBalance() : tx(WETH, balanceOf(WETH, ACTOR)));
      const tAfter = all.length; all.push(tx(token, balanceOf(token, ACTOR)));
      const r = await sim(all, mi);
      for (let i = mi + 1; i < si; i++) {          // approvals before the sell
        if (!r[i] || r[i].status !== "0x1") { out.status = "unknown"; out.detail = "La aprobación simulada falló."; return out; }
      }
      out.sellGas = r[si] && r[si].gasUsed ? Number(BigInt(r[si].gasUsed)) : null;
      if (r[si] && r[si].status !== "0x1") out.revert = (r[si].error && (r[si].error.data || r[si].error.message)) || r[si].returnData || null;
      if (o.delaySec) out.delaySec = o.delaySec;
      if (r[si].status !== "0x1") { out.status = "sell_failed"; out.detail = "La compra funcionó pero la venta falló: posible honeypot."; return out; }
      if (r[mi].status !== "0x1" || r[ma].status !== "0x1") { out.status = "unknown"; out.detail = "No se pudo medir lo recibido."; return out; }
      const received = uint(r[ma].returnData) - uint(r[mi].returnData);
      const left = uint(decodeOrNull(r[tAfter]));
      out.receivedWei = received.toString();
      out.retention = Number(received * 10000n / BUY) / 10000;   // fraction of the ETH spent that came back
      out.tokensLeftRaw = left.toString();
      out.status = received > 0n ? "round_trip_ok" : "sell_failed";
      out.detail = received > 0n ? "Compra y venta simuladas con éxito." : "La venta no devolvió nada.";
      return out;
    } catch (e) {
      out.status = "unknown"; out.error = String(e && e.message || e).slice(0, 160);
      out.detail = "Simulación no disponible.";
      return out;
    }
  }

  const api = { simulate, v4Key, _rpc: rpc, _abi: { abi, encBytes, encBytesArray, word, addr, v4Execute }, BUY_WEI };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.PBSellSim = api;
})(typeof window !== "undefined" ? window : globalThis);
