"""External audit mandatory cases (REAL services). Runs this branch's scanner in Chromium on
UHI, PONS, PAPER and a dead token, records every finding, and checks the expected alerts.
Also renders each report at 360 px (phone) and 1440 px for screenshots."""
import json, re, subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright
OUT = Path("out"); OUT.mkdir(exist_ok=True)
# Expectations: what the external audit asked for, corrected where the chain says otherwise
# (UHI sells fine at 0.5 ETH once both simulations share one block; PONS's verified code has no owner or blacklist).
CASES = {
  "UHI": ("0xe01ada02fb4d1951cdb8cbb761d509db2ff02c94", [("saldos clonados", r"wallets con saldos casi idénticos", "high"), ("poco suministro en pools", r"^Precio frágil", None),
          ("venta de 0.5 ETH simulada (resultado real, sin límite)", "sizes:0.5", "round_trip_ok"), ("sin hallazgo falso de venta limitada", "absent:^Solo se puede vender hasta", None)]),
  "PONS": ("0x39dbed3a2bd333467115de45665cc57f813c4571", [("volumen anómalo / bots", r"^(Volumen anómalo|Operaciones repetidas por pocas wallets|Volumen sin liquidez detrás)", None),
          ("sin dueño ni lista negra según el código verificado", r"^Sin dueño ni administradores", "ok"), ("no inventa lista negra", "absent:^Puede bloquear wallets", None),
          ("sin falsa discrepancia de fuentes", "absent:^Datos inconsistentes", None)]),
  "PAPER": ("0x179b22557cd511124535e41cc0dacf845b650b07", [("datos inconsistentes", r"^Datos inconsistentes entre fuentes", "warn")]),
  "MUERTO (GRUDGE)": ("0x01127d7d9680578e53812ec8bd714993bc8da6bc", [("riesgo alto", None, "verdict:high")]),
}
JS = """async t=>{const r=await inspect(t);const v=verdictOf(r.checks);
  return {verdict:v[0],score:PBScore.isEvaluable(r.checks)?scoreOf(r.checks):null,confidence:confidenceOf(r).score,
    checks:r.checks.map(c=>({s:c.s,err:!!c.err,c:c.c,t:c.t,d:c.d})),facts:Object.fromEntries(Object.entries(r.facts).filter(([k])=>!k.startsWith('_')&&k!=='url')),
    sizes:r.simSizes,explorer_errors:(r.cr&&r.cr.errors)||[]};}"""
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8830"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
res = {}
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        for name, (tok, exp) in CASES.items():
            ctx = b.new_context(service_workers="block"); pg = ctx.new_page(); errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
            pg.on("console", lambda m: errs.append("console:" + m.text[:200]) if m.type == "error" and "Content Security Policy" in m.text else None)
            pg.goto("http://localhost:8830/index.html"); pg.wait_for_function("typeof inspect==='function'")
            t0 = time.time(); r = pg.evaluate(JS, tok); r["seconds"] = round(time.time() - t0, 1); r["js_errors"] = errs
            got = []
            for label, rx, want in exp:
                if rx is None:
                    ok = r["verdict"] == want.split(":")[1]; got.append(dict(expect=label, ok=ok, found="veredicto " + r["verdict"])); continue
                if rx.startswith("sizes:"):
                    eth = float(rx.split(":")[1]); sz = [x for x in (r["sizes"] or []) if x["eth"] == eth]
                    got.append(dict(expect=label, ok=bool(sz) and sz[0]["status"] == want, found=sz[0] if sz else "sin simulación")); continue
                if rx.startswith("absent:"):
                    hits = [c for c in r["checks"] if re.search(rx[7:], c["t"])]
                    got.append(dict(expect=label, ok=not hits, found=[c["s"] + ": " + c["t"] for c in hits])); continue
                hits = [c for c in r["checks"] if re.search(rx, c["t"])]
                ok = bool(hits) and (want is None or any(c["s"] == want for c in hits))
                got.append(dict(expect=label, ok=ok, found=[c["s"] + ": " + c["t"] for c in hits]))
            r["expectations"] = got; res[name] = r
            ctx.close()
            for w, h in ((360, 780), (1440, 900)):
                c2 = b.new_context(viewport={"width": w, "height": h}, service_workers="block"); q = c2.new_page()
                q.goto("http://localhost:8830/?t=" + tok); q.wait_for_selector("#out .ring:not(.pending)", timeout=300000); q.wait_for_timeout(1500)
                sw = q.evaluate("document.documentElement.scrollWidth")
                res[name]["scroll_width_%d" % w] = sw
                q.screenshot(path=str(OUT / ("%s_%d.png" % (name.split()[0], w))), full_page=True); c2.close()
        b.close()
finally:
    srv.terminate()
(OUT / "audit_cases.json").write_text(json.dumps(res, indent=1, ensure_ascii=False))
for n, r in res.items():
    print("::notice title=%s::%s" % (n, json.dumps(dict(verdict=r["verdict"], score=r["score"], conf=r["confidence"], secs=r["seconds"], exp=r["expectations"], sw=[r.get("scroll_width_360"), r.get("scroll_width_1440")], js=r["js_errors"][:3]), ensure_ascii=False)[:3800]))
