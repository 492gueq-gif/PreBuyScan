"""REAL services (non-blocking job): real analysis against Robinhood Chain RPC, Blockscout,
DexScreener and GeckoTerminal; real Alpha Radar; published site in sync with gh-pages.
Results are labelled REAL and never mixed with the mocked UI results."""
import hashlib, json, subprocess, sys, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "out"; OUT.mkdir(exist_ok=True)
TOKEN = "0xa01ff10774cfe53c3fbc1d7d124c42e19f6afcbd"
PORT = 8791; BASE = "http://localhost:%d/" % PORT
res = dict(kind="REAL_SERVICES")
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "-d", str(ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1440, "height": 900}); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
        t0 = time.time(); pg.goto(BASE + "?t=" + TOKEN)
        pg.wait_for_selector("#out .ring:not(.pending)", timeout=240000); pg.wait_for_timeout(2500)
        res["analysis"] = dict(seconds=round(time.time() - t0, 1), badge=pg.inner_text("#out .done"),
                               score=pg.inner_text("#out .lr-num"), label=pg.inner_text("#out .lr-lbl"),
                               confline=pg.inner_text("#out .hl").split("\n")[-6:], errors=errs[:5],
                               technical_errors=pg.locator("#out .pill.err").count())
        pg.screenshot(path=str(OUT / "live_result.png"))
        pg.evaluate("setView('explore',{kind:'alpha'})")
        pg.wait_for_selector("#explore-list li.al, #explore-list li.empty:not(.busy)", timeout=60000); pg.wait_for_timeout(3000)
        res["alpha"] = dict(rows=pg.locator("#explore-list li.al").count(), head=pg.inner_text("#explore-list li >> nth=0")[:200])
        pg.screenshot(path=str(OUT / "live_alpha.png"))
        b.close()
finally:
    srv.terminate()
try:
    served = urllib.request.urlopen("https://492gueq-gif.github.io/PreBuyScan/index.html?nocache=%d" % time.time(), timeout=30).read()
    repo = subprocess.run(["git", "show", "origin/gh-pages:index.html"], capture_output=True, cwd=ROOT).stdout
    res["published_in_sync_with_gh_pages"] = hashlib.sha256(served).hexdigest() == hashlib.sha256(repo).hexdigest()
except Exception as e:
    res["published_in_sync_with_gh_pages"] = "UNKNOWN:" + type(e).__name__
(OUT / "live.json").write_text(json.dumps(res, indent=1, ensure_ascii=False))
print(json.dumps(res, ensure_ascii=False))
print("::notice title=live_check::" + json.dumps(res, ensure_ascii=False)[:3800])
