import json,sys,subprocess,time
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,"-m","http.server","8765","-d","candidate"]);time.sleep(1)
TOKENS=["0xad4dd73723b2f170620be2ae1f56951f3f16174b","0x1b282927b9c5d39d7161f51af3203b44b1a56213"]
def note(tag,obj):
    s=json.dumps(obj,ensure_ascii=False);open("notes.txt","a").write(tag+" "+s+"\n");print(tag,s[:2000])
with sync_playwright() as p:
    b=p.chromium.launch()
    for k,t in enumerate(TOKENS):
        for vw,tag in ((1000,"d"),(390,"m")) if k==0 else ((1000,"d"),):
            pg=b.new_page(viewport={"width":vw,"height":900});errs=[];pg.on("pageerror",lambda e:errs.append(str(e)[:300]))
            pg.goto("http://localhost:8765/?t="+t)
            try:
                pg.wait_for_selector(".stamp",timeout=180000)
                t0=time.time();pg.click("[data-act=map]")
                pg.wait_for_selector("#mapsvg svg, #mapout .busy:not(#mapmsg)",timeout=150000)
                pg.wait_for_timeout(800)
                out={"token":t,"vw":vw,"secs":round(time.time()-t0),"stamp":pg.inner_text(".stamp"),
                     "map_lines":pg.locator("#mapout ol.checks li").all_inner_texts(),
                     "tables":pg.locator("#mapout table").all_inner_texts(),"note":pg.locator("#mapout .tnote").all_inner_texts(),
                     "circles":pg.locator("#mapsvg circle").count(),"lines":pg.locator("#mapsvg line").count(),
                     "scrollW":pg.evaluate("document.documentElement.scrollWidth"),"errs":errs,"busy":pg.locator("#mapout .busy").all_inner_texts()}
                if pg.locator("#mapsvg circle").count():
                    pg.locator("#mapsvg g[role=button]").first.click();pg.wait_for_timeout(300);out["info"]=pg.inner_text("#mapinfo")
                note("map_%d%s"%(k,tag),out)
                pg.locator("#mapout").screenshot(path="map_%d%s.png"%(k,tag))
            except Exception as e:
                note("fail_%d%s"%(k,tag),{"err":str(e)[:300],"errs":errs,"out":pg.inner_text("#mapout") if pg.locator("#mapout").count() else None})
            pg.close()
    b.close()
srv.terminate()
