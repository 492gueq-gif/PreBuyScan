"""Fetch URLs from inside a real browser page (same CORS/anti-bot path as users). REAL services."""
import json, subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright
OUT = Path("out"); OUT.mkdir(exist_ok=True)
items = json.loads(Path("tests/probe_browser_urls.json").read_text())
srv = subprocess.Popen([sys.executable, "-m", "http.server", "8820"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
res = {}
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(); pg.goto("http://localhost:8820/index.html")
        for name, it in items.items():
            u, body = (it, None) if isinstance(it, str) else (it["url"], it["body"])
            r = pg.evaluate("""async([u,body])=>{const t0=performance.now();try{const r=await fetch(u,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
              const h={};r.headers.forEach((v,k)=>{if(/access-control|retry|ratelimit/.test(k))h[k]=v;});return {status:r.status,ms:Math.round(performance.now()-t0),headers:h,body:(await r.text()).slice(0,400000)};}
              catch(e){return {error:String(e),ms:Math.round(performance.now()-t0)};}}""", [u, body])
            res[name] = r; time.sleep(1.2 if "blockscout" in u else 2.2 if "gecko" in u else 0.3)
        b.close()
finally:
    srv.terminate()
(OUT / "probe_browser.json").write_text(json.dumps(res, indent=1))
print("::notice title=probe_browser::" + json.dumps({k: (v.get("status"), v.get("error"), len(v.get("body", ""))) for k, v in res.items()})[:3500])
