"""Diagnostic (REAL services): run the published analysis for one token and record which explorer
checks failed and why (creator.js out.errors), with the normal 35 s budget and with a long budget."""
import json, os, subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"; OUT.mkdir(exist_ok=True)
TOKENS = os.environ.get("DIAG_TOKENS", "0xD5f1afEA47b1A9eab414D2ee740cF1d6d039E725").split(",")
HOOK = """
(() => { let real; const budget = window.__diagBudget;
  Object.defineProperty(window, 'PBCreator', { configurable: true, get(){ return real; }, set(v){
    const a = v.analyze; v.analyze = async (t,p,ps,o) => { const t0 = performance.now();
      const r = await a(t,p,ps,Object.assign({}, o||{}, budget?{budgetMs:budget}:{}));
      window.__cr = { ms: Math.round(performance.now()-t0), errors: r && r.errors, has: r && {creator:!!r.creator, rep:!!r.rep, lp:!!r.lp, lpKind: r.lp&&r.lp.kind, snipers:!!r.snipers, holders: !!(r.holders&&r.holders.top10!=null)}, pairDex: p && p.dexId, pairAddr: p && p.pairAddress, labels: p && p.labels };
      return r; }; real = v; } }); })();
"""
PORT = 8792; BASE = "http://localhost:%d/" % PORT
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "-d", str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1); res = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        for tok in TOKENS:
            for budget, cpu in ((None, 1), (None, 4)):
                ctx = b.new_context(viewport={"width": 390, "height": 844})
                pg = ctx.new_page(); errs = []; fails = []
                if cpu > 1: ctx.new_cdp_session(pg).send("Emulation.setCPUThrottlingRate", {"rate": cpu})
                pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
                pg.on("requestfailed", lambda r: fails.append((r.url[:120], r.failure)))
                pg.on("response", lambda r: fails.append((r.url[:120], r.status)) if r.status >= 400 else None)
                pg.add_init_script("window.__diagBudget=%s;" % (budget or "null") + HOOK)
                t0 = time.time(); pg.goto(BASE + "?t=" + tok)
                pg.wait_for_selector("#out .ring:not(.pending)", timeout=300000); pg.wait_for_timeout(2000)
                errpills = pg.eval_on_selector_all("#out .pill.err", "els=>els.map(e=>e.closest('li').querySelector('b').innerText)")
                res.append(dict(token=tok, budget=budget, cpu=cpu, seconds=round(time.time()-t0,1), badge=pg.inner_text("#out .done"),
                                tech_errors=errpills, cr=pg.evaluate("window.__cr"), http_failures=fails[:40], js_errors=errs[:5]))
                pg.screenshot(path=str(OUT / ("diag_%s_cpu%s.png" % (tok[:8], cpu))), full_page=True)
                ctx.close()
        b.close()
finally:
    srv.terminate()
(OUT / "diag.json").write_text(json.dumps(res, indent=1, ensure_ascii=False))
for r in res:
    print("::notice title=diag %s cpu%s::%s" % (r["token"][:8], r["cpu"], json.dumps({k: r[k] for k in ("seconds","badge","tech_errors","cr")}, ensure_ascii=False)[:3500]))
    print("::notice title=http %s cpu%s::%s" % (r["token"][:8], r["cpu"], json.dumps(r["http_failures"], ensure_ascii=False)[:3500]))
