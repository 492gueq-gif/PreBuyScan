import json,sys,subprocess,time
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,"-m","http.server","8765","-d","candidate"]);time.sleep(1)
TOKENS=["0x1b282927b9c5d39d7161f51af3203b44b1a56213","0xa01ff10774cfe53c3fbc1d7d124c42e19f6afcbd"]
def note(tag,obj):
    s=json.dumps(obj,ensure_ascii=False)
    for i in range(0,len(s),3500):print("::notice title=%s_%d::"%(tag,i//3500)+s[i:i+3500].replace("%","%25"))
with sync_playwright() as p:
    b=p.chromium.launch()
    for k,t in enumerate(TOKENS):
        pg=b.new_page(viewport={"width":1000,"height":900});errs=[];pg.on("pageerror",lambda e:errs.append(str(e)[:300]))
        pg.goto("http://localhost:8765/?t="+t)
        try:pg.wait_for_selector(".stamp",timeout=180000)
        except Exception as e:note("t%d_timeout"%k,{"busy":pg.inner_text("#out"),"errs":errs});continue
        pg.wait_for_timeout(500)
        out={"token":t,"stamp":pg.inner_text(".stamp"),"url":pg.url,
          "groups":pg.locator("#out section h3").all_inner_texts(),
          "checks":list(zip(pg.locator("ol.checks li .pill").all_inner_texts(),pg.locator("ol.checks li b").all_inner_texts(),pg.locator("ol.checks li .ck span").all_inner_texts())),
          "facts":dict(zip(pg.locator(".fact dt").all_inner_texts(),pg.locator(".fact dd").all_inner_texts())),
          "tables":pg.locator("#out table.tt").all_inner_texts(),"note":pg.inner_text(".note"),"errs":errs}
        out["cr"]=pg.evaluate("""async t=>{const d=await (await fetch('https://api.dexscreener.com/tokens/v1/robinhood/'+t)).json();const pr=d.sort((a,b)=>(b.liquidity?.usd||0)-(a.liquidity?.usd||0))[0];const r=await window.PBCreator.analyze(t,pr,d);return JSON.stringify({creator:r.creator,rep:r.rep&&{...r.rep,launches:r.rep.launches.slice(0,5)},lp:r.lp,h:r.holders&&{count:r.holders.count,top10:r.holders.top10,burned:r.holders.burned,pools:r.holders.pools},errors:r.errors,cp:r.creatorPct}).slice(0,3000);}""",t)
        note("t%d"%k,out)
        pg.screenshot(path="shot_%d.png"%k,full_page=True)
        if k==9:
            pg.wait_for_selector("#radar table.tt",timeout=60000)
            note("radar",{"rows":pg.locator("#radar tbody tr").count(),"first":pg.locator("#radar tbody tr").first.inner_text()})
            pg.click("#radar [data-k=trending]");pg.wait_for_timeout(4000)
            note("trending",{"rows":pg.locator("#radar tbody tr").count(),"pressed":pg.get_attribute("#radar [data-k=trending]","aria-pressed")})
            png=pg.evaluate("()=>cardCanvas().toDataURL('image/png').length")
            note("card",{"dataurl_len":png})
            pg.evaluate("()=>{const c=cardCanvas();window.__c=c.toDataURL('image/png');}")
            import base64;open("card.png","wb").write(base64.b64decode(pg.evaluate("()=>window.__c").split(",")[1]))
        mob=b.new_page(viewport={"width":390,"height":844})
        if k==0:
            mob.goto("http://localhost:8765/?t="+t);mob.wait_for_selector(".stamp",timeout=180000);mob.wait_for_timeout(800)
            note("mobile",{"scrollW":mob.evaluate("document.documentElement.scrollWidth"),"w":390})
            mob.screenshot(path="shot_mobile.png",full_page=True)
    b.close()
srv.terminate()
