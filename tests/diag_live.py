"""Measure the PUBLISHED site (GitHub Pages) as a phone would: page load, boot screen, analysis time,
and where the time goes per host. REAL services."""
import json, time
from collections import defaultdict
from pathlib import Path
from playwright.sync_api import sync_playwright
OUT = Path("out"); OUT.mkdir(exist_ok=True)
URL = "https://492gueq-gif.github.io/PreBuyScan/"
TOK = "0x39dbed3a2bd333467115de45665cc57f813c4571"
res = []
with sync_playwright() as p:
    b = p.chromium.launch()
    for cpu in (1, 4):
        ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True,
                            user_agent="Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36")
        pg = ctx.new_page()
        if cpu > 1: ctx.new_cdp_session(pg).send("Emulation.setCPUThrottlingRate", {"rate": cpu})
        reqs = {}; hosts = defaultdict(lambda: [0, 0.0, 0]); slow = []; errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        def on_req(r): reqs[r] = time.time()
        def on_done(r, failed=False):
            s = reqs.pop(r, None)
            if s is None: return
            d = time.time() - s; h = r.url.split("/")[2]; e = hosts[h]; e[0] += 1; e[1] += d; e[2] += 1 if failed else 0
            if d > 3: slow.append((round(d, 1), r.url[:110]))
        pg.on("request", on_req); pg.on("requestfinished", on_done); pg.on("requestfailed", lambda r: on_done(r, True))
        t0 = time.time(); pg.goto(URL, wait_until="domcontentloaded"); tdom = time.time() - t0
        pg.wait_for_selector("#boot", state="detached", timeout=120000); tboot = time.time() - t0
        pg.wait_for_load_state("load", timeout=120000); tload = time.time() - t0
        long_tasks = pg.evaluate("""()=>new Promise(r=>{let n=0,tot=0;try{new PerformanceObserver(l=>{for(const e of l.getEntries()){n++;tot+=e.duration;}}).observe({type:'longtask',buffered:true});}catch(e){}setTimeout(()=>r([n,Math.round(tot)]),3000);})""")
        t1 = time.time(); pg.goto(URL + "?t=" + TOK)
        pg.wait_for_selector("#out .rcard", timeout=120000); tfirst = time.time() - t1
        pg.wait_for_selector("#out .ring:not(.pending)", timeout=300000); tfull = time.time() - t1
        badge = pg.inner_text("#out .done")
        fps = pg.evaluate("""()=>new Promise(r=>{let f=0;const t0=performance.now();const tick=()=>{f++;if(performance.now()-t0<2000)requestAnimationFrame(tick);else r(Math.round(f/2));};requestAnimationFrame(tick);})""")
        res.append(dict(cpu=cpu, dom_s=round(tdom, 1), boot_s=round(tboot, 1), load_s=round(tload, 1), long_tasks_home=long_tasks,
                        first_s=round(tfirst, 1), full_s=round(tfull, 1), badge=badge, fps_report=fps, errors=errs[:5],
                        slow=sorted(slow, reverse=True)[:12], hosts={h: [n, round(t, 1), f] for h, (n, t, f) in sorted(hosts.items(), key=lambda x: -x[1][1])[:10]}))
        pg.screenshot(path=str(OUT / ("live_cpu%d.png" % cpu)))
        ctx.close()
    b.close()
(OUT / "live_speed.json").write_text(json.dumps(res, indent=1, ensure_ascii=False))
for r in res: print("::notice title=live cpu%d::%s" % (r["cpu"], json.dumps(r, ensure_ascii=False)[:3800]))
