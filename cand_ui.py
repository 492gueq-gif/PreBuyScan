import json,sys,subprocess,time,base64
from playwright.sync_api import sync_playwright
srv=subprocess.Popen([sys.executable,"-m","http.server","8765","-d","candidate"]);time.sleep(1)
T="0x39db" # placeholder replaced below
T="0xa01ff10774cfe53c3fbc1d7d124c42e19f6afcbd"
def note(tag,obj):
    s=json.dumps(obj,ensure_ascii=False);open("notes.txt","a").write(tag+" "+s+"\n");print(tag,s[:1500])
with sync_playwright() as p:
    b=p.chromium.launch()
    for vw,vh,tag in [(1600,1000,"d"),(390,844,"m")]:
        pg=b.new_page(viewport={"width":vw,"height":vh});errs=[];csp=[]
        pg.on("pageerror",lambda e:errs.append(str(e)[:300]));pg.on("console",lambda m:csp.append(m.text[:200]) if "Content Security Policy" in m.text or "Refused" in m.text else None)
        pg.goto("http://localhost:8765/?t="+T)
        pg.wait_for_selector("#out .scanring",timeout=60000);pg.wait_for_timeout(600);pg.screenshot(path=f"{tag}_ring0.png")
        try:
            pg.wait_for_selector("#out .rcard .scanring",timeout=60000);pg.wait_for_timeout(1500)
            el=pg.locator("#out .scanring");el.hover(force=True);pg.mouse.move(*[v+20 for v in (el.bounding_box()["x"],el.bounding_box()["y"])]);pg.wait_for_timeout(300)
            pg.screenshot(path=f"{tag}_ring1.png");el.click();pg.wait_for_timeout(300);note(tag+"_ring",{"text":el.inner_text(),"aria":el.get_attribute("aria-label")})
            el.screenshot(path=f"{tag}_ring_el.png")
        except Exception as e: note(tag+"_ring_err",{"e":str(e)[:200]})
        pg.wait_for_selector("#out .ring:not(.pending)",timeout=240000)
        if tag=="m": pg.click("[data-tab=holders]")
        pg.locator("#out .mapsec").scroll_into_view_if_needed()
        try:
            pg.wait_for_selector("#out .maploading",timeout=20000);pg.locator("#out .mapsec").screenshot(path=f"{tag}_maploading.png")
        except Exception as e: note(tag+"_maploading_err",{"e":str(e)[:200]})
        try:
            pg.wait_for_selector("#out .akmap svg",timeout=150000);pg.wait_for_timeout(3500)
            box=pg.locator("#out .mapsec").bounding_box()
            pg.locator("#out .mapsec").screenshot(path=f"{tag}_map.png")
            nodes=pg.locator("#out .akmap .ak-node")
            info={"nodes":nodes.count(),"links":pg.locator("#out .akmap .ak-links path").count(),"parts":pg.locator("#out .akmap .ak-parts circle").count()}
            # pick biggest node
            idx=pg.evaluate("()=>{const a=[...document.querySelectorAll('#out .akmap .ak-node')];let bi=0,br=0;a.forEach((g,i)=>{const r=+g.querySelector('.ak-core').getAttribute('r');if(r>br){br=r;bi=i;}});return bi;}")
            n=nodes.nth(idx);n.hover(force=True);pg.wait_for_timeout(400);pg.locator("#out .akmap").screenshot(path=f"{tag}_map_hover.png")
            n.click(force=True);pg.wait_for_timeout(600);pg.locator("#out .akmap").screenshot(path=f"{tag}_map_card.png")
            info["card"]=pg.locator("#out .ak-card").inner_text()[:300]
            # particle motion check
            p1=pg.evaluate("()=>{const c=document.querySelector('#out .ak-parts circle');return c?[c.getAttribute('cx'),c.getAttribute('cy')]:null}");pg.wait_for_timeout(500)
            p2=pg.evaluate("()=>{const c=document.querySelector('#out .ak-parts circle');return c?[c.getAttribute('cx'),c.getAttribute('cy')]:null}")
            info["moving"]=p1!=p2;info["scrollW"]=pg.evaluate("document.documentElement.scrollWidth")
            pg.click("#out .ak-tools button[title='Acercar']");pg.wait_for_timeout(400)
            note(tag+"_map",info)
        except Exception as e: note(tag+"_map_err",{"e":str(e)[:300]})
        if tag=="d":
            pg.evaluate("window.scrollTo(0,0)");pg.wait_for_timeout(300);pg.screenshot(path="d_full.png",full_page=True)
            lay=pg.evaluate("""()=>{const r=s=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();return [Math.round(b.left),Math.round(b.top+scrollY),Math.round(b.width),Math.round(b.height)]};return {chart:r('#out .a-chart'),sec:r('#out .a-sec'),map:r('#out .a-map'),sim:r('#out .a-sim')}}""")
            note("d_layout",lay)
        note(tag+"_errs",{"errs":errs,"csp":csp[:5]})
        pg.close()
    b.close()
srv.terminate()
