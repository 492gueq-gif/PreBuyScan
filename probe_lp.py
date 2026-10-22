import json,subprocess,sys,time
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,"-m","http.server","8766","-d","candidate"]);time.sleep(1)
out={}
with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={"width":390,"height":844},user_agent="Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36")
    pg.goto("http://127.0.0.1:8766/?t=0xa01ff10774cfe53c3fbc1d7d124c42e19f6afcbd");pg.evaluate("document.documentElement.dataset.theme='dark'");pg.wait_for_selector(".stamp",timeout=180000)
    pg.locator(".chart").scroll_into_view_if_needed();pg.wait_for_timeout(12000)
    pg.locator(".chart").screenshot(path="chart_ds.png");pg.screenshot(path="chart_page.png",full_page=False)
    fr=[f for f in pg.frames if "geckoterminal" in f.url]
    out["ds_frames"]=[f.url[:120] for f in fr]
    try: out["ds_title"]=fr[0].title() if fr else None; out["ds_text"]=fr[0].inner_text("body")[:300] if fr else None
    except Exception as e: out["ds_err"]=str(e)[:200]
    # GeckoTerminal embed as alternative
    pg2=b.new_page(viewport={"width":390,"height":700})
    pg2.set_content('<iframe id=f style="width:100%;height:600px;border:0" src="https://www.geckoterminal.com/robinhood/pools/0x383947b7d40a42354119700a2f4097debd50e61bb7c868fc5f9ff5c7aafa0c79?embed=1&info=0&swaps=0&light_chart=0"></iframe>')
    pg2.wait_for_timeout(12000);pg2.screenshot(path="chart_gt.png")
    out["gt_frames"]=[f.url[:120] for f in pg2.frames]
    b.close()
json.dump(out,open("probe_out.json","w"))
srv.terminate()
