"""Phone-like comparison (CPU x4, 390 px) of the PUBLISHED site vs this branch served locally:
frame rate while the scan runs and after, total time, chart requests. REAL services."""
import json, subprocess, sys, time
from collections import defaultdict
from pathlib import Path
from playwright.sync_api import sync_playwright
OUT = Path("out"); OUT.mkdir(exist_ok=True)
TARGETS = {"published": "https://492gueq-gif.github.io/PreBuyScan/", "branch": "http://localhost:8810/"}
TOKS = ["0x39dbed3a2bd333467115de45665cc57f813c4571", "0xD5f1afEA47b1A9eab414D2ee740cF1d6d039E725"]
FPS = """()=>new Promise(r=>{let f=0;const t0=performance.now();const tick=()=>{f++;if(performance.now()-t0<1500)requestAnimationFrame(tick);else r(Math.round(f/1.5));};requestAnimationFrame(tick);})"""
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8810"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
res = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        for rnd in range(2):
            for tok in TOKS:
                for name in (["published", "branch"] if rnd == 0 else ["branch", "published"]):
                    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
                    pg = ctx.new_page(); ctx.new_cdp_session(pg).send("Emulation.setCPUThrottlingRate", {"rate": 4})
                    hosts = defaultdict(int); pg.on("request", lambda r: hosts.__setitem__(r.url.split("/")[2], hosts[r.url.split("/")[2]] + 1))
                    t0 = time.time(); pg.goto(TARGETS[name] + "?t=" + tok)
                    pg.wait_for_selector("#out .rcard", timeout=120000)
                    during = []
                    for _ in range(4):
                        if pg.locator("#out .ring:not(.pending)").count(): break
                        during.append(pg.evaluate(FPS)); pg.wait_for_timeout(1500)
                    pg.wait_for_selector("#out .ring:not(.pending)", timeout=300000); full = time.time() - t0
                    pg.wait_for_timeout(1500); after = pg.evaluate(FPS)
                    pg.mouse.wheel(0, 1500); scroll = pg.evaluate(FPS)
                    res.append(dict(round=rnd, target=name, token=tok[:8], full_s=round(full, 1), fps_during=during, fps_after=after, fps_scroll=scroll,
                                    badge=pg.inner_text("#out .done"), gecko_requests=sum(v for k, v in hosts.items() if "geckoterminal" in k and not k.startswith("api.")), total_requests=sum(hosts.values())))
                    ctx.close()
        b.close()
finally:
    srv.terminate()
(OUT / "compare.json").write_text(json.dumps(res, indent=1, ensure_ascii=False))
for r in res: print("::notice title=%s %s r%d::%s" % (r["target"], r["token"], r["round"], json.dumps(r, ensure_ascii=False)))
