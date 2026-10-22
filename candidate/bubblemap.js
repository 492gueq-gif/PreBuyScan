/* PreBuyScan wallet map (read-only): top holders as bubbles, linked by who funded them and by
 * token transfers between them; groups of linked wallets are clusters. Highlights the creator,
 * the launch snipers and the pool. Public explorer data only; nothing is signed or sent.
 * Data part works in the browser (window.PBMap) and in Node 18+ for tests.
 */
(function (root) {
  "use strict";
  const BS = "https://robinhoodchain.blockscout.com/api";
  const V4_PM = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
  const BURN = new Set(["0x0000000000000000000000000000000000000000", "0x000000000000000000000000000000000000dead"]);
  const SUPERNODE_NONCE = 2000;   // exchanges, bridges, faucets: too busy to mean "same owner"
  const lc = a => String(a || "").toLowerCase();

  // ---------- clustering (pure) ----------
  function clusters(nodeIds, edges) {
    const parent = {}; nodeIds.forEach(id => { parent[id] = id; });
    const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    for (const e of edges) if (parent[e.a] !== undefined && parent[e.b] !== undefined) parent[find(e.a)] = find(e.b);
    const groups = {};
    for (const id of nodeIds) (groups[find(id)] = groups[find(id)] || []).push(id);
    return Object.values(groups);
  }

  /* Build the graph from already-fetched data (pure, testable).
   * holders: [{addr,pct,contract,name}]  funders: {addr: funderAddr}  transfers: [{from,to}]
   * busy: Set of supernode funders  ctx: {creator, creatorFunder, snipers:Set, pools:Set, lpOwner}
   */
  function graph(holders, funders, transfers, busy, ctx) {
    const nodes = {}, edges = [], seenEdge = new Set();
    const add = (id, o) => { nodes[id] = Object.assign(nodes[id] || { id, pct: 0, kind: "holder" }, o); return nodes[id]; };
    const link = (a, b, type) => {
      if (!a || !b || a === b) return; const k = [a, b].sort().join(">") + type;
      if (seenEdge.has(k)) return; seenEdge.add(k); edges.push({ a, b, type });
    };
    for (const h of holders) add(h.addr, { pct: h.pct, contract: h.contract, name: h.name, kind: "holder" });
    const creator = ctx.creator && lc(ctx.creator);
    if (creator) add(creator, { creator: true, kind: nodes[creator] ? "holder" : "magic" });
    if (creator && ctx.creatorFunder && !busy.has(ctx.creatorFunder)) {
      add(ctx.creatorFunder, { kind: nodes[ctx.creatorFunder] ? nodes[ctx.creatorFunder].kind : "magic", funderOfCreator: true });
      link(ctx.creatorFunder, creator, "fund");
    }
    // Funding links. A funder that is not a holder becomes a "magic node" only if it funded 2+ map wallets.
    const fundCount = {};
    for (const [w, f] of Object.entries(funders)) if (f && !busy.has(f)) fundCount[f] = (fundCount[f] || 0) + 1;
    for (const [w, f] of Object.entries(funders)) {
      if (!f || busy.has(f) || !nodes[w]) continue;
      if (nodes[f] || fundCount[f] >= 2) { add(f, { kind: nodes[f] ? nodes[f].kind : "magic" }); link(f, w, "fund"); }
    }
    // Token transfers between wallets on the map (not through pools or burn).
    for (const t of transfers) {
      const a = lc(t.from), b = lc(t.to);
      if (nodes[a] && nodes[b] && !BURN.has(a) && !BURN.has(b) && !(ctx.pools || new Set()).has(a) && !(ctx.pools || new Set()).has(b)) link(a, b, "token");
    }
    for (const s of ctx.snipers || []) if (nodes[s]) nodes[s].sniper = true;
    const ids = Object.keys(nodes);
    const groups = clusters(ids, edges)
      .map(g => ({ ids: g, pct: g.reduce((t, id) => t + (nodes[id].kind === "holder" && !nodes[id].contract ? nodes[id].pct || 0 : 0), 0),
        holders: g.filter(id => nodes[id].kind === "holder").length, creator: creator ? g.includes(creator) : false }))
      .filter(g => g.ids.length >= 2 && g.holders >= 1)
      .sort((x, y) => (y.creator - x.creator) || (y.pct - x.pct));
    groups.forEach((g, i) => { g.n = i + 1; g.ids.forEach(id => { nodes[id].group = g.n; }); g.pct = Math.round(g.pct * 100) / 100; });
    const creatorGroup = groups.find(g => g.creator) || null;
    const creatorPct = creatorGroup ? creatorGroup.pct : (creator && nodes[creator] ? nodes[creator].pct || 0 : 0);
    return { nodes: Object.values(nodes), edges, groups, creatorPct: Math.round(creatorPct * 100) / 100,
      biggest: groups.filter(g => g.holders >= 2).reduce((m, g) => (g.pct > (m ? m.pct : -1) ? g : m), null) };
  }

  // ---------- fetching ----------
  async function build(token, ctx, opts = {}) {
    const C = root.PBCreator; if (!C) throw new Error("PBCreator missing");
    const progress = opts.progress || (() => {});
    C._budget(opts.budgetMs || 75000);
    token = lc(token);
    const pools = new Set([V4_PM, ...(ctx.pairs || []).map(p => lc(p.pairAddress)).filter(a => /^0x[0-9a-f]{40}$/.test(a))]);
    progress("Leyendo holders…");
    const info = await C._get(BS + "/v2/tokens/" + token);
    const total = BigInt(info.total_supply || "0");
    const h = await C._get(BS + "/v2/tokens/" + token + "/holders");
    const pct = v => total > 0n ? Number(BigInt(v) * 10000n / total) / 100 : 0;
    const holders = (h.items || []).map(it => ({ addr: lc(it.address && it.address.hash), pct: pct(it.value || "0"),
      contract: !!(it.address && it.address.is_contract && it.address.proxy_type !== "eip7702"), name: (it.address && it.address.name) || null }))
      .filter(x => x.addr && !pools.has(x.addr) && !BURN.has(x.addr) && x.addr !== token).slice(0, opts.max || 40);
    // Who funded each wallet (first incoming ETH). Contracts are skipped.
    const funders = {}; const partial = { funders: 0, transfers: false };
    const wallets = holders.filter(x => !x.contract).map(x => x.addr);
    if (ctx.creator && !wallets.includes(lc(ctx.creator))) wallets.push(lc(ctx.creator));
    let i = 0;
    for (const w of wallets) {
      progress("Buscando quién fondeó cada wallet… " + (++i) + "/" + wallets.length);
      try {
        const a = await C._get(BS + "?module=account&action=txlist&address=" + w + "&sort=asc&page=1&offset=5", 8000);
        const f = (a.result || []).find(t => lc(t.to) === w && BigInt(t.value || "0") > 0n);
        funders[w] = f ? lc(f.from) : null;
      } catch (e) { partial.funders++; if (String(e.message).includes("time budget")) break; }
    }
    const creator = ctx.creator ? lc(ctx.creator) : null;
    const creatorFunder = creator ? funders[creator] || ctx.creatorFunder || null : null;
    if (creator) delete funders[creator];
    // Busy funders (exchanges, bridges) are not evidence of a shared owner.
    const busy = new Set(); const fset = [...new Set([...Object.values(funders), creatorFunder].filter(Boolean))];
    const fc = {}; Object.values(funders).forEach(f => { if (f) fc[f] = (fc[f] || 0) + 1; });
    for (const f of fset.filter(f => (fc[f] || 0) >= 2 || f === creatorFunder)) {
      try { const n = Number(BigInt(await C._rpc("eth_getTransactionCount", [f, "latest"]))); if (n > SUPERNODE_NONCE) busy.add(f); }
      catch (e) { /* unknown: keep */ }
    }
    progress("Leyendo transferencias del token…");
    let transfers = [];
    for (const sort of ["asc", "desc"]) {
      try {
        const j = await C._get(BS + "?module=account&action=tokentx&contractaddress=" + token + "&sort=" + sort + "&page=1&offset=300", 15000);
        transfers = transfers.concat((j.result || []).map(t => ({ from: t.from, to: t.to })));
      } catch (e) { partial.transfers = true; }
    }
    const g = graph(holders, funders, transfers, busy, { creator, creatorFunder, pools,
      snipers: new Set(((ctx.snipers && ctx.snipers.wallets) || []).map(w => w.addr)) });
    g.partial = partial; g.checked = wallets.length; g.busy = [...busy];
    return g;
  }

  // ---------- drawing (browser, d3) ----------
  const PALETTE = ["#d1495b", "#2f9e8f", "#e09f3e", "#6c63c7", "#3a86c8", "#b56576", "#7a9e3e", "#c2703d"];
  function draw(el, g, opts = {}) {
    const d3 = root.d3; const W = el.clientWidth || 340, H = Math.round(Math.min(520, Math.max(340, W * 0.9)));
    el.innerHTML = "";
    const svg = d3.select(el).append("svg").attr("viewBox", [0, 0, W, H]).attr("width", "100%").attr("role", "img")
      .attr("aria-label", "Mapa de wallets: burbujas por holder, líneas por fondeo o transferencias");
    const nodes = g.nodes.map(n => Object.assign({}, n));
    const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
    const links = g.edges.map(e => ({ source: byId[e.a], target: byId[e.b], type: e.type }));
    const maxPct = Math.max(1, ...nodes.map(n => n.pct || 0));
    const r = n => n.kind === "magic" ? 6 : 5 + Math.sqrt((n.pct || 0) / maxPct) * Math.min(W, H) * 0.09;
    const color = n => n.group ? PALETTE[(n.group - 1) % PALETTE.length] : "var(--unk)";
    const sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).distance(l => r(l.source) + r(l.target) + 14).strength(0.7))
      .force("charge", d3.forceManyBody().strength(-18))
      .force("collide", d3.forceCollide(n => r(n) + 2))
      .force("x", d3.forceX(W / 2).strength(0.06)).force("y", d3.forceY(H / 2).strength(0.08)).stop();
    for (let i = 0; i < 260; i++) sim.tick();
    nodes.forEach(n => { n.x = Math.max(r(n) + 2, Math.min(W - r(n) - 2, n.x)); n.y = Math.max(r(n) + 2, Math.min(H - r(n) - 2, n.y)); });
    svg.append("g").selectAll("line").data(links).join("line")
      .attr("x1", l => l.source.x).attr("y1", l => l.source.y).attr("x2", l => l.target.x).attr("y2", l => l.target.y)
      .attr("stroke", l => color(l.source)).attr("stroke-opacity", 0.75).attr("stroke-width", 1.4)
      .attr("stroke-dasharray", l => l.type === "fund" ? "3 3" : null);
    const nodeG = svg.append("g").selectAll("g").data(nodes).join("g").attr("transform", n => `translate(${n.x},${n.y})`)
      .attr("tabindex", 0).attr("role", "button").style("cursor", "pointer")
      .attr("aria-label", n => (n.creator ? "Creador " : "") + n.id + (n.pct ? ", " + n.pct + " %" : ""));
    nodeG.append("circle").attr("r", r)
      .attr("fill", n => n.kind === "magic" ? "transparent" : color(n)).attr("fill-opacity", n => n.group ? 0.55 : 0.28)
      .attr("stroke", n => n.creator ? "var(--ink)" : color(n)).attr("stroke-width", n => n.creator ? 2.5 : 1.4)
      .attr("stroke-dasharray", n => n.kind === "magic" ? "3 2" : null);
    nodeG.filter(n => n.creator).append("text").text("★").attr("text-anchor", "middle").attr("dy", "0.35em")
      .attr("font-size", 13).attr("fill", "var(--ink)");
    nodeG.filter(n => n.sniper && !n.creator).append("text").text("S").attr("text-anchor", "middle").attr("dy", "0.35em")
      .attr("font-size", 10).attr("font-weight", 700).attr("fill", "var(--ink)");
    const pick = n => { if (opts.onPick) opts.onPick(n); nodeG.selectAll("circle").attr("stroke-width", m => m === n ? 3.5 : (m.creator ? 2.5 : 1.4)); };
    nodeG.on("click", (ev, n) => pick(n)).on("keydown", (ev, n) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(n); } });
    return svg;
  }

  const api = { build, graph, clusters, draw, PALETTE };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PBMap = api;
})(typeof window !== "undefined" ? window : globalThis);
