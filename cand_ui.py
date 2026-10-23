import json,sys,subprocess,time
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,"-m","http.server","8765","-d","candidate"]);time.sleep(1)
T="0xa01ff10774cfe53c3fbc1d7d124c42e19f6afcbd"
def note(tag,obj):
    s=json.dumps(obj,ensure_ascii=False);open("notes.txt","a").write(tag+" "+s+"\n");print(tag,s)
with sync_playwright() as p:
    b=p.chromium.launch()
    for vw in [1920,1600,1366,1100]:
        for url,tag in [("https://492gueq-gif.github.io/PreBuyScan/?t="+T,"live"),("http://localhost:8765/?t="+T,"cand")]:
            pg=b.new_page(viewport={"width":vw,"height":1000})
            pg.goto(url);pg.wait_for_selector("#out .ring:not(.pending)",timeout=240000);pg.wait_for_timeout(2500)
            m=pg.evaluate("""()=>{const c=document.querySelector('#out .rtop').closest('section').getBoundingClientRect(),r=document.querySelector('#out .ring').getBoundingClientRect();
              return {card:[Math.round(c.left),Math.round(c.width)],ringCenter:Math.round(r.left+r.width/2),cardCenter:Math.round(c.left+c.width/2),screenCenter:Math.round(innerWidth/2),live:document.querySelector('#out .ring').classList.contains('live'),cols:getComputedStyle(document.querySelector('#out .rtop')).gridTemplateColumns}}""")
            note(f"{tag}_{vw}",m)
            if vw in (1920,1366): pg.locator("#out .rtop").screenshot(path=f"{tag}_{vw}_rtop.png")
            pg.close()
    b.close()
srv.terminate()
