"""Speed diagnostic (REAL services): compare time-to-first-result and time-to-full-report between two
published versions of the page on the same tokens, and where the time goes (per host)."""
import json, os, subprocess, sys, time
from collections import defaultdict
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"; OUT.mkdir(exist_ok=True)
VERSIONS = os.environ.get("DIAG_VERSIONS", "0cc79a8,HEAD").split(",")
TOKENS = os.environ.get("DIAG_TOKENS", "0x39dbed3a2bd333467115de45665cc57f813c4571,0xD5f1afEA47b1A9eab414D2ee740cF1d6d039E725").split(",")
dirs = {}
for i, v in enumerate(VERSIONS):
    d = Path("/tmp/ver%d" % i); subprocess.run(["git", "worktree", "add", "-f", str(d), v], cwd=ROOT, check=True, capture_output=True); dirs[v] = d
res = []
with sync_playwright() as p:
    b = p.chromium.launch()
    for rnd in range(2):
        order = VERSIONS if rnd == 0 else VERSIONS[::-1]
        for tok in TOKENS:
            for v in order:
                port = 8800 + VERSIONS.index(v)
                srv = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "-d", str(dirs[v])], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                time.sleep(0.8)
                ctx = b.new_context(viewport={"width": 390, "height": 844}); pg = ctx.new_page()
                reqs = {}; hosts = defaultdict(lambda: [0, 0.0, 0])
                t0 = time.time()
                def on_req(r): reqs[r] = time.time()
                def on_done(r, failed=False):
                    s = reqs.pop(r, None)
                    if s is None: return
                    h = r.url.split("/")[2]; e = hosts[h]; e[0] += 1; e[1] += time.time() - s; e[2] += 1 if failed else 0
                pg.on("request", on_req); pg.on("requestfinished", on_done); pg.on("requestfailed", lambda r: on_done(r, True))
                steps = []
                pg.expose_function("__step", lambda m: steps.append((round(time.time() - t0, 1), m)))
                pg.add_init_script("""new MutationObserver(()=>{const b=document.querySelector('#out .busy span');if(b&&b.textContent!==window.__ls){window.__ls=b.textContent;window.__step(b.textContent);}}).observe(document,{subtree:true,childList:true,characterData:true});""")
                pg.goto("http://localhost:%d/?t=%s" % (port, tok))
                pg.wait_for_selector("#out .rcard", timeout=120000); tp = time.time() - t0
                pg.wait_for_selector("#out .ring:not(.pending)", timeout=300000); tf = time.time() - t0
                badge = pg.inner_text("#out .done")
                st = pg.locator("#out .astate").all_inner_texts()
                unk = pg.eval_on_selector_all("#out .pill.unk", "els=>els.map(e=>(e.classList.contains('err')?'ERR ':'')+e.closest('li').querySelector('b').innerText)")
                res.append(dict(round=rnd, version=v, token=tok[:8], first_s=round(tp, 1), full_s=round(tf, 1), badge=badge, state=st, unknown=unk,
                                steps=steps, hosts={h: [n, round(t, 1), f] for h, (n, t, f) in sorted(hosts.items(), key=lambda x: -x[1][1])[:8]}))
                ctx.close(); srv.terminate()
    b.close()
(OUT / "speed.json").write_text(json.dumps(res, indent=1, ensure_ascii=False))
for r in res:
    print("::notice title=%s %s r%d::%s" % (r["version"], r["token"], r["round"], json.dumps({k: r[k] for k in ("first_s", "full_s", "badge", "unknown", "hosts")}, ensure_ascii=False)[:3000]))
