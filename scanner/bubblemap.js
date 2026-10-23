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
    // Deployer of a funding contract: drawn only if it connects to a time node that is on the map.
    for (const e of ctx.extra || []) {
      if (!nodes[e.b] || busy.has(e.a)) continue;
      add(e.a, { kind: nodes[e.a] ? nodes[e.a].kind : "magic", deployer: true }); link(e.a, e.b, "fund");
    }
    for (const n of Object.values(nodes)) if (n.id.includes("@")) { n.timeNode = true; n.label = "contrato que fondeó en la misma hora"; }
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
    C._budget(opts.budgetMs || 90000);
    token = lc(token);
    const pools = new Set([V4_PM, ...(ctx.pairs || []).map(p => lc(p.pairAddress)).filter(a => /^0x[0-9a-f]{40}$/.test(a))]);
    progress("Leyendo holders…");
    const info = await C._get(BS + "/v2/tokens/" + token);
    const total = BigInt(info.total_supply || "0");
    const h = await C._get(BS + "/v2/tokens/" + token + "/holders");
    const pct = v => total > 0n ? Number(BigInt(v) * 10000n / total) / 100 : 0;
    const holders = (h.items || []).map(it => ({ addr: lc(it.address && it.address.hash), pct: pct(it.value || "0"),
      contract: !!(it.address && it.address.is_contract && it.address.proxy_type !== "eip7702"), name: (it.address && it.address.name) || null }))
      .filter(x => x.addr && !pools.has(x.addr) && !BURN.has(x.addr) && x.addr !== token).slice(0, opts.max || 30);
    // Launch snipers that still hold tokens join the map even if they are not top holders.
    const known = new Set(holders.map(x => x.addr));
    for (const w of ((ctx.snipers && ctx.snipers.wallets) || [])) {
      if (!known.has(w.addr) && (w.pct || 0) > 0 && !pools.has(w.addr)) { holders.push({ addr: w.addr, pct: w.pct, contract: false, name: null }); known.add(w.addr); }
    }
    const partial = { funders: 0, transfers: false };
    // Token transfers between wallets (v2 API, newest first, up to 4 pages).
    progress("Leyendo transferencias del token…");
    let transfers = [], next = null;
    for (let pg = 0; pg < 4; pg++) {
      try {
        const qs = next ? "?" + new URLSearchParams(next).toString() : "";
        const j = await C._get(BS + "/v2/tokens/" + token + "/transfers" + qs, 15000);
        transfers = transfers.concat((j.items || []).map(t => ({ from: t.from && t.from.hash, to: t.to && t.to.hash })));
        next = j.next_page_params; if (!next) break;
      } catch (e) { partial.transfers = true; break; }
    }
    // Who funded each wallet (first incoming ETH). Reuse what the scan already found; contracts are skipped.
    const funders = {}, fts = {};
    for (const w of ((ctx.snipers && ctx.snipers.wallets) || [])) if (w.funder) funders[w.addr] = w.funder;
    const creator = ctx.creator ? lc(ctx.creator) : null;
    const wallets = holders.filter(x => !x.contract).map(x => x.addr);
    if (creator && !wallets.includes(creator)) wallets.push(creator);
    const todo = wallets.filter(w => !(w in funders) && !(w === creator && ctx.creatorFunder));
    let done = 0, stop = false;
    async function worker() {
      while (todo.length && !stop) {
        const w = todo.shift();
        try {
          const f = await C._firstFunder(w);
          funders[w] = f.funder || null; fts[w] = f.ts || null;
        } catch (e) { partial.funders++; if (String(e.message).includes("time budget")) stop = true; }
        progress("Buscando quién fondeó cada wallet… " + (++done) + "/" + (done + todo.length));
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
    partial.funders += todo.length;
    const creatorFunder = creator ? (ctx.creatorFunder || funders[creator] || null) : null;
    if (creator) delete funders[creator];
    // Busy funders (exchanges, bridges) are not evidence of a shared owner.
    const busy = new Set(); const fc = {};
    Object.values(funders).forEach(f => { if (f) fc[f] = (fc[f] || 0) + 1; });
    for (const f of [...new Set([...Object.keys(fc).filter(f => fc[f] >= 2), creatorFunder].filter(Boolean))]) {
      try { const n = Number(BigInt(await C._rpc("eth_getTransactionCount", [f, "latest"]))); if (n > SUPERNODE_NONCE) busy.add(f); }
      catch (e) { /* unknown: keep */ }
    }
    // Contract funders (disperse contracts, bridges): only wallets funded within the same hour count
    // as one group ("time node"), and the contract's deployer is linked when known.
    const extra = [];
    for (const f of Object.keys(fc).filter(f => fc[f] >= 2 && !busy.has(f))) {
      let info = null;
      try { info = await C._get(BS + "/v2/addresses/" + f, 8000); } catch (e) { continue; }
      if (!info || !info.is_contract || info.proxy_type === "eip7702") continue;
      const ws = Object.keys(funders).filter(w => funders[w] === f).sort((a, b) => (fts[a] || 0) - (fts[b] || 0));
      let bucket = 0, start = null;
      for (const w of ws) {
        if (fts[w] == null) { funders[w] = null; continue; }
        if (start == null || fts[w] - start > 3600e3) { bucket++; start = fts[w]; }
        funders[w] = f + "@" + bucket;
      }
      const dep = lc(info.creator_address_hash);
      for (let b = 1; b <= bucket; b++) if (dep) extra.push({ a: dep, b: f + "@" + b });
    }
    const g = graph(holders, funders, transfers, busy, { creator, creatorFunder, pools, extra,
      snipers: new Set(((ctx.snipers && ctx.snipers.wallets) || []).map(w => w.addr)) });
    g.partial = partial; g.checked = wallets.length; g.holdersShown = holders.length; g.busy = [...busy];
    return g;
  }

  // ---------- drawing (browser, d3) ----------
  // Arkham-style live graph: zoom/pan, drag, hover focus, animated money flow, detail card.
  const PALETTE = ["#ff5f6d", "#27e6a3", "#ffb547", "#8b7cff", "#3fa9ff", "#ff7ac6", "#a3e635", "#ff9f43"];
  const short = a => { const s = String(a).split("@")[0]; return s.slice(0, 6) + "…" + s.slice(-4); };
  function draw(el, g, opts = {}) {
    const d3 = root.d3; const W = el.clientWidth || 340;
    const H = Math.round(W >= 700 ? Math.min(620, Math.max(460, W * 0.62)) : Math.min(520, Math.max(380, W * 1.05)));
    const still = root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (el._pbStop) el._pbStop();
    el.innerHTML = ""; el.classList.add("akmap"); el.style.height = H + "px";
    const nodes = g.nodes.map(n => Object.assign({}, n));
    const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
    const links = g.edges.filter(e => byId[e.a] && byId[e.b]).map(e => ({ source: byId[e.a], target: byId[e.b], type: e.type }));
    const nb = new Map(nodes.map(n => [n, new Set()]));
    links.forEach(l => { nb.get(l.source).add(l.target); nb.get(l.target).add(l.source); });
    const maxPct = Math.max(1, ...nodes.map(n => n.pct || 0));
    const r = n => n.kind === "magic" ? 7 : 7 + Math.sqrt((n.pct || 0) / maxPct) * Math.min(W, H) * 0.075;
    const color = n => n.creator ? "#ffffff" : n.group ? PALETTE[(n.group - 1) % PALETTE.length] : n.contract ? "#b9a7ff" : n.kind === "magic" ? "#7f93a3" : "#4cb8ff";
    const role = n => n.creator ? "Creador" : n.sniper ? "Sniper del primer minuto" : n.timeNode ? "Contrato fondeador (misma hora)" : n.deployer ? "Creó el contrato fondeador" : n.kind === "magic" ? "Conector (no es holder)" : n.contract ? "Contrato" + (n.name ? " · " + n.name : "") : "Holder";
    nodes.forEach((n, i) => { const a = i * 2.399; n.x = W / 2 + Math.cos(a) * 8 * Math.sqrt(i); n.y = H / 2 + Math.sin(a) * 8 * Math.sqrt(i); });

    const svg = d3.select(el).append("svg").attr("viewBox", [0, 0, W, H]).attr("width", "100%").attr("height", H)
      .attr("role", "img").attr("aria-label", "Mapa de wallets: burbujas por holder, líneas por fondeo o transferencias");
    const defs = svg.append("defs");
    const glow = defs.append("filter").attr("id", "akglow").attr("x", "-80%").attr("y", "-80%").attr("width", "260%").attr("height", "260%");
    glow.append("feGaussianBlur").attr("stdDeviation", 6).attr("result", "b");
    const fm = glow.append("feMerge"); fm.append("feMergeNode").attr("in", "b"); fm.append("feMergeNode").attr("in", "SourceGraphic");
    [...new Set(nodes.map(color))].forEach((c, i) => {
      const gr = defs.append("radialGradient").attr("id", "akg" + i).attr("cx", "35%").attr("cy", "30%").attr("r", "75%");
      gr.append("stop").attr("offset", "0%").attr("stop-color", c).attr("stop-opacity", .95);
      gr.append("stop").attr("offset", "60%").attr("stop-color", c).attr("stop-opacity", .45);
      gr.append("stop").attr("offset", "100%").attr("stop-color", c).attr("stop-opacity", .12);
    });
    const gid = {}; [...new Set(nodes.map(color))].forEach((c, i) => { gid[c] = "url(#akg" + i + ")"; });
    const world = svg.append("g");
    const zoom = d3.zoom().scaleExtent([0.35, 5]).on("zoom", ev => world.attr("transform", ev.transform));
    svg.call(zoom).on("dblclick.zoom", null);

    // ---- 3D "molecule" projection: nodes get depth, the graph turns toward the pointer ----
    const cx = W / 2, cy = H / 2, depth = Math.min(W, H) * 0.46, FOC = 620;
    const gz = {}; nodes.forEach((n, i) => { const g0 = n.group || 0; if (g0 && gz[g0] == null) gz[g0] = (Math.sin(g0 * 12.9898) * 0.5) * depth;
      n.z = (g0 ? gz[g0] : 0) + (Math.sin(i * 78.233 + 1.7) * 0.5) * depth * (g0 ? 0.5 : 1.3); n.ph = i * 1.618; n.px = n.x; n.py = n.y; n.ps = 1; n.pz = 0; });
    const view = { ax: 0, ay: 0, tax: 0, tay: 0, spin: 0, active: 0, act: 0, drag: false, t: 0 };
    const project = () => {
      const cax = Math.cos(view.ax), sax = Math.sin(view.ax), cay = Math.cos(view.ay + view.spin), say = Math.sin(view.ay + view.spin);
      const amp = 1.4 + view.act * 6.5, t = view.t;
      for (const n of nodes) {
        const jx = Math.sin(t * 1.3 + n.ph) * amp, jy = Math.cos(t * 1.1 + n.ph * 1.3) * amp, jz = Math.sin(t * 0.9 + n.ph * 0.7) * amp * 4;
        const dx = n.x - cx + jx, dy = n.y - cy + jy, dz = (n.z + jz) * view.act;
        const x1 = dx * cay + dz * say, z1 = -dx * say + dz * cay;
        const y1 = dy * cax - z1 * sax, z2 = dy * sax + z1 * cax;
        const p = FOC / (FOC + z2); n.px = cx + x1 * p; n.py = cy + y1 * p; n.ps = p; n.pz = z2;
      }
    };
    const curve = l => { const sx = l.source.px, sy = l.source.py, tx = l.target.px, ty = l.target.py;
      const mx = (sx + tx) / 2, my = (sy + ty) / 2, dx = tx - sx, dy = ty - sy, k = 0.18;
      return [sx, sy, mx - dy * k, my + dx * k, tx, ty]; };
    const linkSel = world.append("g").attr("class", "ak-links").selectAll("path").data(links).join("path")
      .attr("fill", "none").attr("stroke", l => color(l.source)).attr("stroke-width", l => l.type === "fund" ? 1.3 : 1.8)
      .attr("stroke-opacity", .38).attr("class", l => l.type === "fund" ? "ak-fund" : "ak-tok");
    const partG = world.append("g").attr("class", "ak-parts");
    const parts = still ? [] : links.slice(0, 160).map((l, i) => ({ l, t: (i * 0.137) % 1, v: 0.0035 + (i % 5) * 0.0009 }));
    const partSel = partG.selectAll("circle").data(parts).join("circle").attr("r", p => p.l.type === "fund" ? 2 : 2.6)
      .attr("fill", p => color(p.l.source)).attr("filter", "url(#akglow)");

    const nodeG = world.append("g").selectAll("g").data(nodes).join("g").attr("class", "ak-node")
      .attr("tabindex", 0).attr("role", "button").style("cursor", "pointer")
      .attr("aria-label", n => role(n) + " " + n.id.split("@")[0] + (n.pct ? ", " + n.pct + " %" : ""));
    nodeG.filter(n => n.creator || n.sniper || (n.pct || 0) >= maxPct * 0.5).append("circle").attr("class", "ak-halo")
      .attr("r", n => r(n) + 6).attr("fill", "none").attr("stroke", color).attr("stroke-opacity", .5).attr("stroke-width", 1.5);
    nodeG.filter(n => n.creator).append("circle").attr("class", "ak-orbit").attr("r", n => r(n) + 11).attr("fill", "none")
      .attr("stroke", "#ffffff").attr("stroke-opacity", .7).attr("stroke-width", 1.2).attr("stroke-dasharray", "2 6");
    nodeG.append("circle").attr("class", "ak-core").attr("r", r)
      .attr("fill", n => n.kind === "magic" ? "rgba(8,17,26,.9)" : gid[color(n)])
      .attr("stroke", color).attr("stroke-width", n => n.creator ? 2.4 : 1.4)
      .attr("stroke-dasharray", n => n.kind === "magic" ? "3 2" : null).attr("filter", n => n.creator || n.group ? "url(#akglow)" : null);
    nodeG.filter(n => n.creator).append("text").text("★").attr("text-anchor", "middle").attr("dy", "0.36em").attr("font-size", n => Math.max(12, r(n) * 0.9)).attr("fill", "#050b12");
    nodeG.filter(n => n.sniper && !n.creator).append("text").text("S").attr("text-anchor", "middle").attr("dy", "0.36em").attr("font-size", 11).attr("font-weight", 800).attr("fill", "#050b12");
    const lab = nodeG.filter(n => n.creator || n.sniper || n.timeNode || (n.pct || 0) >= Math.max(0.8, maxPct * 0.12)).append("g").attr("class", "ak-lab");
    lab.append("text").attr("class", "ak-addr").attr("text-anchor", "middle").attr("y", n => r(n) + 15).text(n => n.creator ? "CREADOR" : short(n.id));
    lab.append("text").attr("class", "ak-pct").attr("text-anchor", "middle").attr("y", n => r(n) + 28).text(n => n.pct ? n.pct.toLocaleString("es-MX", { maximumFractionDigits: 2 }) + " %" : role(n).split(" ")[0]);

    // overlays
    const wrap = d3.select(el);
    const nGroups = new Set(nodes.filter(n => n.group).map(n => n.group)).size;
    wrap.append("div").attr("class", "ak-hud").html(`<b>ENTITY GRAPH</b><span>${nodes.length} wallets · ${links.length} conexiones · ${nGroups} grupos</span>`);
    const tb = wrap.append("div").attr("class", "ak-tools");
    const tool = (t, lbl, fn) => tb.append("button").attr("type", "button").attr("title", lbl).attr("aria-label", lbl).text(t).on("click", fn);
    tool("+", "Acercar", () => svg.transition().duration(250).call(zoom.scaleBy, 1.4));
    tool("−", "Alejar", () => svg.transition().duration(250).call(zoom.scaleBy, 1 / 1.4));
    tool("⟲", "Centrar", () => fit(400));
    let flowing = !still;
    const fb = tool(flowing ? "⏸" : "▶", "Pausar o reanudar el flujo", () => { flowing = !flowing; fb.text(flowing ? "⏸" : "▶"); });
    tool("⤢", "Pantalla completa", () => { const x = el; if (document.fullscreenElement) document.exitFullscreen(); else if (x.requestFullscreen) x.requestFullscreen().catch(() => {}); });
    const tip = wrap.append("div").attr("class", "ak-tip").style("opacity", 0);
    const card = wrap.append("div").attr("class", "ak-card").attr("hidden", true);
    wrap.append("div").attr("class", "ak-hint").text("Arrastra para mover · rueda o pellizco para zoom · toca una burbuja");

    let picked = null;
    const focus = n => {
      const keep = n ? new Set([n, ...nb.get(n)]) : null;
      nodeG.classed("dim", m => keep && !keep.has(m)).classed("on", m => m === n);
      linkSel.classed("dim", l => keep && !(l.source === n || l.target === n)).classed("hot", l => n && (l.source === n || l.target === n));
      partSel.classed("dim", p => keep && !(p.l.source === n || p.l.target === n));
    };
    const showCard = n => {
      const ns = [...nb.get(n)].sort((a, b) => (b.pct || 0) - (a.pct || 0)).slice(0, 6);
      const id = n.id.split("@")[0];
      card.attr("hidden", null).html(`<button type="button" class="ak-x" aria-label="Cerrar">×</button>
        <div class="ak-role" style="color:${color(n)}">${role(n)}</div><div class="ak-id">${id}</div>
        <dl><div><dt>Suministro</dt><dd>${n.kind === "magic" ? "no es holder" : (n.pct || 0).toLocaleString("es-MX", { maximumFractionDigits: 2 }) + " %"}</dd></div>
        <div><dt>Grupo</dt><dd>${n.group ? "#" + n.group : "—"}</dd></div><div><dt>Conexiones</dt><dd>${nb.get(n).size}</dd></div></dl>
        ${ns.length ? `<div class="ak-sub">Conectada con</div><ul>${ns.map(m => `<li data-id="${m.id}"><i style="background:${color(m)}"></i>${m.creator ? "Creador" : short(m.id)}<span>${m.pct ? m.pct.toLocaleString("es-MX", { maximumFractionDigits: 2 }) + " %" : ""}</span></li>`).join("")}</ul>` : ""}
        <div class="ak-acts">${/^0x[0-9a-f]{40}$/i.test(id) && !n.contract ? `<a href="?t=${id}">Perfil de la wallet</a>` : ""}<a href="https://robinhoodchain.blockscout.com/address/${id}" target="_blank" rel="noopener">Explorador ↗</a></div>`);
      card.select(".ak-x").on("click", () => { picked = null; card.attr("hidden", true); focus(null); });
      card.selectAll("li").on("click", function () { const m = byId[this.dataset.id]; if (m) pick(m, true); });
    };
    const pick = (n, center) => {
      picked = n; focus(n); showCard(n); if (opts.onPick) opts.onPick(n);
      if (center) { const t = d3.zoomTransform(svg.node()); svg.transition().duration(450).call(zoom.translateTo, n.px, n.py); void t; }
    };
    nodeG.on("mouseenter", (ev, n) => { hovered = n; if (!picked) focus(n);
        tip.style("opacity", 1).html(`<b>${n.creator ? "Creador" : short(n.id)}</b><span>${role(n)}${n.pct ? " · " + n.pct.toLocaleString("es-MX", { maximumFractionDigits: 2 }) + " %" : ""}</span>`); })
      .on("mousemove", ev => { const b = el.getBoundingClientRect(); tip.style("left", (ev.clientX - b.left + 14) + "px").style("top", (ev.clientY - b.top + 14) + "px"); })
      .on("mouseleave", () => { hovered = null; tip.style("opacity", 0); if (!picked) focus(null); else focus(picked); })
      .on("click", (ev, n) => { ev.stopPropagation(); pick(n); })
      .on("keydown", (ev, n) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(n, true); } });
    svg.on("click", () => { picked = null; card.attr("hidden", true); focus(null); });

    const sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).distance(l => r(l.source) + r(l.target) + 34).strength(0.55))
      .force("charge", d3.forceManyBody().strength(n => -60 - r(n) * 4))
      .force("collide", d3.forceCollide(n => r(n) + 10))
      .force("x", d3.forceX(W / 2).strength(0.05)).force("y", d3.forceY(H / 2).strength(0.07));
    let frame = 0;
    const paint = () => {
      project();
      const dmax = depth * 1.2;
      linkSel.attr("d", l => { const c = curve(l); return `M${c[0]},${c[1]}Q${c[2]},${c[3]} ${c[4]},${c[5]}`; })
        .attr("stroke-opacity", l => Math.max(.12, .45 - ((l.source.pz + l.target.pz) / 2 / dmax) * .3));
      nodeG.attr("transform", n => `translate(${n.px},${n.py}) scale(${(n.ps * (n === hovered ? 1.22 : 1)).toFixed(3)})`)
        .each(function (n) { this.style.opacity = this.classList.contains("dim") ? "" : Math.max(.25, Math.min(1, 1 - (n.pz / dmax) * .75)).toFixed(2); });
      if (++frame % 8 === 0) nodeG.sort((a, b) => b.pz - a.pz);
    };
    let hovered = null;
    nodeG.call(d3.drag()
      .subject((ev, n) => ({ x: n.px, y: n.py }))
      .on("start", (ev, n) => { view.drag = true; if (!ev.active) sim.alphaTarget(0.25).restart(); n.fx = n.x; n.fy = n.y; })
      .on("drag", (ev, n) => { n.fx = ev.x; n.fy = ev.y; })
      .on("end", (ev, n) => { view.drag = false; if (!ev.active) sim.alphaTarget(0); n.fx = null; n.fy = null; }));
    // pointer over the map → 3D mode; leaving → eases back to flat
    let idleT = 0;
    const svgEl = svg.node();
    const aim = ev => { const b = svgEl.getBoundingClientRect(); const mx = (ev.clientX - b.left) / b.width - .5, my = (ev.clientY - b.top) / b.height - .5;
      view.tay = mx * 2.3; view.tax = -my * 1.6; view.active = 1; clearTimeout(idleT); };
    svgEl.addEventListener("pointermove", aim); svgEl.addEventListener("pointerdown", aim);
    svgEl.addEventListener("pointerenter", aim);
    svgEl.addEventListener("pointerleave", () => { idleT = setTimeout(() => { view.active = 0; view.tax = 0; view.tay = 0; }, 900); });
    svgEl.addEventListener("pointerup", ev => { if (ev.pointerType !== "mouse") idleT = setTimeout(() => { view.active = 0; view.tax = 0; view.tay = 0; }, 4000); });
    function fit(ms) {
      if (!nodes.length) return; const pad = 40;
      const x0 = d3.min(nodes, n => n.x - r(n)), x1 = d3.max(nodes, n => n.x + r(n)), y0 = d3.min(nodes, n => n.y - r(n)), y1 = d3.max(nodes, n => n.y + r(n) + 30);
      const k = Math.min(2.2, 0.95 * Math.min((W - pad * 2) / Math.max(1, x1 - x0), (H - pad * 2) / Math.max(1, y1 - y0)));
      const t = d3.zoomIdentity.translate(W / 2 - k * (x0 + x1) / 2, H / 2 - k * (y0 + y1) / 2).scale(k);
      (ms ? svg.transition().duration(ms) : svg).call(zoom.transform, t);
    }
    if (still) { sim.stop(); for (let i = 0; i < 300; i++) sim.tick(); paint(); fit(0); }
    else { sim.on("tick", () => {}); let fitted = false; sim.on("end", () => { if (!fitted) { fitted = true; fit(700); } }); setTimeout(() => { if (!fitted) { fitted = true; fit(700); } }, 2600); }

    let raf = 0, onScreen = true;
    // Off-screen maps do not animate (a phone keeps its frame budget for scrolling).
    try { new IntersectionObserver(es => { onScreen = es.some(e => e.isIntersecting); }).observe(el); } catch (e) { /* old browser: always on */ }
    function loop() {
      cancelAnimationFrame(raf);
      const stepF = () => {
        if (!el.isConnected) return;
        raf = requestAnimationFrame(stepF);
        if (document.hidden || !onScreen) return;
        view.t += 0.016 * (0.6 + view.act * 2.4);
        const want = view.drag ? 0 : view.active;
        view.act += (want - view.act) * 0.06;
        const tx = view.drag ? 0 : view.tax, ty = view.drag ? 0 : view.tay;
        view.ax += (tx - view.ax) * 0.1; view.ay += (ty - view.ay) * 0.1;
        if (view.active && !view.drag) view.spin += 0.007; else view.spin *= 0.96;
        paint();
        if (flowing) partSel.each(function (p) { p.t += p.v; if (p.t > 1) p.t -= 1; const c = curve(p.l), u = p.t, a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, d = u * u;
            this.setAttribute("cx", a * c[0] + b * c[2] + d * c[4]); this.setAttribute("cy", a * c[1] + b * c[3] + d * c[5]); });
      };
      raf = requestAnimationFrame(stepF);
    }
    if (!still) loop();
    el._pbStop = () => { cancelAnimationFrame(raf); sim.stop(); };
    return svg;
  }

  const api = { build, graph, clusters, draw, PALETTE };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PBMap = api;
})(typeof window !== "undefined" ? window : globalThis);
