import json,sys,subprocess,time,io
from PIL import Image
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,"-m","http.server","8765","-d","candidate"]);time.sleep(1)
T="0xa01ff10774cfe53c3fbc1d7d124c42e19f6afcbd"
def note(tag,obj):
    s=json.dumps(obj,ensure_ascii=False);open("notes.txt","a").write(tag+" "+s+"\n");print(tag,s)
with sync_playwright() as p:
    b=p.chromium.launch()
    for vw,vh,tag,touch in [(1600,1000,"d",False),(390,844,"m",True)]:
        ctx=b.new_context(viewport={"width":vw,"height":vh},has_touch=touch,is_mobile=touch)
        pg=ctx.new_page();errs=[];pg.on("pageerror",lambda e:errs.append(str(e)[:300]))
        pg.goto("http://localhost:8765/?t="+T);pg.wait_for_selector("#out .ring:not(.pending)",timeout=240000)
        if tag=="m": pg.click("[data-tab=holders]")
        pg.locator("#out .mapsec").scroll_into_view_if_needed()
        try:
            pg.wait_for_selector("#out .akmap svg",timeout=150000);pg.wait_for_timeout(3500)
            m=pg.locator("#out .akmap");m.scroll_into_view_if_needed();bb=m.bounding_box()
            m.screenshot(path=f"{tag}_flat.png")
            frames=[]
            path=[(0.5,0.5),(0.8,0.4),(0.85,0.7),(0.5,0.8),(0.2,0.7),(0.15,0.3),(0.5,0.2),(0.7,0.3)]
            for k in range(len(path)-1):
                for s in range(6):
                    a=path[k];c=path[k+1];f=s/6;x=bb["x"]+bb["width"]*(a[0]+(c[0]-a[0])*f);y=bb["y"]+bb["height"]*(a[1]+(c[1]-a[1])*f)
                    if touch: pg.dispatch_event("#out .akmap svg","pointermove",{"clientX":x,"clientY":y,"pointerType":"touch","bubbles":True})
                    else: pg.mouse.move(x,y)
                    pg.wait_for_timeout(70)
                    if tag=="d": frames.append(Image.open(io.BytesIO(m.screenshot())).convert("RGB"))
            m.screenshot(path=f"{tag}_3d.png")
            if frames:
                w,h=frames[0].size;fr=[x.resize((int(w*.6),int(h*.6))) for x in frames]
                fr[0].save("map3d.gif",save_all=True,append_images=fr[1:],duration=90,loop=0,optimize=True)
            info=pg.evaluate("""()=>{const g=[...document.querySelectorAll('#out .ak-node')];const sc=g.map(e=>{const t=e.getAttribute('transform')||'';const m=/scale\\(([\\d.]+)\\)/.exec(t);return m?+m[1]:1});return {n:g.length,minScale:Math.min(...sc),maxScale:Math.max(...sc)}}""")
            pg.mouse.move(5,5);pg.wait_for_timeout(2500)
            info2=pg.evaluate("""()=>{const g=[...document.querySelectorAll('#out .ak-node')];const sc=g.map(e=>{const m=/scale\\(([\\d.]+)\\)/.exec(e.getAttribute('transform')||'');return m?+m[1]:1});return {minScale:Math.min(...sc),maxScale:Math.max(...sc)}}""")
            note(tag+"_3d",{"active":info,"after_leave":info2,"errs":errs})
            # node click still works
            idx=pg.evaluate("()=>{const a=[...document.querySelectorAll('#out .akmap .ak-node')];let bi=0,br=0;a.forEach((g,i)=>{const r=+g.querySelector('.ak-core').getAttribute('r');if(r>br){br=r;bi=i;}});return bi;}")
            pg.locator("#out .akmap .ak-node").nth(idx).click(force=True);pg.wait_for_timeout(500)
            note(tag+"_card",{"visible":pg.locator("#out .ak-card").is_visible()})
        except Exception as e: note(tag+"_err",{"e":str(e)[:300],"errs":errs})
        ctx.close()
    b.close()
srv.terminate()
