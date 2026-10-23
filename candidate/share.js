/* PreBuyScan Smart Share Engine.
 * Turns a real PreBuyScan analysis into three deterministic share cards (Canvas, no AI images):
 *   X 1600×900 · Telegram 1080×1080 · Premium report 1080×1350 with a verifiable QR.
 * The engine never computes risk: it only reads the report built from the scanner's results.
 * Integrity: SHA-256 of the canonical report; the QR/link embeds the report so the page can
 * recompute the hash. There is no digital signature yet (that needs a server-held key).
 */
(function (root) {
  "use strict";
  const C = { bg: "#050B12", sheet: "#0B1724", sheet2: "#0F1F2F", line: "#1B3044", teal: "#00E5C4", white: "#F4F7FB",
    gray: "#94A3B8", yellow: "#FFBF3C", red: "#FF4757", slate: "#8FAFC5", green: "#22E39B" };
  const STATE = {
    confirmed: { label: "RIESGO CONFIRMADO", color: C.red, icon: "✕" },
    suspicious: { label: "SEÑAL SOSPECHOSA", color: C.yellow, icon: "!" },
    pending: { label: "PENDIENTE", color: C.slate, icon: "?" },
    clear: { label: "SIN ALERTAS DETECTADAS", color: C.green, icon: "✓" }
  };
  const SITE = "https://492gueq-gif.github.io/PreBuyScan/";
  const FONT_D = "Sora, 'Helvetica Neue', Arial, sans-serif", FONT_B = "Manrope, Arial, sans-serif", FONT_M = "'JetBrains Mono', ui-monospace, monospace";

  // ---------- classification (from the scanner's own findings; never recomputed from colours) ----------
  // Confirmed = technical evidence from simulation or contract code / on-chain state.
  const CONFIRMED = /^(La venta simulada falla|La venta falla con montos grandes|Pérdida muy alta al vender|El creador puede retirar la liquidez|Una wallet (controla|puede retirar) la liquidez|No hay contrato en esa dirección|Puede crear tokens nuevos|Puede bloquear wallets|Puede cambiar las comisiones|Puede pausar o activar|Puede limitar cuánto|El contrato tiene dueño activo|El dueño tiene mucho del suministro)/;
  function classify(check) {
    const t = check.t || "";
    if (check.s === "ok") return { state: "clear", label: STATE.clear.label };
    if (check.s === "unk") {
      if (/^Venta no simulada/.test(t)) return { state: "pending", label: "SIMULACIÓN PENDIENTE", kind: "pendiente" };
      if (/^Dueño del contrato no identificado/.test(t)) return { state: "pending", label: "IDENTIDAD NO VERIFICADA", kind: "no verificado" };
      if (/no disponible/i.test(t)) return { state: "pending", label: "NO DISPONIBLE", kind: "no disponible" };
      if (/no revisad|no identificado|incompleto|No sabemos/i.test(t)) return { state: "pending", label: "NO VERIFICADO", kind: "no verificado" };
      return { state: "pending", label: "NO VERIFICADO", kind: "no verificado" };
    }
    if (check.s === "high" && CONFIRMED.test(t)) return { state: "confirmed", label: STATE.confirmed.label };
    return { state: "suspicious", label: STATE.suspicious.label };
  }
  const ORDER = { confirmed: 0, suspicious: 1, pending: 2, clear: 3 };

  // ---------- EIP-55 checksum ----------
  function checksum(addr) {
    const a = String(addr).toLowerCase().replace(/^0x/, "");
    if (!/^[0-9a-f]{40}$/.test(a) || !root.PBCreator) return "0x" + a;
    const h = root.PBCreator.keccak(Array.from(a).map(c => c.charCodeAt(0).toString(16).padStart(2, "0")).join("")).slice(2);
    return "0x" + Array.from(a).map((c, i) => (/[a-f]/.test(c) && parseInt(h[i], 16) >= 8 ? c.toUpperCase() : c)).join("");
  }

  // ---------- report model ----------
  // Compact, canonical, verifiable. Field order is fixed by canonical() (sorted keys).
  function buildReport(token, res, ctx) {
    const pair = res.pair || null, cr = res.cr || {};
    const checks = res.checks.map(c => ({ ...c, cls: classify(c) }));
    checks.sort((a, b) => ORDER[a.cls.state] - ORDER[b.cls.state]);
    const top = checks.filter(c => c.cls.state !== "clear");
    const alerts = (top.length ? top : checks).slice(0, 8).map(c => [c.cls.state, c.cls.label, c.t, (c.d || "").slice(0, 140)]);
    const info = pair && pair.info || {};
    const h24 = pair && pair.txns && pair.txns.h24 || {};
    const fdvKind = pair && pair.marketCap != null ? "mc" : pair && pair.fdv != null ? "fdv" : null;
    return {
      v: 1, c: 4663, a: String(token).toLowerCase(),
      n: (pair && pair.baseToken && pair.baseToken.name) || (cr.creator && cr.creator.tokenName) || "",
      s: (pair && pair.baseToken && pair.baseToken.symbol) || "",
      sc: ctx.score, vd: ctx.verdict, cf: ctx.confidence, al: ctx.algo, b: res.block || null,
      ts: Math.floor((res.scannedAt || Date.now()) / 1000),
      x: alerts,
      m: pair ? { l: num(pair.liquidity && pair.liquidity.usd), v: num(pair.volume && pair.volume.h24),
        f: num(fdvKind === "mc" ? pair.marketCap : pair.fdv), fk: fdvKind,
        ag: pair.pairCreatedAt ? Math.floor(pair.pairCreatedAt / 1000) : null,
        h: cr.holders && cr.holders.count ? cr.holders.count : null, tb: h24.buys ?? null, ts: h24.sells ?? null } : null,
      lg: info.imageUrl ? 1 : 0
    };
  }
  const num = v => (v == null || isNaN(v) ? null : Math.round(Number(v)));
  function canonical(o) {
    if (Array.isArray(o)) return "[" + o.map(canonical).join(",") + "]";
    if (o && typeof o === "object") return "{" + Object.keys(o).sort().map(k => JSON.stringify(k) + ":" + canonical(o[k])).join(",") + "}";
    return JSON.stringify(o === undefined ? null : o);
  }
  async function hashReport(rep) {
    const data = new TextEncoder().encode(canonical(rep));
    const d = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  const b64u = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unb64u = s => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));
  // Link embeds a lighter copy of the report (descriptions trimmed) so the QR stays readable.
  function linkPayload(rep) { return { ...rep, x: rep.x.slice(0, 6).map(a => [a[0], a[1], a[2], ""]) }; }
  async function verifiableLink(rep) {
    const lite = linkPayload(rep);
    const h = await hashReport(lite);
    const id = h.slice(0, 16);
    return { id, hash: h, url: SITE + "?t=" + rep.a + "&r=" + id + "&b=" + (rep.b || "") + "&v=" + encodeURIComponent(rep.al) + "#rep=" + b64u(canonical(lite)) };
  }
  async function verifyFromLocation(loc) {
    const m = /#rep=([A-Za-z0-9_-]+)/.exec(loc.hash || "");
    if (!m) return null;
    const q = new URLSearchParams(loc.search);
    let rep;
    try { rep = JSON.parse(unb64u(m[1])); } catch (e) { return { ok: false, reason: "El reporte del enlace está dañado." }; }
    const h = await hashReport(rep);
    const id = h.slice(0, 16);
    const okId = q.get("r") === id, okAddr = (q.get("t") || "").toLowerCase() === rep.a;
    return { ok: okId && okAddr, id, hash: h, rep, reason: !okId ? "El identificador no coincide con el contenido: el reporte fue modificado." : !okAddr ? "La dirección del enlace no coincide con la del reporte." : "" };
  }

  // ---------- drawing helpers ----------
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function box(g, x, y, w, h, r, fill, stroke, glow, lw) {
    rr(g, x, y, w, h, r); if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.save(); if (glow) { g.shadowColor = stroke; g.shadowBlur = glow; } g.strokeStyle = stroke; g.lineWidth = lw || 2; g.stroke(); g.restore(); }
  }
  function fit(g, text, maxW, size, weight, family, min) {
    let s = size; g.font = weight + " " + s + "px " + family;
    while (g.measureText(text).width > maxW && s > (min || 18)) { s -= 2; g.font = weight + " " + s + "px " + family; }
    let t = text; if (g.measureText(t).width > maxW) { while (t.length > 3 && g.measureText(t + "…").width > maxW) t = t.slice(0, -1); t += "…"; }
    return { t, s };
  }
  function txt(g, t, x, y, size, weight, color, family, align) { g.font = weight + " " + size + "px " + (family || FONT_B); g.fillStyle = color; g.textAlign = align || "left"; g.textBaseline = "alphabetic"; g.fillText(t, x, y); g.textAlign = "left"; }
  function shield(g, x, y, s) {
    g.save(); g.translate(x, y); g.scale(s / 100, s / 100);
    g.beginPath(); g.moveTo(50, 4); g.lineTo(92, 18); g.lineTo(92, 50); g.bezierCurveTo(92, 76, 72, 92, 50, 100); g.bezierCurveTo(28, 92, 8, 76, 8, 50); g.lineTo(8, 18); g.closePath();
    g.shadowColor = C.teal; g.shadowBlur = 16; g.strokeStyle = C.teal; g.lineWidth = 8; g.stroke(); g.shadowBlur = 0;
    g.beginPath(); g.moveTo(30, 52); g.lineTo(45, 67); g.lineTo(72, 38); g.strokeStyle = C.teal; g.lineWidth = 10; g.lineCap = "round"; g.lineJoin = "round"; g.stroke();
    g.restore();
  }
  function brand(g, x, y, size, sub) {
    shield(g, x, y - size * 0.95, size * 1.15);
    g.font = "800 " + size + "px " + FONT_D; g.fillStyle = C.white; g.fillText("PreBuy", x + size * 1.35, y);
    const w = g.measureText("PreBuy").width; g.fillStyle = C.teal; g.fillText("Scan", x + size * 1.35 + w, y);
    if (sub) txt(g, sub, x + size * 1.38, y + size * 0.52, Math.round(size * 0.34), 600, C.gray);
  }
  function chainIcon(g, x, y, s) {
    g.save(); g.strokeStyle = C.teal; g.lineWidth = s * 0.12; g.lineCap = "round";
    rr(g, x, y + s * 0.25, s * 0.6, s * 0.5, s * 0.25); g.stroke(); rr(g, x + s * 0.4, y + s * 0.25, s * 0.6, s * 0.5, s * 0.25); g.stroke(); g.restore();
  }
  function gauge(g, cx, cy, r, score, verdict, color) {
    g.save(); g.lineCap = "round";
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    g.beginPath(); g.arc(cx, cy, r, a0, a1); g.strokeStyle = "rgba(148,163,184,.18)"; g.lineWidth = r * 0.16; g.stroke();
    const grad = g.createLinearGradient(cx - r, cy, cx + r, cy); grad.addColorStop(0, C.red); grad.addColorStop(0.5, C.yellow); grad.addColorStop(1, C.green);
    const end = a0 + (a1 - a0) * Math.max(0.02, Math.min(1, score / 100));
    g.beginPath(); g.arc(cx, cy, r, a0, end); g.strokeStyle = grad; g.lineWidth = r * 0.16; g.shadowColor = color; g.shadowBlur = 22; g.stroke(); g.shadowBlur = 0;
    g.beginPath(); g.arc(cx, cy, r * 0.78, 0, Math.PI * 2); g.strokeStyle = "rgba(148,163,184,.14)"; g.lineWidth = 2; g.setLineDash([3, 6]); g.stroke(); g.setLineDash([]);
    txt(g, String(score), cx, cy + r * 0.2, Math.round(r * 0.74), 800, color, FONT_D, "center");
    txt(g, "/100", cx, cy + r * 0.52, Math.round(r * 0.24), 700, C.white, FONT_D, "center");
    g.restore();
  }
  function capsule(g, x, y, w, h, label, color, size) {
    box(g, x, y, w, h, h / 2, "rgba(5,11,18,.6)", color, 14, 3);
    const f = fit(g, label, w - 28, size || Math.round(h * 0.42), 800, FONT_D, 14);
    txt(g, f.t, x + w / 2, y + h / 2 + f.s * 0.36, f.s, 800, color, FONT_D, "center");
  }
  function alertRow(g, x, y, w, h, a) {
    const st = STATE[a[0]];
    box(g, x, y, w, h, 14, "rgba(11,23,36,.92)", st.color, 8, 2.5);
    box(g, x, y, h, h, 14, "rgba(255,255,255,.03)", null);
    g.save(); g.beginPath(); g.arc(x + h / 2, y + h / 2, h * 0.27, 0, Math.PI * 2);
    if (a[0] === "pending") { g.strokeStyle = st.color; g.lineWidth = 3; g.stroke(); } else { g.fillStyle = st.color; g.fill(); }
    txt(g, st.icon, x + h / 2, y + h / 2 + h * 0.12, Math.round(h * 0.32), 800, a[0] === "pending" ? st.color : C.bg, FONT_D, "center"); g.restore();
    const capW = Math.min(300, w * 0.32), capH = h * 0.56;
    const f = fit(g, a[2], w - h - capW - 70, Math.round(h * 0.4), 700, FONT_B, 16);
    txt(g, f.t, x + h + 22, y + h / 2 + f.s * 0.36, f.s, 700, C.white, FONT_B);
    capsule(g, x + w - capW - 46, y + (h - capH) / 2, capW, capH, a[1], st.color, Math.round(capH * 0.38));
    txt(g, "›", x + w - 22, y + h / 2 + h * 0.15, Math.round(h * 0.45), 600, C.gray, FONT_B, "center");
  }
  function frame(g, W, H) {
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
    const rg = g.createRadialGradient(W * 0.8, H * 0.15, 10, W * 0.8, H * 0.15, W * 0.7); rg.addColorStop(0, "rgba(0,229,196,.08)"); rg.addColorStop(1, "rgba(0,229,196,0)"); g.fillStyle = rg; g.fillRect(0, 0, W, H);
    box(g, 10, 10, W - 20, H - 20, 26, null, C.teal, 20, 3);
  }
  // Purely decorative candles, seeded by the address so the same report always looks the same.
  function decoCandles(g, x, y, w, h, seed) {
    let s = parseInt(seed.slice(2, 10), 16) || 1; const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    g.save(); g.globalAlpha = 0.13; let v = h * 0.5;
    for (let i = 0; i < 16; i++) { const cx = x + i * (w / 16); const d = (rnd() - 0.5) * h * 0.25; const up = d < 0; const top = Math.min(v, v + d), bot = Math.max(v, v + d);
      g.fillStyle = up ? C.green : C.red; g.fillRect(cx, y + top, w / 26, Math.max(6, bot - top)); g.fillRect(cx + w / 52 - 1, y + top - 14, 2, bot - top + 28); v = Math.max(h * 0.1, Math.min(h * 0.9, v + d)); }
    g.restore();
  }
  const VERDICT = { high: ["RIESGO ALTO", C.red], warn: ["PRECAUCIÓN", C.yellow], ok: ["SIN ALERTAS", C.green], unk: ["SIN DATOS", C.slate] };
  const shortAddr = a => a.slice(0, 8) + "…" + a.slice(-6);
  function when(ts) {
    const d = new Date(ts * 1000);
    return d.toLocaleString("es-MX", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  }
  async function loadLogo(url) {
    if (!url) return null;
    return new Promise(ok => { const im = new Image(); im.crossOrigin = "anonymous"; im.referrerPolicy = "no-referrer"; im.onload = () => ok(im); im.onerror = () => ok(null); im.src = url; setTimeout(() => ok(null), 6000); });
  }
  function tokenLogo(g, cx, cy, r, img, sym, color) {
    g.save(); g.beginPath(); g.arc(cx, cy, r + 6, 0, Math.PI * 2); g.strokeStyle = color; g.lineWidth = 6; g.shadowColor = color; g.shadowBlur = 18; g.stroke(); g.shadowBlur = 0;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = C.sheet2; g.fill(); g.clip();
    let drawn = false; if (img) { try { g.drawImage(img, cx - r, cy - r, r * 2, r * 2); drawn = true; } catch (e) { drawn = false; } }
    g.restore();
    if (!drawn) txt(g, (sym || "?").slice(0, 3).toUpperCase(), cx, cy + r * 0.22, Math.round(r * 0.62), 800, C.gray, FONT_D, "center");
    return drawn;
  }
  const scaleNote = "100 = menor riesgo detectado";

  // ---------- templates ----------
  async function drawX(rep, meta) {
    const W = 1600, H = 900, c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
    const [vl, vc] = VERDICT[rep.vd] || VERDICT.unk; const addr = checksum(rep.a);
    frame(g, W, H); decoCandles(g, 1250, 230, 320, 560, rep.a);
    brand(g, 56, 132, 92, "Scan before the scam · Robinhood Chain");
    box(g, 1060, 44, 480, 124, 22, "rgba(11,23,36,.85)", C.teal, 12, 2.5); chainIcon(g, 1092, 76, 60);
    txt(g, "Robinhood Chain", 1180, 104, 38, 800, C.white, FONT_D); txt(g, "Chain ID 4663", 1180, 146, 32, 700, C.teal, FONT_D);
    box(g, 46, 200, 1170, 182, 22, "rgba(11,23,36,.92)", C.line, 0, 2);
    const logoOk = tokenLogo(g, 140, 291, 66, meta.logo, rep.s, vc);
    const nm = fit(g, rep.n || rep.s || "Token", 640, 72, 800, FONT_D, 30); txt(g, nm.t, 240, 282, nm.s, 800, C.white, FONT_D);
    g.font = "800 " + nm.s + "px " + FONT_D; const nw = g.measureText(nm.t).width;
    if (rep.s) { const sf = fit(g, "(" + rep.s + ")", 1190 - 260 - nw - 20, Math.round(nm.s * 0.72), 800, FONT_D, 20); txt(g, sf.t, 240 + nw + 20, 282, sf.s, 800, C.slate, FONT_D); }
    box(g, 236, 306, 960, 60, 14, "rgba(5,11,18,.7)", C.line, 0, 2);
    const af = fit(g, addr, 880, 32, 500, FONT_M, 20); txt(g, af.t, 258, 346, af.s, 500, C.white, FONT_M);
    if (!logoOk) txt(g, "logo no verificado", 140, 375, 16, 700, C.gray, FONT_B, "center");
    rep.x.slice(0, 4).forEach((a, i) => alertRow(g, 46, 400 + i * 94, 1170, 82, a));
    gauge(g, 1408, 450, 190, rep.sc, vl, vc);
    capsule(g, 1238, 606, 340, 74, vl, vc, 34);
    txt(g, "Puntuación · " + scaleNote, 1408, 712, 21, 700, C.gray, FONT_B, "center");
    txt(g, "Confianza de los datos: " + (rep.cf != null ? rep.cf + " %" : "N/D"), 1408, 744, 24, 800, rep.cf >= 80 ? C.green : rep.cf >= 50 ? C.yellow : C.red, FONT_B, "center");
    box(g, 46, 784, 1000, 74, 18, "rgba(0,229,196,.06)", C.teal, 10, 2.5);
    const lf = fit(g, "492gueq-gif.github.io/PreBuyScan/?t=" + rep.a.slice(0, 12) + "…", 900, 32, 800, FONT_B, 18); txt(g, "↗ " + lf.t, 74, 832, lf.s, 800, C.teal, FONT_B);
    box(g, 1066, 784, 488, 74, 18, "rgba(11,23,36,.85)", C.line, 0, 2);
    const df = fit(g, when(rep.ts), 450, 28, 700, FONT_B, 16); txt(g, df.t, 1310, 830, df.s, 700, C.white, FONT_B, "center");
    txt(g, "Reporte " + meta.id + " · algoritmo " + rep.al + (rep.b ? " · bloque " + rep.b.toLocaleString("es-MX") : "") + " · Análisis informativo. No garantiza seguridad ni rentabilidad.", 56, 880, 17, 600, C.gray, FONT_B);
    return c;
  }
  async function drawTelegram(rep, meta) {
    const W = 1080, H = 1080, c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
    const [vl, vc] = VERDICT[rep.vd] || VERDICT.unk; const addr = checksum(rep.a);
    frame(g, W, H);
    brand(g, 52, 112, 70, null);
    box(g, 700, 50, 330, 84, 42, "rgba(11,23,36,.85)", C.teal, 10, 2.5); chainIcon(g, 726, 70, 44);
    txt(g, "Robinhood Chain", 790, 101, 27, 800, C.white, FONT_D); txt(g, "4663", 790, 125, 19, 700, C.teal, FONT_D);
    const logoOk = tokenLogo(g, 120, 236, 56, meta.logo, rep.s, vc);
    const nm = fit(g, rep.n || rep.s || "Token", 560, 62, 800, FONT_D, 28); txt(g, nm.t, 200, 232, nm.s, 800, C.white, FONT_D);
    if (rep.s) txt(g, fit(g, rep.s, 560, 34, 800, FONT_D, 18).t, 200, 278, 34, 800, C.slate, FONT_D);
    if (!logoOk) txt(g, "logo no verificado", 120, 312, 15, 700, C.gray, FONT_B, "center");
    gauge(g, 880, 262, 118, rep.sc, vl, vc);
    capsule(g, 770, 396, 220, 56, vl, vc, 25);
    txt(g, scaleNote, 880, 476, 16, 700, C.gray, FONT_B, "center");
    txt(g, "Confianza de los datos: " + (rep.cf != null ? rep.cf + " %" : "N/D"), 52, 352, 24, 800, rep.cf >= 80 ? C.green : rep.cf >= 50 ? C.yellow : C.red, FONT_B);
    rep.x.slice(0, 4).forEach((a, i) => alertRow(g, 46, 500 + i * 102, 988, 88, a));
    box(g, 46, 916, 988, 62, 14, "rgba(5,11,18,.7)", C.line, 0, 2);
    const af = fit(g, addr, 940, 30, 500, FONT_M, 18); txt(g, af.t, 540, 957, af.s, 500, C.white, FONT_M, "center");
    const lf = fit(g, "↗ 492gueq-gif.github.io/PreBuyScan/?t=" + rep.a.slice(0, 10) + "…", 600, 24, 800, FONT_B, 16); txt(g, lf.t, 52, 1018, lf.s, 800, C.teal, FONT_B);
    const df = fit(g, when(rep.ts), 380, 22, 700, FONT_B, 14); txt(g, df.t, 1028, 1018, df.s, 700, C.white, FONT_B, "right");
    txt(g, "Reporte " + meta.id + " · " + rep.al + " · Análisis informativo. No garantiza seguridad ni rentabilidad.", 52, 1052, 15, 600, C.gray, FONT_B);
    return c;
  }
  function drawQR(g, text, x, y, size) {
    if (!root.qrcode) throw new Error("qr library missing");
    const qr = root.qrcode(0, "M"); qr.addData(text); qr.make();
    const n = qr.getModuleCount(), quiet = 4, cell = Math.floor(size / (n + quiet * 2)), real = cell * (n + quiet * 2);
    g.fillStyle = "#FFFFFF"; g.fillRect(x, y, real, real); g.fillStyle = "#000000";
    for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (qr.isDark(r, col)) g.fillRect(x + (col + quiet) * cell, y + (r + quiet) * cell, cell, cell);
    return { modules: n, size: real };
  }
  async function drawPremium(rep, meta) {
    const W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
    const [vl, vc] = VERDICT[rep.vd] || VERDICT.unk; const addr = checksum(rep.a);
    frame(g, W, H);
    brand(g, 52, 104, 62, "Scan before the scam");
    box(g, 760, 46, 270, 76, 38, "rgba(11,23,36,.85)", C.teal, 10, 2.5); txt(g, "Robinhood Chain", 895, 80, 24, 800, C.white, FONT_D, "center"); txt(g, "Chain ID 4663", 895, 106, 18, 700, C.teal, FONT_D, "center");
    // 1 identity
    box(g, 40, 160, 1000, 196, 20, "rgba(11,23,36,.92)", C.line, 0, 2);
    const logoOk = tokenLogo(g, 118, 238, 52, meta.logo, rep.s, vc);
    const nm = fit(g, rep.n || rep.s || "Token", 780, 52, 800, FONT_D, 24); txt(g, nm.t, 196, 232, nm.s, 800, C.white, FONT_D);
    txt(g, (rep.s ? rep.s + " · " : "") + "Robinhood Chain (4663)" + (logoOk ? "" : " · logo no verificado"), 196, 270, 22, 700, C.slate, FONT_B);
    const af = fit(g, addr, 960, 26, 500, FONT_M, 16); txt(g, af.t, 64, 320, af.s, 500, C.white, FONT_M);
    txt(g, "Analizado: " + when(rep.ts) + (rep.b ? " · bloque " + rep.b.toLocaleString("es-MX") : ""), 64, 344, 18, 600, C.gray, FONT_B);
    // 2 evaluation
    box(g, 40, 372, 1000, 250, 20, "rgba(11,23,36,.92)", C.line, 0, 2);
    gauge(g, 190, 506, 96, rep.sc, vl, vc);
    capsule(g, 330, 404, 290, 62, vl, vc, 28);
    txt(g, "Puntuación " + rep.sc + "/100 · " + scaleNote, 330, 504, 22, 700, C.white, FONT_B);
    txt(g, "Confianza de los datos: " + (rep.cf != null ? rep.cf + " %" : "N/D"), 330, 540, 24, 800, rep.cf >= 80 ? C.green : rep.cf >= 50 ? C.yellow : C.red, FONT_B);
    txt(g, "Algoritmo " + rep.al + " · lo no verificado resta y nunca cuenta como seguro", 330, 574, 18, 600, C.gray, FONT_B);
    // 3 findings grouped
    let y = 652; txt(g, "HALLAZGOS", 52, y, 18, 800, C.gray, FONT_D); y += 14;
    for (const st of ["confirmed", "suspicious", "pending"]) {
      const items = rep.x.filter(a => a[0] === st).slice(0, st === "pending" ? 2 : 3); if (!items.length) continue;
      for (const a of items) {
        box(g, 40, y, 1000, 74, 14, "rgba(11,23,36,.92)", STATE[st].color, 6, 2);
        capsule(g, 60, y + 18, 236, 38, a[1], STATE[st].color, 15);
        const tf = fit(g, a[2], 700, 24, 800, FONT_B, 15); txt(g, tf.t, 314, y + 34, tf.s, 800, C.white, FONT_B);
        const df = fit(g, a[3] || "", 700, 17, 500, FONT_B, 12); txt(g, df.t, 314, y + 59, df.s, 500, C.gray, FONT_B);
        y += 84; if (y > 1000) break;
      }
      if (y > 1000) break;
    }
    if (!rep.x.some(a => a[0] !== "clear")) { box(g, 40, y, 1000, 64, 14, "rgba(11,23,36,.92)", C.green, 6, 2); txt(g, "Sin alertas detectadas en las revisiones completadas. No significa «seguro».", 60, y + 41, 22, 700, C.green, FONT_B); y += 74; }
    // 4 market data
    const m = rep.m; const yM = Math.max(y + 6, 1010);
    if (m) {
      const age = m.ag ? (Date.now() / 1000 - m.ag) / 3600 : null;
      const fmt = v => v == null ? "N/D" : "$" + Number(v).toLocaleString("es-MX");
      const cells = [["Liquidez", fmt(m.l)], ["Volumen 24 h", fmt(m.v)], [m.fk === "mc" ? "Market cap" : "FDV", fmt(m.f)], ["Edad del par", age == null ? "N/D" : age < 48 ? age.toFixed(1) + " h" : Math.round(age / 24) + " días"], ["Holders", m.h == null ? "N/D" : Number(m.h).toLocaleString("es-MX")], ["Compras / ventas 24 h", m.tb == null ? "N/D" : m.tb + " / " + m.ts]];
      cells.forEach((cc, i) => { const cx = 40 + (i % 3) * 230, cy = yM + Math.floor(i / 3) * 88; box(g, cx, cy, 220, 78, 12, "rgba(11,23,36,.92)", C.line, 0, 2);
        txt(g, cc[0], cx + 14, cy + 26, 16, 700, C.gray, FONT_B); const vf = fit(g, cc[1], 196, 26, 800, FONT_D, 14); txt(g, vf.t, cx + 14, cy + 60, vf.s, 800, C.white, FONT_D); });
      txt(g, "Fuente: DexScreener (mercado) y Blockscout (holders), al momento del análisis.", 40, yM + 196, 15, 600, C.gray, FONT_B);
    }
    // 5 QR
    let qr = null;
    try { qr = drawQR(g, meta.url, 740, yM - 6, 300); } catch (e) { box(g, 740, yM, 300, 300, 12, null, C.line, 0, 2); txt(g, "QR no disponible", 890, yM + 150, 20, 700, C.gray, FONT_B, "center"); }
    txt(g, "Escanea para verificar", 890, yM + (qr ? qr.size : 300) + 10, 17, 800, C.teal, FONT_B, "center");
    // 6 footer
    txt(g, "Reporte " + meta.id + " · SHA-256 " + meta.hash.slice(0, 24) + "…", 40, H - 62, 16, 700, C.white, FONT_M);
    txt(g, SITE.replace("https://", "") + " · Análisis informativo. No garantiza seguridad ni rentabilidad.", 40, H - 34, 16, 600, C.gray, FONT_B);
    return { canvas: c, qr };
  }

  async function makeAll(token, res, ctx) {
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
    const rep = buildReport(token, res, ctx);
    const link = await verifiableLink(rep);
    const logo = await loadLogo(ctx.logoUrl);
    const meta = { id: link.id, hash: link.hash, url: link.url, logo };
    const x = await drawX(rep, meta), t = await drawTelegram(rep, meta), p = await drawPremium(rep, meta);
    return { rep, link, cards: { x, telegram: t, premium: p.canvas }, qr: p.qr };
  }

  const api = { classify, checksum, buildReport, canonical, hashReport, verifiableLink, verifyFromLocation, linkPayload, makeAll, drawX, drawTelegram, drawPremium, STATE, SITE };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PBShare = api;
})(typeof window !== "undefined" ? window : globalThis);
